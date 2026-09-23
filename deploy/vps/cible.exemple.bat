@echo off
rem ===========================================================================
rem Serveur cible de mettre-en-ligne-vps.bat
rem ---------------------------------------------------------------------------
rem Copier ce fichier en "cible.bat" (dans ce meme dossier) et y mettre les
rem valeurs du serveur en cours d'utilisation. "cible.bat" est exclu de Git :
rem il decrit VOTRE machine, pas le projet.
rem
rem VPS = nom d'hote SSH. Le plus simple est un alias declare dans
rem       %USERPROFILE%\.ssh\config :
rem           Host dynasty8-vps
rem               HostName 203.0.113.10
rem               User dev
rem       Changer de serveur = changer le HostName a cet endroit uniquement.
rem       Un "utilisateur@adresse" direct fonctionne aussi.
rem VPSURL = adresse publique du site, pour le message de fin.
rem RACINE = dossier du projet sur le serveur.
rem ===========================================================================
set "VPS=dynasty8-vps"
set "VPSURL=http://ADRESSE-DU-SERVEUR"
set "RACINE=/opt/dynasty8"
