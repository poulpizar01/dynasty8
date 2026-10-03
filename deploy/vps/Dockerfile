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

# L'application ne tourne JAMAIS en root : l'image node fournit déjà un
# utilisateur "node" (uid 1000) sans privilège. Elle n'écrit jamais sur
# disque : le code reste la propriété de root, en lecture seule pour elle.
USER node

ENV NODE_ENV=production
EXPOSE 3000

# Le schéma PostgreSQL n'est PAS appliqué par ce conteneur quand
# DB_SCHEMA_AUTO=0 : il est appliqué avec le compte admin par le service
# "migration" du compose (psql de l'image postgres). Le serveur se
# contente alors de vérifier que le schéma attendu est présent.
CMD ["node", "server.js"]
