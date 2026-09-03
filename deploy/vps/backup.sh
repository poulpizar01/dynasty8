#!/usr/bin/env bash
# Sauvegarde la base PostgreSQL du VPS dans ./backups/ (format compressé
# pg_dump -Fc, restaurable avec restore.sh / pg_restore).
# Usage : ./backup.sh   (à lancer depuis deploy/vps/)
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Erreur : .env introuvable (copier .env.example en .env et le remplir d'abord)." >&2
  exit 1
fi
set -a; source .env; set +a

mkdir -p backups
FICHIER="backups/dynasty8_$(date +%Y%m%d_%H%M%S).dump"

docker compose exec -T postgres pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$FICHIER"

echo "Sauvegarde créée : $FICHIER"
