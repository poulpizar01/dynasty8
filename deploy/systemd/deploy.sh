#!/usr/bin/env bash
# ============================================================================
# Dynasty 8 — déploiement systemd (Node.js derrière nginx, sans Docker)
# ----------------------------------------------------------------------------
# Ce script n'utilise JAMAIS sudo : il sépare explicitement
#   - les commandes applicatives, lancées avec le compte applicatif (dev) ;
#   - les commandes système, lancées en root.
# Chaque commande indique qui doit la lancer et refuse de s'exécuter sous la
# mauvaise identité plutôt que de deviner.
#
#   ./deploy.sh verifier     (dev)   controles : utilisateur, Node, .env — n'ecrit rien
#   ./deploy.sh unite        (dev)   affiche l'unite systemd generee (--sortie F pour l'ecrire)
#   ./deploy.sh installer    (root)  installe l'unite, daemon-reload, enable   [alias : setup]
#   ./deploy.sh maj          (dev)   git pull + npm ci                        [alias : update]
#   ./deploy.sh migrer       (dev)   applique le schema avec le compte admin
#   ./deploy.sh etat|logs|redemarrer (root) raccourcis systemctl / journalctl
#
# Reglages (variables d'environnement, ou deploy/systemd/deploy.conf) :
#   DEPLOY_USER=dev                compte Linux qui fait tourner le service
#   NODE_BIN=/usr/bin/node         chemin ABSOLU du binaire Node
#   SERVICE_NAME=dynasty8-api      nom de l'unite systemd
#   APP_DIR=<racine du depot>      dossier de l'application
#   ENV_FILE=$APP_DIR/.env         fichier des secrets
#   PORT=3010                      port local ecoute par Node (nginx y proxifie)
# ============================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$RACINE/deploy/systemd/deploy.conf" ] && . "$RACINE/deploy/systemd/deploy.conf"

DEPLOY_USER="${DEPLOY_USER:-dev}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
SERVICE_NAME="${SERVICE_NAME:-dynasty8-api}"
APP_DIR="${APP_DIR:-$RACINE}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
PORT="${PORT:-3010}"
MODELE="$APP_DIR/deploy/systemd/dynasty8-api.service.modele"
UNITE_SYSTEME="/etc/systemd/system/${SERVICE_NAME}.service"
GROUPE=""
VERSION_NODE=""

avertir() { printf 'Attention : %s\n' "$*" >&2; }
titre()   { printf '\n== %s\n' "$*"; }
echec()   { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }

est_root() { [ "$(id -u)" -eq 0 ]; }

exiger_root() {
  est_root || echec "la commande « $1 » doit etre lancee en root (ce script n'appelle jamais sudo). En root : $0 $1"
}

exiger_non_root() {
  if est_root; then
    echec "la commande « $1 » doit etre lancee avec le compte applicatif « $DEPLOY_USER », pas en root (sinon les fichiers changent de proprietaire et un Node nvm de root serait utilise). En root : runuser -u $DEPLOY_USER -- $0 $1"
  fi
}

# ---- controles -------------------------------------------------------------

verifier_utilisateur() {
  [ -n "$DEPLOY_USER" ] || echec "DEPLOY_USER est vide : indiquer explicitement le compte applicatif (ex : DEPLOY_USER=dev)."
  # Jamais de repli sur whoami : lance en root, cela donnerait un service root.
  if [ "$DEPLOY_USER" = "root" ]; then
    echec "DEPLOY_USER=root : le service ne doit JAMAIS tourner en root. Indiquer un compte sans privilege, par exemple DEPLOY_USER=dev."
  fi
  if [ "$(id -u "$DEPLOY_USER" 2>/dev/null || echo 65534)" = "0" ]; then
    echec "DEPLOY_USER=$DEPLOY_USER a l'uid 0 : le service ne doit JAMAIS tourner avec les droits de root."
  fi
  id -u "$DEPLOY_USER" >/dev/null 2>&1 || echec "l'utilisateur Linux « $DEPLOY_USER » n'existe pas. Le creer en root : useradd --create-home --shell /bin/bash $DEPLOY_USER"
  GROUPE="$(id -gn "$DEPLOY_USER")"
}

