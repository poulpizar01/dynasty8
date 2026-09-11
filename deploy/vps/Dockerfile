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
# jamais au démarrage : migration et nettoyage des photos, diagnostic du stockage.
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

# Le serveur applique lui-même son schéma PostgreSQL au démarrage (server.js) :
# aucune étape de migration séparée à lancer ici.
CMD ["node", "server.js"]
