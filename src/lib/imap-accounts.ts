// ─── Comptes IMAP des deux sociétés ───────────────────────────────────────────
// Serveur uniquement : ce module lit des variables d'environnement contenant des
// mots de passe applicatifs — ne jamais l'importer depuis un composant client.

import { ImapFlow } from 'imapflow';
import type { AddressObject } from 'mailparser';

export type ImapAccountKey = 'lebtex' | 'robeinbox';

export type ImapAccount = {
  key: ImapAccountKey;
  user: string;
  pass: string;
  label: string;
};

const ACCOUNTS: Record<string, ImapAccount> = {
  lebtex: {
    key: 'lebtex',
    user: process.env.IMAP_USER_LEBTEX || '',
    pass: process.env.IMAP_PASS_LEBTEX || '',
    label: 'LEBTEX',
  },
  robeinbox: {
    key: 'robeinbox',
    user: process.env.IMAP_USER_ROBEINBOX || '',
    pass: process.env.IMAP_PASS_ROBEINBOX || '',
    label: 'ROBE IN BOX',
  },
};

/** Clés des comptes réellement configurés (identifiants présents). */
export function configuredAccountKeys(): ImapAccountKey[] {
  return (Object.keys(ACCOUNTS) as ImapAccountKey[]).filter(
    k => !!ACCOUNTS[k].user && !!ACCOUNTS[k].pass
  );
}

/** Retourne le compte demandé, ou null s'il est inconnu ou non configuré. */
export function getImapAccount(key: string | null | undefined): ImapAccount | null {
  if (!key) return null;
  const account = ACCOUNTS[key];
  if (!account || !account.user || !account.pass) return null;
  return account;
}

// Le certificat d'imap.gmail.com est vérifié par défaut. Sur un poste dont
// l'antivirus inspecte le TLS, poser IMAP_ALLOW_INSECURE_TLS=1 en local (jamais
// en production) pour lever la vérification.
const verifyTls = process.env.IMAP_ALLOW_INSECURE_TLS !== '1';

/** Client IMAP prêt à connecter pour ce compte. */
export function createImapClient(account: ImapAccount): ImapFlow {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
    tls: { rejectUnauthorized: verifyTls },
  });
}

// ─── Lecture des en-têtes d'adresses ──────────────────────────────────────────
/**
 * Texte d'un en-tête From/To/Cc. mailparser renvoie un objet pour un seul
 * groupe d'adresses, mais un tableau dès qu'il y en a plusieurs.
 */
export function addressText(
  addr: AddressObject | AddressObject[] | undefined
): string {
  if (!addr) return '';
  if (Array.isArray(addr)) return addr.map(a => a.text).filter(Boolean).join(', ');
  return addr.text || '';
}
