@echo off
setlocal
cd /d "%~dp0"
title Dynasty 8 - site en local

rem ===========================================================================
rem Lance le site sur CE PC, sans toucher au serveur en ligne.
rem
rem   lancer-en-local.bat                      demarre le site
rem   lancer-en-local.bat chemin-du.dump       restaure d'abord une sauvegarde
rem
rem Il faut Docker Desktop demarre (pour la base PostgreSQL) et Node.js 22+.
rem Pour arreter : Ctrl+C dans cette fenetre. La base, elle, reste dans un
rem conteneur nomme dynasty8-local-pg avec ses donnees (volume d8-local-data).
rem ===========================================================================

set "CONTENEUR=dynasty8-local-pg"
set "DATABASE_URL=postgres://d8:d8local@127.0.0.1:55433/dynasty8"
set "PGSSL=disable"
set "COOKIES_HTTP=1"
set "DB_SCHEMA_AUTO=1"
set "SESSION_SECRET=secret-local-de-developpement"
set "PORT=3000"

rem Reglages personnels (identifiants Discord pour l'espace agents, jeton des
rem photos, adresse de la WebMap) : copier local.exemple.bat en local.bat et le
rem remplir. local.bat est exclu de Git : il contient des secrets.
if exist "local.bat" call "local.bat"

echo.
echo [1/4] Verification de Docker...
docker version >nul 2>&1
if errorlevel 1 goto pas_de_docker

echo [2/4] Base PostgreSQL locale...
docker start %CONTENEUR% >nul 2>&1
if errorlevel 1 (
  echo       premiere fois : creation du conteneur %CONTENEUR%...
  docker run -d --name %CONTENEUR% -e POSTGRES_USER=d8 -e POSTGRES_PASSWORD=d8local -e POSTGRES_DB=dynasty8 -v d8-local-data:/var/lib/postgresql/data -p 127.0.0.1:55433:5432 postgres:17-alpine >nul
  if errorlevel 1 goto erreur
)
for /l %%i in (1,1,60) do (
  docker exec %CONTENEUR% pg_isready -U d8 -d dynasty8 >nul 2>&1
  if not errorlevel 1 goto base_prete
  ping -n 2 127.0.0.1 >nul
)
echo *** La base ne repond pas apres 60 essais. ***
goto erreur

:base_prete
if not "%~1"=="" (
  echo       restauration de %~1 ...
  docker exec -i %CONTENEUR% pg_restore -U d8 -d dynasty8 --clean --if-exists --no-owner --no-privileges < "%~1"
)

echo [3/4] Dependances Node...
if not exist "node_modules" call npm install --no-audit --no-fund
if errorlevel 1 goto erreur

echo [4/4] Demarrage du site...
echo.
echo       Site      : http://localhost:%PORT%/
echo       Agents    : http://localhost:%PORT%/admin.html
echo       Arreter   : Ctrl+C dans cette fenetre
echo.
start "" http://localhost:%PORT%/
node server.js
goto fin

:pas_de_docker
echo.
echo *** Docker Desktop n'est pas demarre (ou pas installe). ***
echo     Lance Docker Desktop, attends l'icone verte, puis relance ce script.
echo.
pause
exit /b 1

:erreur
echo.
echo *** Une etape a echoue. Envoie une capture de cette fenetre a Claude. ***
echo.
pause
exit /b 1

:fin
echo.
echo Site arrete. La base locale continue de tourner (docker stop %CONTENEUR% pour l'arreter).
echo.
pause
