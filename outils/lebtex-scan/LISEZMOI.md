# Lebtex Scan

Le petit programme qui permet au bouton « Scanner avec l'imprimante » de /stock (caisse, règlement
client, paiement d'une facture) de piloter le scanner du PC de caisse.

## Installer — une fois par PC de caisse

1. Copier ce dossier sur le PC, imprimante branchée et allumée : clé USB, ou `LebtexScan.zip` par
   WhatsApp (Gmail refuse ce genre de fichier). Un .zip s'extrait d'abord : clic droit → « Extraire
   tout ».
2. Double-cliquer sur `installer.cmd`. Pas besoin d'être administrateur. Si Windows prévient que le
   fichier vient d'Internet (« Windows a protégé votre ordinateur »), cliquer sur « Informations
   complémentaires » puis « Exécuter quand même ».
3. Une icône bleu nuit et or apparaît près de l'horloge. Clic droit → « Essayer un scan » : l'image
   scannée s'ouvre.
4. Dans /stock, au premier clic sur « Scanner », Chrome demande d'autoriser l'accès aux appareils du
   réseau local : cliquer sur « Autoriser ».

Le programme démarre ensuite tout seul avec Windows.

## Impression directe

L'installation pose aussi sur le Bureau un raccourci **« Lebtex Stock »** : il ouvre /stock dans
Chrome (ou Edge) avec l'impression directe. Chaque bouton « Imprimer » part alors sur l'imprimante
par défaut de Windows, sans fenêtre d'aperçu. Ouvrir /stock par ce raccourci, pas par un Chrome
ordinaire. Ce navigateur a son propre profil : la permission « réseau local » s'y redonne une fois.
Pour changer d'imprimante : Paramètres Windows → Imprimantes → définir par défaut (et décocher
« Laisser Windows gérer mon imprimante par défaut »).

## Scanner une pièce

Poser le chèque ou la LC face contre la vitre, calé dans le coin marqué d'une flèche. Seul le haut
de la vitre (11 cm) est scanné : c'est plus rapide. Si l'image sort à l'envers, « Retourner ».

## En cas de souci

- « Scanner non détecté sur ce poste » : le programme ne tourne pas. Relancer `installer.cmd`, ou
  redémarrer le PC.
- « L'imprimante ne répond pas » : l'allumer et vérifier son câble. Windows doit la voir dans
  l'application « Télécopie et numérisation Windows ».
- Les erreurs sont notées dans `%LOCALAPPDATA%\LebtexScan\journal.txt`.
- Pour retirer le programme : `desinstaller.cmd`.

## Comment ça marche

Une page web ne peut pas piloter un scanner. Le programme le fait à sa place : il écoute sur ce PC
seulement (`127.0.0.1:47300`), ne répond qu'aux pages Lebtex (liste `ORIGINES` de `LebtexScan.cs`,
à compléter si le site change d'adresse), lance le scan par WIA — le service de numérisation de
Windows — et renvoie l'image. Aucune image n'est gardée sur le PC.

Il est exécuté par PowerShell plutôt qu'en `.exe` : un `.exe` maison non signé est mis en bac à
sable par les antivirus (Avast l'a fait au premier essai, le programme devenait injoignable).
