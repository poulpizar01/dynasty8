#!/usr/bin/env bash
# Restaure une sauvegarde créée par backup.sh. ATTENTION : écrase les
# données actuelles de la base du VPS.
# Usage : ./restore.sh backups/dynasty8_20260101_120000.dump
set -euo pipefail
cd "$(dirname "$0")"

FICHIER="${1:-}"
if [ -z "$FICHIER" ] || [ ! -f "$FICHIER" ]; then
  echo "Usage : ./restore.sh chemin/vers/le_fichier.dump" >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "Erreur : .env introuvable." >&2
  exit 1
fi
set -a; source .env; set +a

read -r -p "Ceci va écraser la base '$POSTGRES_DB' actuelle du VPS. Continuer ? [oui/N] " confirmation
if [ "$confirmation" != "oui" ]; then
  echo "Annulé."
  exit 1
fi

docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$FICHIER"

echo "Restauration terminée depuis : $FICHIER"
