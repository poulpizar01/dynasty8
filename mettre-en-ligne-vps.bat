@echo off
setlocal
cd /d "%~dp0"
echo.
echo [1/2] Envoi des fichiers vers le VPS...
scp -r public src scripts server.js package.json package-lock.json schema.postgres.sql dynasty8-vps:/opt/dynasty8/
scp deploy/vps/Caddyfile deploy/vps/compose.yaml deploy/vps/Dockerfile dynasty8-vps:/opt/dynasty8/deploy/vps/
scp deploy/verifier-env.sh dynasty8-vps:/opt/dynasty8/deploy/
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
