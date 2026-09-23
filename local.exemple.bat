@echo off
rem ===========================================================================
rem Reglages personnels pour lancer-en-local.bat
rem ---------------------------------------------------------------------------
rem Copier ce fichier en "local.bat" et y mettre vos vraies valeurs.
rem "local.bat" est exclu de Git : il contient des secrets.
rem
rem Tout est facultatif. Sans rien, le site public fonctionne avec les donnees
rem de la base locale ; seule la connexion a l'espace agents est impossible.
rem
rem Pour que "Se connecter avec Discord" marche en local, il faut AUSSI
rem declarer l'URL ci-dessous dans le portail Discord :
rem   RoxwoodLegal -> OAuth2 -> Redirects -> http://localhost:3000/api/auth/discord/callback
rem (on peut y declarer plusieurs URL : celle du serveur ET celle-ci.)
rem ===========================================================================

set "DISCORD_CLIENT_ID=1546523997980852294"
set "DISCORD_CLIENT_SECRET="
set "DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback"

rem Photos : vide = l'import est desactive, les photos deja en base s'affichent.
set "FBFA_STORAGE_TOKEN="

rem WebMap : vide = le bouton affiche "carte indisponible".
set "WEBMAP_ORIGIN="
