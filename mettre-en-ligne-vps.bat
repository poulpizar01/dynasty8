@echo off
setlocal
cd /d "%~dp0"

rem Serveur cible : deploy\vps\cible.bat s'il existe (non versionne, voir
rem cible.exemple.bat), sinon les variables d'environnement D8_VPS / D8_VPSURL
rem / D8_RACINE, sinon les valeurs par defaut ci-dessous. Le but : changer de
rem serveur sans toucher a ce script ni au reste du depot.
set "VPS="
set "VPSURL="
set "RACINE="
if exist "deploy\vps\cible.bat" call "deploy\vps\cible.bat"
if not defined VPS if defined D8_VPS set "VPS=%D8_VPS%"
if not defined VPSURL if defined D8_VPSURL set "VPSURL=%D8_VPSURL%"
if not defined RACINE if defined D8_RACINE set "RACINE=%D8_RACINE%"
if not defined VPS set "VPS=dynasty8-vps"
if not defined RACINE set "RACINE=/opt/dynasty8"
if not defined VPSURL set "VPSURL=http://%VPS%"

echo.
echo Serveur cible : %VPS%   (dossier %RACINE%)
echo Pour en changer : deploy\vps\cible.bat (modele : cible.exemple.bat).
echo.
echo [1/2] Envoi des fichiers vers le serveur...
scp -r public src scripts server.js package.json package-lock.json schema.postgres.sql %VPS%:%RACINE%/
if errorlevel 1 goto erreur
scp deploy/vps/nginx-dynasty8.conf deploy/vps/compose.yaml deploy/vps/Dockerfile %VPS%:%RACINE%/deploy/vps/
if errorlevel 1 goto erreur
scp deploy/vps/installer-vps.sh deploy/vps/backup.sh deploy/vps/restore.sh %VPS%:%RACINE%/deploy/vps/
if errorlevel 1 goto erreur
scp deploy/verifier-env.sh %VPS%:%RACINE%/deploy/
if errorlevel 1 goto erreur
echo.
echo [2/2] Reconstruction du site sur le serveur (1 a 2 minutes)...
ssh -t %VPS% "cd %RACINE%/deploy/vps && sudo docker compose up -d --build app"
if errorlevel 1 goto erreur
echo.
echo Termine ~ Recharge le site avec Ctrl+F5 : %VPSURL%/admin.html
echo.
pause
exit /b 0

:erreur
echo.
echo *** Une etape a echoue. Envoie une capture de cette fenetre a Claude. ***
echo.
pause
exit /b 1