verifier_node() {
  case "$NODE_BIN" in
    /*) : ;;
    *) echec "NODE_BIN doit etre un chemin ABSOLU (recu : « $NODE_BIN »)." ;;
  esac
  case "$NODE_BIN" in
    /root/*|*/.nvm/*)
      echec "NODE_BIN=$NODE_BIN pointe vers un Node prive de root (nvm) : « $DEPLOY_USER » ne peut pas le lire, systemd echouerait avec status=203/EXEC. Installer un Node systeme et utiliser NODE_BIN=/usr/bin/node." ;;
  esac
  [ -e "$NODE_BIN" ] || echec "binaire Node introuvable : $NODE_BIN — installer Node 22+ pour tout le systeme, ou preciser NODE_BIN=/chemin/vers/node."
  [ -x "$NODE_BIN" ] || echec "$NODE_BIN n'est pas executable."
  # Executable PAR le compte applicatif : c'est la que se joue le 203/EXEC.
  if est_root && command -v runuser >/dev/null 2>&1; then
    runuser -u "$DEPLOY_USER" -- test -x "$NODE_BIN" 2>/dev/null || echec "$NODE_BIN n'est pas executable par « $DEPLOY_USER » : systemd donnerait status=203/EXEC."
  fi
  VERSION_NODE="$("$NODE_BIN" --version 2>/dev/null || echo inconnue)"
  case "$VERSION_NODE" in
    v2[2-9].*|v[3-9][0-9].*) : ;;
    *) avertir "Node $VERSION_NODE — le projet demande Node 22 ou plus (package.json)." ;;
  esac
}

verifier_env() {
  [ -f "$ENV_FILE" ] || echec "fichier de secrets introuvable : $ENV_FILE — le creer : cp deploy/systemd/.env.example $ENV_FILE && chmod 600 $ENV_FILE"

  # Jamais suivi par Git. « safe.directory » evite que le controle soit
  # silencieusement saute quand le depot appartient a un autre compte que
  # celui qui lance le script (git refuserait alors de repondre).
  local git_ok=0
  if command -v git >/dev/null 2>&1 && git -c safe.directory="$APP_DIR" -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git_ok=1
    if git -c safe.directory="$APP_DIR" -C "$APP_DIR" ls-files --error-unmatch "$ENV_FILE" >/dev/null 2>&1; then
      echec "$ENV_FILE est SUIVI PAR GIT : le retirer du depot (git rm --cached \"$ENV_FILE\") et verifier .gitignore."
    fi
  fi
  [ "$git_ok" = 1 ] || avertir "depot Git illisible depuis ce compte : impossible de verifier que $ENV_FILE n'est pas suivi par Git."

  local droits proprietaire manquantes v
  droits="$(stat -c '%a' "$ENV_FILE")"
  proprietaire="$(stat -c '%U' "$ENV_FILE")"
  [ "$proprietaire" = "$DEPLOY_USER" ] || echec "$ENV_FILE appartient a « $proprietaire » et non a « $DEPLOY_USER ». En root : chown $DEPLOY_USER: $ENV_FILE"
  case "$droits" in
    600|400) : ;;
    *) echec "$ENV_FILE est en mode $droits : lisible par d'autres comptes. Corriger : chmod 600 $ENV_FILE" ;;
  esac

  # Presence des variables indispensables : les VALEURS ne sont jamais affichees.
  manquantes=""
  for v in DATABASE_URL SESSION_SECRET; do
    grep -qE "^[[:space:]]*${v}=.+" "$ENV_FILE" || manquantes="$manquantes $v"
  done
  [ -z "$manquantes" ] || echec "variables absentes ou vides dans $ENV_FILE :$manquantes"

  if grep -qE "^[[:space:]]*DB_SCHEMA_AUTO=1" "$ENV_FILE"; then
    avertir "DB_SCHEMA_AUTO=1 dans $ENV_FILE — l'unite systemd impose 0 (le site ne cree aucune table)."
  fi
  printf '  %s : mode %s, proprietaire %s, hors Git, variables essentielles presentes.\n' "$ENV_FILE" "$droits" "$proprietaire"
}

resume() {
  printf '  Service            : %s.service\n' "$SERVICE_NAME"
  printf '  Utilisateur Linux  : %s (groupe %s)\n' "$DEPLOY_USER" "${GROUPE:-?}"
  printf '  Dossier            : %s\n' "$APP_DIR"
  printf '  Binaire Node       : %s (%s)\n' "$NODE_BIN" "${VERSION_NODE:-?}"
  printf '  Fichier de secrets : %s\n' "$ENV_FILE"
  printf '  Port local ecoute  : %s  (nginx proxifie vers http://127.0.0.1:%s)\n' "$PORT" "$PORT"
}

# ---- commandes -------------------------------------------------------------

cmd_verifier() {
  titre "Controles (aucune modification)"
  verifier_utilisateur
  verifier_node
  verifier_env
  printf '\n'
  resume
  if [ -d "$APP_DIR/node_modules" ]; then
    printf '  Dependances        : node_modules present\n'
  else
    avertir "node_modules absent : lancer npm ci avec le compte $DEPLOY_USER."
  fi
  if [ -f "$UNITE_SYSTEME" ]; then
    printf '  Unite installee    : %s\n' "$UNITE_SYSTEME"
  else
    printf '  Unite installee    : pas encore (voir la commande installer)\n'
  fi
  printf '\nControles termines.\n'
}

cmd_unite() {
  local sortie="" contenu
  if [ "${1:-}" = "--sortie" ]; then
    sortie="${2:-}"
    [ -n "$sortie" ] || echec "--sortie attend un chemin de fichier."
  fi
  verifier_utilisateur
  verifier_node
  [ -f "$MODELE" ] || echec "modele introuvable : $MODELE"
  contenu="$(sed -e "s|@@USER@@|$DEPLOY_USER|g" -e "s|@@GROUP@@|$GROUPE|g" -e "s|@@APP_DIR@@|$APP_DIR|g" -e "s|@@ENV_FILE@@|$ENV_FILE|g" -e "s|@@NODE_BIN@@|$NODE_BIN|g" -e "s|@@PORT@@|$PORT|g" -e "s|@@SERVICE@@|$SERVICE_NAME|g" "$MODELE")"
  # Garde-fou final : aucune unite ne doit faire tourner l'application en root.
  if printf '%s\n' "$contenu" | grep -qE '^User=root$'; then
    echec "l'unite generee contient User=root : refuse."
  fi
  if [ -n "$sortie" ]; then
    printf '%s\n' "$contenu" > "$sortie"
    printf 'Unite ecrite dans : %s\n' "$sortie"
  else
    printf '%s\n' "$contenu"
  fi
}

cmd_installer() {
  exiger_root installer
  verifier_utilisateur
  verifier_node
  verifier_env
  titre "Installation du service"
  resume
  printf '\nContinuer ? [oui/N] '
  read -r reponse
  [ "$reponse" = "oui" ] || { printf 'Annule.\n'; exit 1; }

  install -d -o "$DEPLOY_USER" -g "$GROUPE" "$APP_DIR/rapports"
  cmd_unite --sortie "$UNITE_SYSTEME" >/dev/null
  chmod 644 "$UNITE_SYSTEME"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  printf 'Unite installee : %s\n' "$UNITE_SYSTEME"
  printf 'Demarrer :  systemctl start %s   puis   systemctl status %s\n' "$SERVICE_NAME" "$SERVICE_NAME"
}

cmd_migrer() {
  exiger_non_root migrer
  titre "Migration du schema PostgreSQL (compte administrateur)"
  printf 'Utilise DATABASE_URL_ADMIN (ou DATABASE_URL) de %s.\n' "$ENV_FILE"
  set -a
  . "$ENV_FILE"
  set +a
  "$NODE_BIN" "$APP_DIR/scripts/appliquer-schema.js" --apply --exiger-compte-applicatif
}

cmd_maj() {
  exiger_non_root maj
  titre "Mise a jour applicative (compte $DEPLOY_USER)"
  cd "$APP_DIR"
  git pull --ff-only
  npm ci --omit=dev
  printf '\nEtapes suivantes :\n'
  printf '  (dev)   ./deploy/systemd/deploy.sh migrer      # si le schema a change\n'
  printf '  (root)  systemctl restart %s\n' "$SERVICE_NAME"
}

cmd_etat()       { exiger_root etat; systemctl status "$SERVICE_NAME" --no-pager; }
cmd_redemarrer() { exiger_root redemarrer; systemctl restart "$SERVICE_NAME"; systemctl status "$SERVICE_NAME" --no-pager | head -12; }
cmd_logs()       { exiger_root logs; journalctl -u "$SERVICE_NAME" -n "${1:-80}" --no-pager; }

commande="${1:-aide}"
shift || true
case "$commande" in
  # Alias des noms utilises par les autres projets heberges sur ce serveur
  # (web-map-multipoints) : « setup » pour la premiere installation, « update »
  # pour une mise a jour. Memes commandes, noms familiers.
  setup)       cmd_installer ;;
  update)      cmd_maj ;;
  verifier)    cmd_verifier ;;
  unite)       cmd_unite "$@" ;;
  installer)   cmd_installer ;;
  migrer)      cmd_migrer ;;
  maj)         cmd_maj ;;
  etat)        cmd_etat ;;
  redemarrer)  cmd_redemarrer ;;
  logs)        cmd_logs "$@" ;;
  *)           sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//' ;;
esac
