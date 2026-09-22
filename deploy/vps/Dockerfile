# Image de production (VPS Dynasty 8 ou serveur de l'opérateur).
# Contexte de build attendu : la racine du dépôt (voir compose.yaml :
# build.context: ../..) — nécessaire pour copier package.json, server.js,
# src/, public/ et les fichiers *.sql lus au démarrage.
FROM node:22-alpine

WORKDIR /app

# Dépendances d'abord (meilleur cache Docker si le code change sans que les
# dépendances changent).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Reste du code applicatif.
COPY server.js ./
COPY src ./src
COPY public ./public
COPY schema.postgres.sql ./
# Scripts d'administration lancés à la main (docker compose exec app node scripts/…),
# jamais au démarrage : migration du schéma, migration et nettoyage des photos,
# diagnostic du stockage.
COPY scripts ./scripts

# L'application ne tourne JAMAIS en root : l'image node fournit déjà un
# utilisateur "node" (uid 1000) sans privilège. Seul /app/rapports doit être
# écrivable (comptes rendus des scripts) ; le reste du code reste en lecture.
RUN mkdir -p /app/rapports && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 3000

# Le schéma PostgreSQL n'est PAS appliqué par ce conteneur quand
# DB_SCHEMA_AUTO=0 : il est appliqué une fois, avec le compte admin, par le
# service "migration" du compose (scripts/appliquer-schema.js). Le serveur se
# contente alors de vérifier que le schéma attendu est présent.
CMD ["node", "server.js"]
