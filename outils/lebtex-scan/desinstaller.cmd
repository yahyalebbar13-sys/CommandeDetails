@echo off
rem Double-clic : retire Lebtex Scan de ce PC (programme, demarrage avec Windows, fichiers).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installation.ps1" -Retirer
pause
