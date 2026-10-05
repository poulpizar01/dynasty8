// Configuration de la CLI Prisma (migrations, génération du client).
// Schéma en plusieurs fichiers : prisma/schema/socle.prisma (mutualisé) et prisma/schema/entreprise.prisma (propre au site).
// L'URL n'est exigée que par les commandes qui touchent la base (migrate) : la génération du client s'en passe.
import { defineConfig } from 'prisma/config';
import { databaseUrl } from './src/socle/database-url.js';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl(false) },
});
