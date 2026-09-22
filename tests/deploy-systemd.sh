#!/usr/bin/env bash
# Scénarios de deploy/systemd/deploy.sh, joués dans un vrai Linux (conteneur).
# Lancé par tests/deploy-systemd.test.js ; le dépôt est monté sur /depot.
set -u
cd /tmp
cp -r /depot /tmp/app && cd /tmp/app
useradd --create-home --shell /bin/bash dev >/dev/null 2>&1
chown -R dev: /tmp/app
D=/tmp/app/deploy/systemd/deploy.sh
ok=0; ko=0
verifier() { # nom, attendu(0=succès,1=échec), motif, commande...
  local nom="$1" attendu="$2" motif="$3"; shift 3
  local sortie code
  sortie="$("$@" 2>&1)"; code=$?
  local resultat="OK"
  if [ "$attendu" = 0 ] && [ $code -ne 0 ]; then resultat="ÉCHEC(code $code)"; fi
  if [ "$attendu" = 1 ] && [ $code -eq 0 ]; then resultat="ÉCHEC(devait refuser)"; fi
  if [ -n "$motif" ] && ! printf '%s' "$sortie" | grep -qi -- "$motif"; then resultat="ÉCHEC(motif absent: $motif)"; fi
  if [ "$resultat" = OK ]; then ok=$((ok+1)); else ko=$((ko+1)); fi
  printf '%-58s %s\n' "$nom" "$resultat"
  [ "$resultat" = OK ] || printf '   sortie: %s\n' "$(printf '%s' "$sortie" | head -3 | tr '\n' ' ')"
}

echo "node système : $(command -v node) $(node --version)"
echo

verifier "refuse DEPLOY_USER=root" 1 "JAMAIS tourner en root" env DEPLOY_USER=root NODE_BIN="$(command -v node)" bash $D unite
verifier "refuse un utilisateur inexistant" 1 "n'existe pas" env DEPLOY_USER=nexistepas NODE_BIN="$(command -v node)" bash $D unite
verifier "refuse un Node nvm de root" 1 "203/EXEC" env DEPLOY_USER=dev NODE_BIN=/root/.nvm/versions/node/v22.0.0/bin/node bash $D unite
verifier "refuse un chemin Node relatif" 1 "ABSOLU" env DEPLOY_USER=dev NODE_BIN=node bash $D unite
verifier "refuse un binaire Node absent" 1 "introuvable" env DEPLOY_USER=dev NODE_BIN=/usr/bin/node-absent bash $D unite
verifier "genere l'unite avec un Node systeme" 0 "" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" bash $D unite --sortie /tmp/u.service

echo
echo "--- unité générée :"
grep -E "^(User|Group|WorkingDirectory|EnvironmentFile|Environment|ExecStart|Restart|RestartSec|NoNewPrivileges|ReadWritePaths)=" /tmp/u.service

echo
# --- contrôles du .env ---
printf 'DATABASE_URL=postgres://a:b@127.0.0.1:5432/c\nSESSION_SECRET=xyz\n' > /tmp/app/.env
chown dev: /tmp/app/.env; chmod 644 /tmp/app/.env
verifier "refuse un .env lisible par tous (644)" 1 "mode 644" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" bash $D verifier
chmod 600 /tmp/app/.env
verifier "accepte un .env en 600 appartenant a dev" 0 "hors Git" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" bash $D verifier
chown root: /tmp/app/.env
verifier "refuse un .env appartenant a root" 1 "appartient" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" bash $D verifier
chown dev: /tmp/app/.env
verifier "refuse un fichier suivi par Git" 1 "SUIVI PAR GIT" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" ENV_FILE=/tmp/app/package.json bash $D verifier
printf 'DATABASE_URL=\nSESSION_SECRET=x\n' > /tmp/app/.env; chmod 600 /tmp/app/.env; chown dev: /tmp/app/.env
verifier "refuse une variable essentielle vide" 1 "DATABASE_URL" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" bash $D verifier
verifier "refuse 'installer' hors root" 1 "en root" runuser -u dev -- env DEPLOY_USER=dev bash $D installer
verifier "refuse 'maj' en root" 1 "pas en root" env DEPLOY_USER=dev NODE_BIN="$(command -v node)" bash $D maj

echo
echo "appels reels a sudo (hors commentaires) : $(grep -v "^[[:space:]]*#" $D | grep -c "sudo " || true)"
echo "RESULTAT : $ok réussis, $ko échoués"
[ $ko -eq 0 ]
