// ─── Espace client : demandes à LEBTEX ────────────────────────────────────────
// GET  : les demandes du client, avec leur suivi (envoyée, prise en charge, traitée).
// POST : une nouvelle demande — recommander, livraison / retrait, question.
// Le client est identifié par son jeton, jamais par le corps de la requête ; il
// ne peut citer que ses propres commandes. Chaque demande est annoncée par
// e-mail à l'administrateur (la boîte Gmail de l'alerte de stock bas), APRÈS
// la réponse : un Gmail lent ou muet ne fait jamais attendre le client.

import { NextResponse, after } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyClient } from '@/lib/require-client';
import { dbAdmin } from '@/lib/firebase-admin-serveur';
import { construirePortail } from '@/lib/portail-client-donnees';
import { lireDonneesAdmin } from '@/lib/portail-client-cache';
import { LIBELLE_DEMANDE, validerDemande, type DemandeEnregistree } from '@/lib/demandes-client';

export const dynamic = 'force-dynamic';

/** Au-delà, c'est un emballement, pas un client : on refuse poliment. */
const MAX_PAR_HEURE = 10;
const FENETRE_MS = 3600_000;

/** Compteur de demandes d'un client : `users/{admin}/demandesClientQuota/{clientUid}`. */
type Quota = { debut: string; nombre: number };

export async function GET(req: Request) {
  const check = await verifyClient(req);
  if (!check.ok) return check.response;
  try {
    const snap = await dbAdmin().collection(`users/${check.adminUid}/demandesClient`)
      .where('clientUid', '==', check.uid).get();
    const demandes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }) as DemandeEnregistree)
      .sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)))
      .map(({ clientUid: _u, ...reste }) => reste);
    return NextResponse.json({ demandes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('[client/demandes GET] Error:', err);
    return NextResponse.json({ error: 'Vos demandes sont momentanément indisponibles' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const check = await verifyClient(req);
  if (!check.ok) return check.response;

  let brut: any;
  try { brut = await req.json(); } catch { return NextResponse.json({ error: 'Requête illisible' }, { status: 400 }); }

  try {
    const db = dbAdmin();
    const base = `users/${check.adminUid}`;
    const donnees = await lireDonneesAdmin(db, check.adminUid);
    const { commandes } = construirePortail({ client: check.clientName, alias: check.aliases, ...donnees });
    const parId = new Map(commandes.map(c => [c.id, c]));

    const v = validerDemande(brut, new Set(parId.keys()));
    if (!v.ok) return NextResponse.json({ error: v.erreur }, { status: 400 });

    const resume = (v.demande.commandes || []).map(id => {
      const c = parId.get(id)!;
      return `${c.nom} — ${c.quantite} ${c.unite || ''}`.trim();
    });
    const ref = db.collection(`${base}/demandesClient`).doc();
    const demande: Omit<DemandeEnregistree, 'id'> = {
      ...v.demande,
      clientName: check.clientName,
      clientUid: check.uid,
      statut: 'nouvelle',
      creeLe: new Date().toISOString(),
      ...(resume.length ? { resume } : {}),
    };

    // Compteur et demande dans la même transaction : dix envois simultanés ne
    // peuvent plus tous passer en lisant chacun « 9 demandes cette heure ».
    // Fenêtre fixe d'une heure, ouverte par la première demande.
    const quotaRef = db.doc(`${base}/demandesClientQuota/${check.uid}`);
    const acceptee = await db.runTransaction(async tx => {
      const snap = await tx.get(quotaRef);
      const q = (snap.exists ? snap.data() : undefined) as Partial<Quota> | undefined;
      const maintenant = Date.now();
      const debut = Date.parse(String(q?.debut ?? ''));
      // Un début loin dans le futur (horloge faussée) ne doit pas bloquer
      // indéfiniment ; une minute d'écart entre instances reste tolérée.
      const enCours = Number.isFinite(debut) && debut - maintenant < 60_000 && maintenant - debut < FENETRE_MS;
      const nombre = enCours ? Math.max(0, Number(q?.nombre) || 0) : 0;
      if (nombre >= MAX_PAR_HEURE) return false;
      const quota: Quota = { debut: enCours ? String(q!.debut) : new Date(maintenant).toISOString(), nombre: nombre + 1 };
      tx.set(quotaRef, quota);
      tx.set(ref, demande);
      return true;
    });
    if (!acceptee) {
      return NextResponse.json({ error: 'Beaucoup de demandes en peu de temps — réessayez dans un moment, ou appelez-nous.' }, { status: 429 });
    }

    // L'e-mail part une fois la réponse rendue ; son échec ne touche pas la demande, déjà enregistrée.
    const envoyer = () => prevenirAdmin(check.clientName, check.email, demande)
      .catch(e => console.error('[client/demandes] e-mail :', e));
    try {
      after(envoyer);
    } catch {
      // Hors du cadre d'une requête (ne devrait pas arriver) : envoi détaché.
      void envoyer();
    }

    const { clientUid: _u, ...pourLeClient } = demande;
    return NextResponse.json({ success: true, demande: { id: ref.id, ...pourLeClient } });
  } catch (err: any) {
    console.error('[client/demandes POST] Error:', err);
    return NextResponse.json({ error: "La demande n'a pas pu être envoyée — réessayez." }, { status: 500 });
  }
}

const echapper = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function prevenirAdmin(client: string, emailClient: string, d: Omit<DemandeEnregistree, 'id'>) {
  const gmailUser = process.env.GMAIL_USER;
  const appPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !appPass) return;
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: gmailUser, pass: appPass },
    // Sans délais, un serveur SMTP muet tiendrait la fonction ouverte indéfiniment.
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
  });
  const details = [
    d.quantite !== undefined ? `Quantité souhaitée : <strong>${echapper(d.quantite)}</strong>` : '',
    d.mode ? `Mode : <strong>${d.mode === 'retrait' ? 'retrait au dépôt' : 'livraison'}</strong>` : '',
    d.dateSouhaitee ? `Date souhaitée : <strong>${echapper(d.dateSouhaitee.split('-').reverse().join('/'))}</strong>` : '',
    d.message ? `Message :<br><em>${echapper(d.message).replace(/\n/g, '<br>')}</em>` : '',
  ].filter(Boolean).join('<br>');
  await transporter.sendMail({
    from: `"LEBTEX — Espace client" <${gmailUser}>`,
    to: gmailUser,
    ...(emailClient ? { replyTo: emailClient } : {}),
    subject: `🧾 ${LIBELLE_DEMANDE[d.type]} — ${client}`,
    html: `<div style="font-family:Arial,sans-serif;color:#111827">
      <p style="font-size:15px"><strong>${echapper(client)}</strong> vient d'envoyer une demande depuis son espace client :
      <strong>${LIBELLE_DEMANDE[d.type]}</strong>.</p>
      ${d.resume?.length ? `<ul>${d.resume.map(r => `<li>${echapper(r)}</li>`).join('')}</ul>` : ''}
      <p>${details}</p>
      <p style="color:#6B7280;font-size:12px">À traiter dans /gestion → Demandes clients. Répondre à cet e-mail écrit directement au client.</p>
    </div>`,
  });
}
