// ENTREPRISE — réglages de Dynasty 8 lus dans l'environnement (.env, dernière section de .env.example). Contrôlés au
// démarrage avec les aides du socle : un réglage présent mais mal formé arrête le serveur avec un message clair ; un
// réglage absent désactive seulement la fonction concernée.
import { fail } from '../socle/config.js';

const env = process.env;

// clé du bot de ventes (en-tête Authorization: Bearer …) ; vide : réception des ventes désactivée
const statsBotSecret = (env.STATS_BOT_SECRET || '').trim();
if (statsBotSecret && statsBotSecret.length < 16) fail('STATS_BOT_SECRET dans .env : 16 caractères au moins (openssl rand -hex 32)');

// sous-domaine de la WebMap (infrastructure : nginx, certificat) ; vide : carte désactivée
const webmapHote = (env.WEBMAP_HOTE || '').trim().toLowerCase();
if (webmapHote && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(webmapHote)) fail(`WEBMAP_HOTE dans .env : un nom de domaine (ex. carte.monsite.fr) : ${webmapHote}`);

// Les liens (WebMap, Google Sheets, registre…) ne viennent pas du .env : ils se règlent dans l'onglet Paramètres
// (parametres.ts).
export const configEntreprise = { statsBotSecret, webmapHote };
