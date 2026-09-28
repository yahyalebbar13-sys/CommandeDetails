// ─── Lebtex Scan ─────────────────────────────────────────────────────────────
// Le pont entre /stock et le scanner de l'imprimante du poste de caisse.
//
// Une page web n'a pas le droit de piloter un scanner. Ce petit programme, lancé
// avec Windows, le fait à sa place : /stock lui demande un scan, il le lance par
// WIA (le service de numérisation de Windows, celui qu'utilise l'application
// « Scan ») et renvoie l'image en JPEG. N'importe quel scanner reconnu par
// Windows convient, en USB comme en réseau.
//
// Sécurité : il n'écoute que sur ce PC (127.0.0.1, injoignable depuis le réseau),
// ne répond qu'aux pages Lebtex (ORIGINES) et exige l'en-tête X-Lebtex-Scan pour
// scanner. Cet en-tête oblige le navigateur à lui demander la permission avant
// d'envoyer la requête : un autre site ne peut pas déclencher de scan. Aucune
// image n'est gardée sur le PC.
//
// Compilé en mémoire au démarrage par LebtexScan.ps1, avec le compilateur C# livré
// avec Windows (.NET Framework 4) : d'où la syntaxe C# 5 (ni $"...", ni ?.).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace LebtexScan
{
    /// <summary>Erreur renvoyée telle quelle à /stock, avec son code HTTP.</summary>
    class ErreurScan : Exception
    {
        public readonly int Code;
        public ErreurScan(int code, string message) : base(message) { Code = code; }
    }

    class ParametresScan
    {
        public int Dpi = 200;
        public bool Couleur = true;
        /// <summary>0 = toute la largeur de la vitre.</summary>
        public double LargeurMm = 0;
        /// <summary>
        /// 0 = toute la longueur de la vitre. 110 mm couvrent un chèque ou une LCN posés dans le
        /// coin de la flèche : la tête ne parcourt que ce bout de vitre, le scan va trois fois plus vite.
        /// </summary>
        public double HauteurMm = 110;
        public int QualiteJpeg = 80;
    }

    public static class Programme
    {
        const int PORT = 47300;
        const string VERSION = "1.0";

        /// <summary>Les pages autorisées à parler au programme : le site, et le serveur de développement.</summary>
        static readonly string[] ORIGINES = {
            "https://www.lebtex.ma",
            "https://lebtex.ma",
            "http://localhost:9002",
            "http://localhost:9003",
        };

        // Identifiants WIA (wiadef.h)
        const int WIA_SCANNER = 1;
        const int WIA_NOM = 7;                  // WIA_DIP_DEV_NAME
        const int WIA_TYPE_DONNEES = 4103;      // WIA_IPA_DATATYPE : 2 gris, 3 couleur
        const int WIA_PROFONDEUR = 4104;        // WIA_IPA_DEPTH
        const int WIA_INTENTION = 6146;         // WIA_IPS_CUR_INTENT : 1 couleur, 2 gris
        const int WIA_RESOLUTION_X = 6147;
        const int WIA_RESOLUTION_Y = 6148;
        const int WIA_DEBUT_X = 6149;
        const int WIA_DEBUT_Y = 6150;
        const int WIA_ETENDUE_X = 6151;
        const int WIA_ETENDUE_Y = 6152;
        const string FORMAT_BMP = "{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}";

        static readonly string DOSSIER = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LebtexScan");

        static int scanEnCours = 0;
        static NotifyIcon icone;
        static SynchronizationContext contexteUi;

        /// <summary>Appelé par LebtexScan.ps1, sur le fil STA de PowerShell.</summary>
        public static void Main(string[] args)
        {
            TcpListener ecoute;
            try
            {
                ecoute = new TcpListener(IPAddress.Loopback, PORT);
                ecoute.Start();
            }
            catch (SocketException)
            {
                // Le port est pris : le programme tourne déjà. On n'en lance pas un second.
                return;
            }

            Application.EnableVisualStyles();
            var menu = new ContextMenuStrip();
            contexteUi = SynchronizationContext.Current;

            var titre = new ToolStripMenuItem("Lebtex Scan " + VERSION);
            titre.Enabled = false;
            var etat = new ToolStripMenuItem("Recherche du scanner...");
            etat.Enabled = false;
            menu.Items.Add(titre);
            menu.Items.Add(etat);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Essayer un scan", null, delegate { ThreadPool.QueueUserWorkItem(delegate { EssayerUnScan(); }); });
            menu.Items.Add("Quitter", null, delegate { icone.Visible = false; Application.Exit(); });
            menu.Opening += delegate { etat.Text = LibelleEtat(); };

            icone = new NotifyIcon();
            icone.Icon = DessinerIcone();
            icone.Text = "Lebtex Scan";
            icone.ContextMenuStrip = menu;
            icone.Visible = true;

            var fil = new Thread(delegate () { Ecouter(ecoute); });
            fil.IsBackground = true;
            fil.Start();
            ThreadPool.QueueUserWorkItem(delegate { LibelleEtat(); });

            if (Array.IndexOf(args, "--bienvenue") >= 0)
            {
                icone.ShowBalloonTip(8000, "Lebtex Scan est prêt",
                    "Le bouton « Scanner avec l'imprimante » de /stock passe par ce programme. Il démarrera avec Windows.",
                    ToolTipIcon.Info);
            }

            Application.Run();
            icone.Visible = false;
        }

        // ── Serveur local ─────────────────────────────────────────────────────

        static void Ecouter(TcpListener ecoute)
        {
            while (true)
            {
                TcpClient client;
                try { client = ecoute.AcceptTcpClient(); }
                catch (Exception e) { Journal("écoute : " + e.Message); Thread.Sleep(1000); continue; }
                ThreadPool.QueueUserWorkItem(delegate { Servir(client); });
            }
        }

        static void Servir(TcpClient client)
        {
            try
            {
                using (client)
                {
                    client.ReceiveTimeout = 10000;
                    client.SendTimeout = 30000;
                    NetworkStream flux = client.GetStream();

                    string methode, chemin;
                    Dictionary<string, string> entetes;
                    byte[] corps;
                    if (!LireRequete(flux, out methode, out chemin, out entetes, out corps)) return;

                    string origine;
                    entetes.TryGetValue("Origin", out origine);
                    bool origineConnue = origine != null && Array.IndexOf(ORIGINES, origine) >= 0;
                    // Une page d'un autre site n'obtient rien, pas même l'état du scanner.
                    if (origine != null && !origineConnue)
                    {
                        RepondreJson(flux, 403, null, Erreur("Origine non autorisée."));
                        return;
                    }
                    string autorisee = origineConnue ? origine : null;

                    int point = chemin.IndexOf('?');
                    if (point >= 0) chemin = chemin.Substring(0, point);

                    if (methode == "OPTIONS")
                    {
                        RepondrePreflight(flux, autorisee);
                    }
                    else if (methode == "GET" && (chemin == "/" || chemin == "/statut"))
                    {
                        RepondreJson(flux, 200, autorisee, Statut());
                    }
                    else if (methode == "POST" && chemin == "/scan")
                    {
                        string marque;
                        if (autorisee == null || !entetes.TryGetValue("X-Lebtex-Scan", out marque) || marque != "1")
                        {
                            RepondreJson(flux, 403, autorisee, Erreur("Requête refusée."));
                            return;
                        }
                        Scan(flux, autorisee, corps);
                    }
                    else
                    {
                        RepondreJson(flux, 404, autorisee, Erreur("Adresse inconnue."));
                    }
                }
            }
            catch (Exception e)
            {
                Journal("requête : " + e.Message);
            }
        }

        static Dictionary<string, object> Statut()
        {
            var reponse = new Dictionary<string, object>();
            reponse["programme"] = "Lebtex Scan";
            reponse["version"] = VERSION;
            reponse["occupe"] = scanEnCours != 0;
            try
            {
                List<Dictionary<string, object>> scanners = SurFilSta(() => ListerScanners(), 15000);
                reponse["scanners"] = scanners;
                MettreAJourInfoBulle(scanners.Count > 0 ? (string)scanners[0]["nom"] : null);
            }
            catch (Exception e)
            {
                reponse["scanners"] = new List<Dictionary<string, object>>();
                reponse["erreur"] = e is ErreurScan ? e.Message : Traduire(e);
            }
            return reponse;
        }

        static void Scan(Stream flux, string origine, byte[] corps)
        {
            if (Interlocked.CompareExchange(ref scanEnCours, 1, 0) != 0)
            {
                RepondreJson(flux, 423, origine, Erreur("Un scan est déjà en cours sur ce poste : attendez qu'il se termine."));
                return;
            }
            try
            {
                ParametresScan p = LireParametres(corps);
                string nom = null;
                byte[] jpeg = SurFilSta(() => Numeriser(p, out nom), 120000);
                MettreAJourInfoBulle(nom);
                Repondre(flux, 200, origine, "image/jpeg", jpeg);
            }
            catch (ErreurScan e)
            {
                Journal("scan : " + e.Message);
                RepondreJson(flux, e.Code, origine, Erreur(e.Message));
            }
            catch (Exception e)
            {
                Journal("scan : " + e);
                RepondreJson(flux, 500, origine, Erreur(Traduire(e)));
            }
            finally
            {
                Interlocked.Exchange(ref scanEnCours, 0);
            }
        }

        static ParametresScan LireParametres(byte[] corps)
        {
            var p = new ParametresScan();
            if (corps == null || corps.Length == 0) return p;
            try
            {
                var json = new JavaScriptSerializer().DeserializeObject(Encoding.UTF8.GetString(corps)) as Dictionary<string, object>;
                if (json == null) return p;
                object v;
                if (json.TryGetValue("dpi", out v)) p.Dpi = Borne(Convert.ToInt32(v), 75, 600);
                if (json.TryGetValue("couleur", out v)) p.Couleur = Convert.ToBoolean(v);
                if (json.TryGetValue("zone", out v) && Convert.ToString(v) == "page") { p.LargeurMm = 0; p.HauteurMm = 0; }
                if (json.TryGetValue("largeurMm", out v)) p.LargeurMm = Math.Max(0, Convert.ToDouble(v));
                if (json.TryGetValue("hauteurMm", out v)) p.HauteurMm = Math.Max(0, Convert.ToDouble(v));
                if (json.TryGetValue("qualite", out v)) p.QualiteJpeg = Borne(Convert.ToInt32(v), 40, 95);
            }
            catch (Exception)
            {
                throw new ErreurScan(400, "Paramètres de scan illisibles.");
            }
            return p;
        }

        // ── Numérisation (WIA) ────────────────────────────────────────────────

        static dynamic Gestionnaire()
        {
            Type type = Type.GetTypeFromProgID("WIA.DeviceManager");
            if (type == null) throw new ErreurScan(500, "Le service de numérisation de Windows (WIA) est absent de ce PC.");
            return Activator.CreateInstance(type);
        }

        static List<Dictionary<string, object>> ListerScanners()
        {
            var liste = new List<Dictionary<string, object>>();
            foreach (dynamic info in Gestionnaire().DeviceInfos)
            {
                if ((int)info.Type != WIA_SCANNER) continue;
                var scanner = new Dictionary<string, object>();
                scanner["id"] = (string)info.DeviceID;
                scanner["nom"] = NomAppareil(info);
                liste.Add(scanner);
            }
            return liste;
        }

        static byte[] Numeriser(ParametresScan p, out string nomScanner)
        {
            dynamic info = null;
            foreach (dynamic candidat in Gestionnaire().DeviceInfos)
            {
                if ((int)candidat.Type == WIA_SCANNER) { info = candidat; break; }
            }
            if (info == null)
                throw new ErreurScan(409, "Aucun scanner trouvé : l'imprimante est-elle allumée et branchée à ce PC ?");
            nomScanner = NomAppareil(info);

            dynamic appareil;
            try { appareil = info.Connect(); }
            catch (Exception e) { throw new ErreurScan(409, Traduire(e)); }

            dynamic source = null;
            foreach (dynamic element in appareil.Items) { source = element; break; }
            if (source == null) throw new ErreurScan(500, "Le scanner ne propose aucune source de numérisation.");

            dynamic props = source.Properties;
            // L'intention d'abord : sur certains pilotes elle remet résolution et zone à leurs valeurs par défaut.
            if (!Essayer(delegate { Regler(props, WIA_INTENTION, p.Couleur ? 1 : 2); }))
            {
                Essayer(delegate { Regler(props, WIA_TYPE_DONNEES, p.Couleur ? 3 : 2); });
                Essayer(delegate { Regler(props, WIA_PROFONDEUR, p.Couleur ? 24 : 8); });
            }
            // Un pilote qui refuse un réglage scanne avec le sien : mieux vaut une image moins
            // bien cadrée que pas d'image du tout.
            Essayer(delegate { Regler(props, WIA_RESOLUTION_X, p.Dpi); });
            Essayer(delegate { Regler(props, WIA_RESOLUTION_Y, p.Dpi); });
            int dpiX = ValeurEntiere(props, WIA_RESOLUTION_X, p.Dpi);
            int dpiY = ValeurEntiere(props, WIA_RESOLUTION_Y, p.Dpi);
            Essayer(delegate { Regler(props, WIA_DEBUT_X, 0); });
            Essayer(delegate { Regler(props, WIA_DEBUT_Y, 0); });
            // La zone se donne en pixels à la résolution retenue ; Regler la borne à la taille de la vitre.
            int largeur = p.LargeurMm > 0 ? MmEnPixels(p.LargeurMm, dpiX) : int.MaxValue;
            int hauteur = p.HauteurMm > 0 ? MmEnPixels(p.HauteurMm, dpiY) : int.MaxValue;
            Essayer(delegate { Regler(props, WIA_ETENDUE_X, largeur); });
            Essayer(delegate { Regler(props, WIA_ETENDUE_Y, hauteur); });

            dynamic image;
            try { image = source.Transfer(FORMAT_BMP); }
            catch (Exception e)
            {
                // Un pilote qui refuse le BMP rend son format par défaut ; une vraie panne échouera de nouveau.
                Journal("transfert BMP refusé : " + Traduire(e));
                try { image = source.Transfer(); }
                catch (Exception e2) { throw new ErreurScan(500, Traduire(e2)); }
            }
            byte[] brut = (byte[])image.FileData.BinaryData;
            return EnJpeg(brut, p.QualiteJpeg);
        }

        static string NomAppareil(dynamic info)
        {
            dynamic propriete = Propriete(info.Properties, WIA_NOM);
            return propriete == null ? "Scanner" : Convert.ToString(propriete.Value);
        }

        /// <summary>Valeur actuelle d'une propriété, ou `parDefaut` si le pilote ne l'expose pas.</summary>
        static int ValeurEntiere(dynamic proprietes, int id, int parDefaut)
        {
            try
            {
                dynamic propriete = Propriete(proprietes, id);
                return propriete == null ? parDefaut : Convert.ToInt32(propriete.Value);
            }
            catch
            {
                return parDefaut;
            }
        }

        static dynamic Propriete(dynamic proprietes, int id)
        {
            foreach (dynamic propriete in proprietes)
            {
                if ((int)propriete.PropertyID == id) return propriete;
            }
            return null;
        }

        /// <summary>
        /// Donne à une propriété WIA la valeur permise la plus proche de celle voulue : bornée si le
        /// pilote annonce une plage, la plus proche s'il annonce une liste (ex. 75, 150, 300 ppp).
        /// </summary>
        static void Regler(dynamic proprietes, int id, int voulu)
        {
            dynamic propriete = Propriete(proprietes, id);
            if (propriete == null) return;
            int valeur = voulu;
            int sousType = 0;
            try { sousType = (int)propriete.SubType; } catch { }
            if (sousType == 1)
            {
                int min = Convert.ToInt32(propriete.SubTypeMin);
                int max = Convert.ToInt32(propriete.SubTypeMax);
                valeur = Math.Max(min, Math.Min(max, voulu));
            }
            else if (sousType == 2)
            {
                int ecart = int.MaxValue;
                foreach (object permise in propriete.SubTypeValues)
                {
                    int n = Convert.ToInt32(permise);
                    long e = Math.Abs((long)n - voulu);
                    if (e < ecart) { ecart = (int)Math.Min(e, int.MaxValue - 1); valeur = n; }
                }
            }
            else if (voulu == int.MaxValue)
            {
                return; // pas de maximum connu : on garde la zone par défaut du pilote (la vitre entière)
            }
            propriete.Value = valeur;
        }

        static int MmEnPixels(double mm, int dpi)
        {
            return (int)Math.Round(mm / 25.4 * dpi);
        }

        static byte[] EnJpeg(byte[] brut, int qualite)
        {
            ImageCodecInfo jpeg = null;
            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders())
            {
                if (codec.MimeType == "image/jpeg") jpeg = codec;
            }
            using (var entree = new MemoryStream(brut))
            using (var image = Image.FromStream(entree))
            using (var sortie = new MemoryStream())
            {
                var parametres = new EncoderParameters(1);
                parametres.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)qualite);
                image.Save(sortie, jpeg, parametres);
                return sortie.ToArray();
            }
        }

        /// <summary>WIA n'aime que les fils STA : chaque appel en a un à lui, avec un délai maximum.</summary>
        static T SurFilSta<T>(Func<T> travail, int delaiMs)
        {
            T resultat = default(T);
            Exception erreur = null;
            var fil = new Thread(delegate ()
            {
                try { resultat = travail(); }
                catch (Exception e) { erreur = e; }
            });
            fil.SetApartmentState(ApartmentState.STA);
            fil.IsBackground = true;
            fil.Start();
            if (!fil.Join(delaiMs))
                throw new ErreurScan(504, "Le scanner ne répond pas. Vérifiez l'imprimante, puis réessayez.");
            if (erreur is TargetInvocationException && erreur.InnerException != null) erreur = erreur.InnerException;
            if (erreur is ErreurScan) throw (ErreurScan)erreur;
            if (erreur != null) throw new ErreurScan(500, Traduire(erreur));
            return resultat;
        }

        static bool Essayer(Action action)
        {
            try { action(); return true; }
            catch { return false; }
        }

        /// <summary>Les erreurs WIA (wia.h) en phrases qu'un caissier comprend.</summary>
        static string Traduire(Exception e)
        {
            if (e is TargetInvocationException && e.InnerException != null) e = e.InnerException;
            var com = e as COMException;
            if (com == null) return "Erreur du scanner : " + e.Message;
            switch ((uint)com.ErrorCode)
            {
                case 0x80210002: return "Bourrage papier dans le scanner.";
                case 0x80210003: return "Le chargeur est vide : posez la pièce sur la vitre.";
                case 0x80210005:
                case 0x8021000A:
                case 0x80210015: return "Le scanner ne répond pas : vérifiez que l'imprimante est allumée et branchée à ce PC.";
                case 0x80210006:
                case 0x8021000D: return "Le scanner est occupé (impression ou autre scan en cours). Réessayez dans un instant.";
                case 0x80210007: return "Le scanner chauffe : réessayez dans quelques secondes.";
                case 0x80210016: return "Le capot du scanner est ouvert.";
                case 0x80210017: return "La lampe du scanner est éteinte.";
                default: return "Erreur du scanner (code 0x" + ((uint)com.ErrorCode).ToString("X8") + ").";
            }
        }

        // ── Réponses HTTP ─────────────────────────────────────────────────────

        static bool LireRequete(Stream flux, out string methode, out string chemin,
            out Dictionary<string, string> entetes, out byte[] corps)
        {
            methode = null; chemin = null; corps = null;
            entetes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            var tampon = new MemoryStream();
            var bloc = new byte[4096];
            int finEntetes = -1;
            while (finEntetes < 0)
            {
                int n = flux.Read(bloc, 0, bloc.Length);
                if (n <= 0) return false;
                tampon.Write(bloc, 0, n);
                if (tampon.Length > 32768) return false;
                finEntetes = ChercherFinEntetes(tampon.GetBuffer(), (int)tampon.Length);
            }

            string[] lignes = Encoding.ASCII.GetString(tampon.GetBuffer(), 0, finEntetes)
                .Split(new[] { "\r\n" }, StringSplitOptions.None);
            string[] premiere = lignes[0].Split(' ');
            if (premiere.Length < 2) return false;
            methode = premiere[0].ToUpperInvariant();
            chemin = premiere[1];
            for (int i = 1; i < lignes.Length; i++)
            {
                int deuxPoints = lignes[i].IndexOf(':');
                if (deuxPoints > 0) entetes[lignes[i].Substring(0, deuxPoints).Trim()] = lignes[i].Substring(deuxPoints + 1).Trim();
            }

            int longueur = 0;
            string valeur;
            if (entetes.TryGetValue("Content-Length", out valeur)) int.TryParse(valeur, out longueur);
            if (longueur < 0 || longueur > 65536) return false;
            corps = new byte[longueur];
            int debut = finEntetes + 4;
            int dejaLu = Math.Min((int)tampon.Length - debut, longueur);
            Array.Copy(tampon.GetBuffer(), debut, corps, 0, dejaLu);
            int lu = dejaLu;
            while (lu < longueur)
            {
                int n = flux.Read(corps, lu, longueur - lu);
                if (n <= 0) return false;
                lu += n;
            }
            return true;
        }

        static int ChercherFinEntetes(byte[] octets, int longueur)
        {
            for (int i = 0; i + 3 < longueur; i++)
            {
                if (octets[i] == 13 && octets[i + 1] == 10 && octets[i + 2] == 13 && octets[i + 3] == 10) return i;
            }
            return -1;
        }

        static void RepondrePreflight(Stream flux, string origine)
        {
            if (origine == null) { Repondre(flux, 403, null, null, null); return; }
            var entetes = new StringBuilder();
            entetes.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            entetes.Append("Access-Control-Allow-Headers: Content-Type, X-Lebtex-Scan\r\n");
            entetes.Append("Access-Control-Max-Age: 600\r\n");
            Repondre(flux, 204, origine, null, null, entetes.ToString());
        }

        static void RepondreJson(Stream flux, int code, string origine, object contenu)
        {
            byte[] corps = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(contenu));
            Repondre(flux, code, origine, "application/json; charset=utf-8", corps);
        }

        static void Repondre(Stream flux, int code, string origine, string type, byte[] corps, string entetesEnPlus = null)
        {
            var tete = new StringBuilder();
            tete.Append("HTTP/1.1 ").Append(code).Append(' ').Append(Libelle(code)).Append("\r\n");
            if (origine != null)
            {
                tete.Append("Access-Control-Allow-Origin: ").Append(origine).Append("\r\n");
                // Chrome demande à un site public la permission de joindre ce PC (accès au réseau local).
                tete.Append("Access-Control-Allow-Private-Network: true\r\n");
                tete.Append("Vary: Origin\r\n");
            }
            if (entetesEnPlus != null) tete.Append(entetesEnPlus);
            if (type != null) tete.Append("Content-Type: ").Append(type).Append("\r\n");
            tete.Append("Content-Length: ").Append(corps == null ? 0 : corps.Length).Append("\r\n");
            tete.Append("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
            byte[] octets = Encoding.ASCII.GetBytes(tete.ToString());
            flux.Write(octets, 0, octets.Length);
            if (corps != null && corps.Length > 0) flux.Write(corps, 0, corps.Length);
            flux.Flush();
        }

        static string Libelle(int code)
        {
            switch (code)
            {
                case 200: return "OK";
                case 204: return "No Content";
                case 400: return "Bad Request";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 409: return "Conflict";
                case 423: return "Locked";
                case 504: return "Gateway Timeout";
                default: return "Error";
            }
        }

        static Dictionary<string, object> Erreur(string message)
        {
            var erreur = new Dictionary<string, object>();
            erreur["erreur"] = message;
            return erreur;
        }

        static int Borne(int valeur, int min, int max)
        {
            return Math.Max(min, Math.Min(max, valeur));
        }

        // ── Icône près de l'horloge ───────────────────────────────────────────

        static string LibelleEtat()
        {
            try
            {
                List<Dictionary<string, object>> scanners = SurFilSta(() => ListerScanners(), 15000);
                string nom = scanners.Count > 0 ? (string)scanners[0]["nom"] : null;
                MettreAJourInfoBulle(nom);
                return nom != null ? "Prêt : " + nom : "Aucun scanner : allumez et branchez l'imprimante";
            }
            catch (Exception e)
            {
                return e.Message;
            }
        }

        static void MettreAJourInfoBulle(string nomScanner)
        {
            string texte = nomScanner != null ? "Lebtex Scan - " + nomScanner : "Lebtex Scan - aucun scanner";
            if (texte.Length > 63) texte = texte.Substring(0, 63); // limite de Windows
            SendOrPostCallback maj = delegate { if (icone != null) icone.Text = texte; };
            if (contexteUi != null) contexteUi.Post(maj, null); else maj(null);
        }

        static void EssayerUnScan()
        {
            if (Interlocked.CompareExchange(ref scanEnCours, 1, 0) != 0)
            {
                MessageBox.Show("Un scan est déjà en cours.", "Lebtex Scan");
                return;
            }
            try
            {
                var p = new ParametresScan();
                string nom = null;
                byte[] jpeg = SurFilSta(() => Numeriser(p, out nom), 120000);
                string fichier = Path.Combine(Path.GetTempPath(), "lebtex-scan-essai.jpg");
                File.WriteAllBytes(fichier, jpeg);
                Process.Start(fichier);
            }
            catch (Exception e)
            {
                MessageBox.Show(e is ErreurScan ? e.Message : Traduire(e), "Lebtex Scan", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally
            {
                Interlocked.Exchange(ref scanEnCours, 0);
            }
        }

        /// <summary>Un carré bleu nuit frappé d'un L doré, aux couleurs des documents Lebtex.</summary>
        static Icon DessinerIcone()
        {
            using (var dessin = new Bitmap(32, 32))
            {
                using (Graphics g = Graphics.FromImage(dessin))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    using (var fond = new SolidBrush(Color.FromArgb(15, 27, 61)))
                        g.FillRectangle(fond, 1, 1, 30, 30);
                    using (var or = new SolidBrush(Color.FromArgb(201, 162, 39)))
                    {
                        g.FillRectangle(or, 9, 6, 5, 20);
                        g.FillRectangle(or, 9, 21, 15, 5);
                    }
                }
                return Icon.FromHandle(dessin.GetHicon());
            }
        }

        static void Journal(string message)
        {
            try
            {
                Directory.CreateDirectory(DOSSIER);
                string fichier = Path.Combine(DOSSIER, "journal.txt");
                if (File.Exists(fichier) && new FileInfo(fichier).Length > 256 * 1024) File.Delete(fichier);
                File.AppendAllText(fichier, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + message + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }
}
