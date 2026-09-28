# Installe Lebtex Scan sur ce PC, ou le retire avec -Retirer.
# Lancé par installer.cmd et desinstaller.cmd (un double-clic sur un .ps1 ouvre le Bloc-notes).
# Pas besoin d'être administrateur : tout va dans le profil de l'utilisateur.
param([switch]$Retirer)
$ErrorActionPreference = 'Stop'

$dossier = Join-Path $env:LOCALAPPDATA 'LebtexScan'
$raccourci = Join-Path ([Environment]::GetFolderPath('Startup')) 'Lebtex Scan.lnk'
$raccourciStock = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Lebtex Stock.lnk'

function Trouver-Navigateur {
  foreach ($nom in 'chrome.exe', 'msedge.exe') {
    foreach ($racine in 'HKCU:', 'HKLM:') {
      $cle = "$racine\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$nom"
      $chemin = (Get-ItemProperty -LiteralPath $cle -ErrorAction SilentlyContinue).'(default)'
      if ($chemin -and (Test-Path -LiteralPath $chemin)) { return $chemin }
    }
  }
  foreach ($chemin in @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )) {
    if (Test-Path -LiteralPath $chemin) { return $chemin }
  }
  return $null
}

# Une version en marche tiendrait le port et ses fichiers : on l'arrête d'abord.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*LebtexScan.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if ($Retirer) {
  Remove-Item -LiteralPath $raccourci -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $raccourciStock -Force -ErrorAction SilentlyContinue
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

# Raccourci « Lebtex Stock » sur le Bureau : /stock dans un navigateur qui imprime directement
# (--kiosk-printing : pas de boîte d'impression, tout part sur l'imprimante par défaut de Windows).
# Son propre profil (--user-data-dir) lui donne son propre processus : sans lui, l'option serait
# ignorée dès qu'une autre fenêtre de Chrome est déjà ouverte.
$navigateur = Trouver-Navigateur
if ($navigateur) {
  $profil = Join-Path $dossier 'navigateur'
  $stock = (New-Object -ComObject WScript.Shell).CreateShortcut($raccourciStock)
  $stock.TargetPath = $navigateur
  # --app : une fenêtre d'application sans barre d'adresse, comme l'application /stock installée
  # depuis Chrome — mais celle-là, lancée sans l'option, affiche toujours la boîte d'impression.
  $stock.Arguments = '--kiosk-printing --no-first-run --no-default-browser-check --user-data-dir="' + $profil + '" --app=https://www.lebtex.ma/stock'
  $stock.IconLocation = "$navigateur,0"
  $stock.Description = '/stock avec impression directe'
  $stock.Save()
  Write-Host ''
  Write-Host "Raccourci « Lebtex Stock » posé sur le Bureau : ouvrez /stock par lui, les impressions"
  Write-Host "partent directement sur l'imprimante par défaut de Windows, sans fenêtre d'aperçu."
} else {
  Write-Host ''
  Write-Host "Chrome et Edge introuvables : pas de raccourci d'impression directe."
}
