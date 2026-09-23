#!/usr/bin/env bash
# ============================================================================
# Dynasty 8 — installation (ou reprise) du site sur un serveur Linux
# ----------------------------------------------------------------------------
# Objectif : changer de serveur doit se résumer à « cloner le dépôt, remplir
# .env, lancer ce script ». Rien dans le dépôt ne dépend d'une machine
# précise ; la seule valeur liée au serveur est DISCORD_REDIRECT_URI.
#
#   bash deploy/vps/installer-vps.sh verifier    contrôles seuls, ne modifie rien
#   bash deploy/vps/installer-vps.sh installer   construit et démarre le site
#   bash deploy/vps/installer-vps.sh nginx       (re)pose le reverse proxy (root)
#
# Ce script n'appelle jamais « sudo » lui-même : s'il faut des droits, il le
# dit et vous relancez la commande comme il convient. Il ne supprime rien et
# ne touche jamais à la base de données.
# ============================================================================
set -euo pipefail

ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/../.." && pwd)"
ENV_FICHIER="$ICI/.env"
CONF_NGINX="/etc/nginx/sites-available/dynasty8"
PROBLEMES=0

ok()      { echo "  OK    $*"; }
alerte()  { echo "  ALERTE $*" >&2; PROBLEMES=$((PROBLEMES + 1)); }
titre()   { echo; echo "== $*"; }

valeur_env() {
  [ -f "$ENV_FICHIER" ] || return 0
  grep -E "^$1=" "$ENV_FICHIER" | tail -n1 | cut -d= -f2-
}

# --- 1. outils présents -----------------------------------------------------
verifier_outils() {
  titre "Outils"
  if command -v docker >/dev/null 2>&1; then ok "docker : $(docker --version)"
  else alerte "docker absent (https://docs.docker.com/engine/install/)"; fi
  if docker compose version >/dev/null 2>&1; then ok "docker compose : $(docker compose version --short)"
  else alerte "plugin « docker compose » absent, ou droits insuffisants (relancer avec sudo, ou ajouter votre compte au groupe docker)"; fi
  if command -v nginx >/dev/null 2>&1; then ok "nginx : présent"
  else alerte "nginx absent sur l'hôte (sudo apt install nginx) — c'est lui qui expose le site"; fi
}

# --- 2. fichier .env --------------------------------------------------------
verifier_env() {
  titre "Configuration (.env)"
  if [ ! -f "$ENV_FICHIER" ]; then
    alerte ".env absent. Le créer à partir du modèle :"
    echo "          cp $ICI/.env.example $ENV_FICHIER && chmod 600 $ENV_FICHIER"
    echo "          puis remplir les vraies valeurs (secrets transmis hors dépôt)."
    return 0
  fi
  bash "$RACINE/deploy/verifier-env.sh" "$ENV_FICHIER" || PROBLEMES=$((PROBLEMES + 1))

  local manquantes=""
  for cle in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB APP_DB_USER APP_DB_PASSWORD SESSION_SECRET DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET DISCORD_REDIRECT_URI; do
    if [ -z "$(valeur_env "$cle")" ]; then manquantes="$manquantes $cle"; fi
  done
  if [ -n "$manquantes" ]; then alerte "variables vides :$manquantes"; else ok "toutes les variables obligatoires sont renseignées"; fi

  if grep -q "remplacer_par" "$ENV_FICHIER"; then
    alerte "des valeurs d'exemple (« remplacer_par… ») sont encore dans .env"
  fi

  local redirection; redirection="$(valeur_env DISCORD_REDIRECT_URI)"
  case "$redirection" in
    *ADRESSE-DU-SERVEUR*)
      alerte "DISCORD_REDIRECT_URI contient encore ADRESSE-DU-SERVEUR : y mettre l'adresse publique réelle de CE serveur, et déclarer la même URL dans le portail Discord (RoxwoodLegal, OAuth2, Redirects)" ;;
    "") ;;
    *) ok "DISCORD_REDIRECT_URI = $redirection (à déclarer à l'identique côté Discord)" ;;
  esac

  if [ -z "$(valeur_env FBFA_STORAGE_TOKEN)" ]; then
    echo "  NOTE  FBFA_STORAGE_TOKEN vide : import de photos désactivé (le reste fonctionne)."
  fi
  if [ -z "$(valeur_env WEBMAP_ORIGIN)" ]; then
    echo "  NOTE  WEBMAP_ORIGIN vide : le bouton WebMap affichera « carte indisponible »."
  fi
}

# --- 3. état du site --------------------------------------------------------
verifier_service() {
  titre "Site"
  local port; port="$(valeur_env PORT_LOCAL)"; port="${port:-3010}"
  if curl -fs -o /dev/null --max-time 5 "http://127.0.0.1:$port/"; then
    ok "le site répond sur 127.0.0.1:$port"
  else
    echo "  NOTE  rien ne répond encore sur 127.0.0.1:$port (normal avant l'installation)."
  fi
  if [ -f "$CONF_NGINX" ]; then ok "conf nginx installée ($CONF_NGINX)"
  else echo "  NOTE  conf nginx pas encore installée — « installer-vps.sh nginx »."; fi
}

# --- actions ----------------------------------------------------------------
action_installer() {
  verifier_outils
  verifier_env
  if [ ! -f "$ENV_FICHIER" ] || [ "$PROBLEMES" -gt 0 ]; then
    echo
    echo "Installation interrompue : corriger les points ci-dessus d'abord."
    echo "(Le .env doit être complet AVANT le premier démarrage : le service de"
    echo " migration crée le compte applicatif à partir de ces valeurs.)"
    exit 1
  fi
  titre "Construction et démarrage (quelques minutes)"
  cd "$ICI"
  docker compose up -d --build
  titre "État des conteneurs"
  docker compose ps
  verifier_service
  echo
  echo "Reste à faire :"
  echo "  1. bash deploy/vps/installer-vps.sh nginx   (en root : reverse proxy)"
  echo "  2. bash deploy/vps/backup.sh                (première sauvegarde)"
  echo "  3. déclarer DISCORD_REDIRECT_URI dans le portail Discord."
}

action_nginx() {
  if [ "$(id -u)" != "0" ]; then
    echo "Cette étape modifie /etc/nginx : relancer en root." >&2
    echo "  sudo bash deploy/vps/installer-vps.sh nginx" >&2
    exit 1
  fi
  command -v nginx >/dev/null 2>&1 || { echo "nginx n'est pas installé (apt install nginx)." >&2; exit 1; }
  install -m 644 "$ICI/nginx-dynasty8.conf" "$CONF_NGINX"
  ln -sfn "$CONF_NGINX" /etc/nginx/sites-enabled/dynasty8
  echo "Conf posée. Si le site par défaut de nginx gêne, retirer /etc/nginx/sites-enabled/default."
  nginx -t
  systemctl reload nginx
  echo "nginx rechargé. Le fichier écoute sur n'importe quel nom d'hôte (server_name _),"
  echo "il n'y a donc rien à y changer en cas de déménagement."
}

case "${1:-verifier}" in
  verifier)
    verifier_outils; verifier_env; verifier_service
    echo
    if [ "$PROBLEMES" -gt 0 ]; then echo "$PROBLEMES point(s) à corriger."; exit 1; fi
    echo "Tout est en ordre."
    ;;
  installer) action_installer ;;
  nginx)     action_nginx ;;
  *)
    echo "Usage : bash deploy/vps/installer-vps.sh [verifier|installer|nginx]" >&2
    exit 2
    ;;
esac
