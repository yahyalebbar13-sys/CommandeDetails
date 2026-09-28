# Lebtex Scan : lance le pont entre /stock et le scanner (voir LebtexScan.cs).
#
# Le code C# est compilé en mémoire et exécuté par PowerShell, programme signé par Microsoft,
# plutôt qu'en .exe maison : un .exe non signé et compilé sur place est mis en bac à sable par
# les antivirus (Avast l'a fait au premier essai, et le programme devenait injoignable).
#
# Lancé au démarrage de Windows par le raccourci que pose installer.cmd.

$ErrorActionPreference = 'Stop'

# La console qui héberge le programme n'a rien à montrer : on la cache tout de suite.
Add-Type -Name Fenetre -Namespace LebtexScanConsole -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
'@
[void][LebtexScanConsole.Fenetre]::ShowWindow([LebtexScanConsole.Fenetre]::GetConsoleWindow(), 0)

# Lu en UTF-8 : sinon les accents des messages affichés dans /stock arrivent abîmés.
$source = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'LebtexScan.cs')
Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @(
  'Microsoft.CSharp', 'System.Core', 'System.Drawing', 'System.Windows.Forms', 'System.Web.Extensions'
)
[LebtexScan.Programme]::Main([string[]]$args)
