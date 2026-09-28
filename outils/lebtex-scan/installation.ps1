# Installe Lebtex Scan sur ce PC, ou le retire avec -Retirer.
# Lancé par installer.cmd et desinstaller.cmd (un double-clic sur un .ps1 ouvre le Bloc-notes).
# Pas besoin d'être administrateur : tout va dans le profil de l'utilisateur.
param([switch]$Retirer)
$ErrorActionPreference = 'Stop'

$dossier = Join-Path $env:LOCALAPPDATA 'LebtexScan'
$raccourci = Join-Path ([Environment]::GetFolderPath('Startup')) 'Lebtex Scan.lnk'

# Une version en marche tiendrait le port et ses fichiers : on l'arrête d'abord.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*LebtexScan.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if ($Retirer) {
  Remove-Item -LiteralPath $raccourci -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $dossier -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host 'Lebtex Scan a été retiré de ce PC.'
  return
}

New-Item -ItemType Directory -Force -Path $dossier | Out-Null
foreach ($fichier in 'LebtexScan.cs', 'LebtexScan.ps1') {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $fichier) -Destination $dossier -Force
  Unblock-File -LiteralPath (Join-Path $dossier $fichier)
}

# Démarrage avec Windows : un raccourci dans le dossier Démarrage de l'utilisateur.
$powershell = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $dossier 'LebtexScan.ps1') + '"'
$lien = (New-Object -ComObject WScript.Shell).CreateShortcut($raccourci)
$lien.TargetPath = $powershell
$lien.Arguments = $arguments
$lien.WorkingDirectory = $dossier
$lien.WindowStyle = 7  # réduite : la console ne fait qu'apparaître le temps de se cacher
$lien.Description = 'Scan des chèques et LC pour /stock'
$lien.Save()

Start-Process -FilePath $powershell -ArgumentList ($arguments + ' --bienvenue') -WindowStyle Hidden
Write-Host "Lebtex Scan est installé et lancé : icône bleu nuit et or près de l'horloge."
Write-Host "Pour vérifier l'imprimante : clic droit sur l'icône, puis « Essayer un scan »."
