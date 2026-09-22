#!/usr/bin/env bash
# ============================================================================
# Retrait des secrets et des dumps de l'HISTORIQUE Git — À LANCER À LA MAIN
# ----------------------------------------------------------------------------
# Les fichiers deploy/operateur/.env et deploy/operateur/*.dump ne sont plus
# suivis, mais ils restent dans les commits passés : un clone du dépôt les
# contient encore (mots de passe de base, SESSION_SECRET, secret Discord, clé
# du bot, et un export complet des membres et des ventes avec noms RP).
#
# Ce script RÉÉCRIT l'historique local. Il ne pousse rien : la commande de
# push forcé est seulement affichée à la fin, à exécuter en connaissance de
# cause. Tout le monde doit ensuite RECLONER (les anciens clones gardent les
# anciens commits).
#
#   bash scripts/purger-historique-secrets.sh              # simulation
#   bash scripts/purger-historique-secrets.sh --confirmer  # réécrit en local
#
# Prérequis : git-filter-repo (https://github.com/newren/git-filter-repo)
#   pip install git-filter-repo   (ou paquet de la distribution)
#
# IMPORTANT : réécrire l'historique ne « dé-divulgue » rien. Les secrets qui
# ont été commités doivent être considérés comme compromis et changés :
#   - mot de passe PostgreSQL (POSTGRES_PASSWORD) et compte applicatif ;
#   - SESSION_SECRET (déconnecte tout le monde, c'est normal) ;
#   - DISCORD_CLIENT_SECRET (régénérer dans le portail développeur Discord) ;
#   - STATS_BOT_SECRET (et le redonner à la personne qui gère le bot) ;
#   - FBFA_STORAGE_TOKEN (demander un nouveau jeton à l'opérateur).
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIRMER="${1:-}"
CHEMINS=("deploy/operateur/.env" "deploy/operateur/dynasty8_20260907_121030.dump")

echo "Fichiers visés dans l'historique :"
for c in "${CHEMINS[@]}"; do
  n="$(git log --oneline --all -- "$c" | wc -l | tr -d ' ')"
  echo "  - $c : présent dans $n commit(s)"
done

if [ "$CONFIRMER" != "--confirmer" ]; then
  echo
  echo "Simulation : rien n'a été modifié. Relancer avec --confirmer pour réécrire l'historique LOCAL."
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Erreur : des modifications non commitées traînent. Commiter ou ranger (git stash) d'abord." >&2
  exit 1
fi
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Erreur : git-filter-repo n'est pas installé (pip install git-filter-repo)." >&2
  exit 1
fi

SAUVEGARDE="../dynasty8-avant-purge-$(date +%Y%m%d-%H%M%S).bundle"
git bundle create "$SAUVEGARDE" --all
echo "Sauvegarde complète du dépôt (toutes branches) : $SAUVEGARDE"

ARGS=()
for c in "${CHEMINS[@]}"; do ARGS+=(--path "$c"); done
git filter-repo --invert-paths "${ARGS[@]}" --force

echo
echo "Historique local réécrit. Vérifier :"
echo "  git log --oneline --all -- deploy/operateur/.env     # doit être vide"
echo
echo "Puis, en connaissance de cause (réécrit l'historique distant) :"
echo "  git remote add origin <URL>   # filter-repo retire le remote par sécurité"
echo "  git push --force --all origin && git push --force --tags origin"
echo
echo "Enfin : prévenir les personnes qui ont un clone (elles doivent recloner),"
echo "et CHANGER tous les secrets listés en tête de ce script."
