# Image de production pour un VPS (hors Railway, qui utilise son propre
# système de build Railpack et n'a pas besoin de ce fichier).
# Contexte de build attendu : la racine du dépôt (voir compose.yaml :
# build.context: ../..) — nécessaire pour copier package.json, server.js,
# src/, public/ et les fichiers *.sql lus au démarrage.
FROM node:22-alpine

WORKDIR /app

# Dépendances d'abord (meilleur cache Docker si le code change sans que les
# dépendances changent).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Reste du code applicatif (identique à ce qui tourne sur Railway : aucune
# adaptation n'a été faite ici).
COPY server.js ./
COPY src ./src
COPY public ./public
COPY schema.sql schema.postgres.sql ./
COPY donnees-cloudflare.postgres.sql ./

ENV NODE_ENV=production
EXPOSE 3000

# Le serveur applique lui-même son schéma PostgreSQL et l'import unique des
# données au démarrage (server.js) — aucune étape de migration séparée à
# lancer ici, exactement comme sur Railway.
CMD ["node", "server.js"]
