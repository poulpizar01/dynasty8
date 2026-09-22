#!/usr/bin/env bash
# ============================================================================
# Vérifie qu'un fichier .env de déploiement est correctement protégé.
# ----------------------------------------------------------------------------
# Un .env contient TOUS les secrets du site (base, session, Discord, bot,
# stockage des photos). Il doit être lisible par son seul propriétaire.
#
#   bash deploy/verifier-env.sh deploy/operateur/.env      (vérifie)
#   bash deploy/verifier-env.sh deploy/operateur/.env --corriger   (applique chmod 600)
#
# Renvoie 1 si le fichier est trop ouvert : à lancer avant « docker compose up »
# (et dans n'importe quel script de déploiement).
# ============================================================================
set -euo pipefail

FICHIER="${1:-.env}"
CORRIGER="${2:-}"

if [ ! -f "$FICHIER" ]; then
  echo "Erreur : $FICHIER introuvable (copier le .env.example correspondant et le remplir)." >&2
  exit 1
fi

DROITS="$(stat -c '%a' "$FICHIER")"
PROPRIETAIRE="$(stat -c '%U' "$FICHIER")"
MOI="$(id -un)"
PROBLEME=0

if [ "$DROITS" != "600" ] && [ "$DROITS" != "400" ]; then
  echo "ALERTE : $FICHIER est en mode $DROITS (lisible par d'autres comptes du serveur)." >&2
  PROBLEME=1
fi
if [ "$PROPRIETAIRE" != "$MOI" ]; then
  echo "ALERTE : $FICHIER appartient à « $PROPRIETAIRE », pas à « $MOI » (compte qui lance le service)." >&2
  PROBLEME=1
fi

if [ "$PROBLEME" -eq 0 ]; then
  echo "OK : $FICHIER est en mode $DROITS et appartient à $PROPRIETAIRE."
  exit 0
fi

if [ "$CORRIGER" = "--corriger" ]; then
  chmod 600 "$FICHIER"
  echo "Corrigé : chmod 600 $FICHIER (le propriétaire, lui, se change avec « chown $MOI $FICHIER », en root si nécessaire)."
  exit 0
fi

echo "À corriger :  chmod 600 $FICHIER   (et si besoin : chown $MOI $FICHIER)" >&2
exit 1
