@echo off
rem Double-clic : installe Lebtex Scan sur ce PC et le fait demarrer avec Windows.
rem A faire une fois sur chaque PC de caisse relie a une imprimante qui scanne.
if not exist "%~dp0installation.ps1" (
  echo Les fichiers du programme sont introuvables a cote de installer.cmd.
  echo Si vous l'avez ouvert depuis le fichier .zip : clic droit sur le .zip, "Extraire tout",
  echo puis double-cliquez sur installer.cmd dans le dossier extrait.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installation.ps1"
pause
