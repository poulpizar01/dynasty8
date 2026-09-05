@echo off
setlocal
cd /d "%~dp0"
echo.
echo [1/2] Envoi des fichiers vers le VPS...
scp -r public src server.js package.json package-lock.json schema.sql schema.postgres.sql dynasty8-vps:/opt/dynasty8/
if errorlevel 1 goto erreur
echo.
echo [2/2] Reconstruction du site sur le VPS (1 a 2 minutes)...
ssh -t dynasty8-vps "cd /opt/dynasty8/deploy/vps && sudo docker compose up -d --build app"
if errorlevel 1 goto erreur
echo.
echo Termine ! Recharge le site avec Ctrl+F5 : http://51.255.173.188/admin.html
echo.
pause
exit /b 0

:erreur
echo.
echo *** Une etape a echoue. Envoie une capture de cette fenetre a Claude. ***
echo.
pause
exit /b 1
