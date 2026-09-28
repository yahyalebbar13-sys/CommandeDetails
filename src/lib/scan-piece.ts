/**
 * L'image de la pièce remise en paiement (chèque, LC, effet) : scannée par l'imprimante, ou prise
 * en photo.
 *
 * Une page web ne peut pas piloter un scanner. C'est le programme « Lebtex Scan »
 * (outils/lebtex-scan), lancé avec Windows sur le PC relié à l'imprimante, qui le fait : il
 * n'écoute que sur ce PC (127.0.0.1) et ne répond qu'aux pages Lebtex. À la première utilisation,
 * Chrome demande d'autoriser l'accès aux appareils du réseau local : c'est ce programme qu'il vise,
 * il faut accepter.
 *
 * Toute image — scannée, photographiée ou choisie — ressort réduite (JPEG, 1600 px au plus). Elle
 * est enregistrée DANS le document du règlement, que Firestore plafonne à 1 Mo : une photo de
 * téléphone brute (3 à 5 Mo) faisait échouer toute la vente.
 */

const PROGRAMME = 'http://127.0.0.1:47300';

export const AIDE_PROGRAMME_ABSENT =
  "Le programme Lebtex Scan ne répond pas sur ce poste. Il doit tourner sur le PC relié à " +
  "l'imprimante (icône bleu nuit et or près de l'horloge). Si Chrome a demandé l'accès au réseau " +
  'local, il faut l\'autoriser.';

export type EtatScanner =
  | { etat: 'pret'; scanner: string }
  /** Le programme tourne, mais Windows ne voit aucun scanner : imprimante éteinte ou débranchée. */
  | { etat: 'sans-scanner' }
  /** Le programme ne répond pas : normal sur un téléphone, une tablette ou un PC sans imprimante. */
  | { etat: 'absent' };

/** Erreur dont le message s'affiche tel quel sous le bouton. */
export class ErreurScan extends Error {}

function appeler(chemin: string, init: RequestInit, delaiMs: number): Promise<Response> {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), delaiMs);
  return fetch(PROGRAMME + chemin, { ...init, cache: 'no-store', signal: controle.signal })
    .finally(() => clearTimeout(minuterie));
}

// Deux lignes chèque à l'écran demandent l'état en même temps : une seule question part.
let etatEnCours: Promise<EtatScanner> | null = null;

export function lireEtatScanner(): Promise<EtatScanner> {
  if (!etatEnCours) {
    etatEnCours = (async (): Promise<EtatScanner> => {
      try {
        // Délai large : la première fois, la requête attend la réponse à la demande d'accès au
        // réseau local de Chrome. Sans le programme, elle échoue tout de suite.
        const reponse = await appeler('/statut', { method: 'GET' }, 20_000);
        if (!reponse.ok) return { etat: 'absent' };
        const donnees = await reponse.json();
        const premier = Array.isArray(donnees?.scanners) ? donnees.scanners[0] : null;
        return premier ? { etat: 'pret', scanner: String(premier.nom || 'Scanner') } : { etat: 'sans-scanner' };
      } catch {
        return { etat: 'absent' };
      }
    })();
    etatEnCours.finally(() => setTimeout(() => { etatEnCours = null; }, 1500));
  }
  return etatEnCours;
}

/** Lance le scan sur l'imprimante et rend l'image réduite, en data URL JPEG. */
export async function scannerAvecImprimante(): Promise<string> {
  let reponse: Response;
  try {
    reponse = await appeler('/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lebtex-Scan': '1' },
      // 200 ppp en couleur : montant et numéro se lisent, l'image reste légère. La zone « pièce »
      // ne scanne que le haut de la vitre, là où l'on cale le chèque.
      body: JSON.stringify({ dpi: 200, couleur: true, zone: 'piece' }),
    }, 150_000);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new ErreurScan("Le scanner n'a pas répondu à temps. Vérifiez l'imprimante, puis réessayez.");
    }
    throw new ErreurScan(AIDE_PROGRAMME_ABSENT);
  }
  if (!reponse.ok) {
    let message = `Le scan a échoué (erreur ${reponse.status}).`;
    try {
      const donnees = await reponse.json();
      if (donnees?.erreur) message = String(donnees.erreur);
    } catch {
      // réponse sans détail : le message générique suffit
    }
    throw new ErreurScan(message);
  }
  return reduireImage(await reponse.blob());
}

/**
 * Poids maximum de l'image, en caractères de data URL : avec le reste du règlement, le document
 * doit rester sous le 1 Mo de Firestore.
 */
const PLAFOND_IMAGE = 700 * 1024;

/** Réduit une image (scan, photo, fichier) en JPEG de `coteMax` pixels au plus sur son grand côté. */
export async function reduireImage(source: Blob, coteMax = 1600, qualite = 0.8): Promise<string> {
  let image: ImageBitmap;
  try {
    // « from-image » : une photo de téléphone prise en portrait reste droite.
    image = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new ErreurScan("Cette image n'a pas pu être lue. Utilisez une photo JPG ou PNG.");
  }
  try {
    // Une photo très détaillée dépasse le plafond : on baisse la qualité, puis la taille.
    let cote = coteMax;
    let q = qualite;
    for (let essai = 0; ; essai++) {
      const dataUrl = dessinerEnJpeg(image, cote, q);
      if (dataUrl.length <= PLAFOND_IMAGE || essai >= 6) return dataUrl;
      if (q > 0.6) q = Math.round((q - 0.1) * 10) / 10;
      else cote = Math.round(cote * 0.8);
    }
  } finally {
    image.close();
  }
}

function dessinerEnJpeg(image: ImageBitmap, coteMax: number, qualite: number): string {
  const echelle = Math.min(1, coteMax / Math.max(image.width, image.height));
  const largeur = Math.max(1, Math.round(image.width * echelle));
  const hauteur = Math.max(1, Math.round(image.height * echelle));
  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext('2d');
  if (!contexte) throw new ErreurScan("Le navigateur n'a pas pu préparer l'image.");
  // Fond blanc : un PNG transparent virerait au noir en JPEG.
  contexte.fillStyle = '#ffffff';
  contexte.fillRect(0, 0, largeur, hauteur);
  contexte.drawImage(image, 0, 0, largeur, hauteur);
  return toile.toDataURL('image/jpeg', qualite);
}

/** Fait faire un demi-tour à l'image : une pièce posée tête-bêche sur la vitre. */
export async function retournerImage(dataUrl: string): Promise<string> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  } catch {
    throw new ErreurScan("L'image n'a pas pu être retournée.");
  }
  try {
    const toile = document.createElement('canvas');
    toile.width = image.width;
    toile.height = image.height;
    const contexte = toile.getContext('2d');
    if (!contexte) throw new ErreurScan("Le navigateur n'a pas pu préparer l'image.");
    contexte.translate(image.width, image.height);
    contexte.rotate(Math.PI);
    contexte.drawImage(image, 0, 0);
    return toile.toDataURL('image/jpeg', 0.85);
  } finally {
    image.close();
  }
}
