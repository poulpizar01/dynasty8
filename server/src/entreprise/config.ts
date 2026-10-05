// ENTREPRISE — réglages de Dynasty 8 lus dans l'environnement (.env, dernière section de .env.example). Contrôlés au
// démarrage avec les aides du socle : un réglage présent mais mal formé arrête le serveur avec un message clair ; un
// réglage absent désactive seulement la fonction concernée.
import { adresse, fail } from '../socle/config.js';

const env = process.env;

// clé du bot de ventes (en-tête Authorization: Bearer …) ; vide : réception des ventes désactivée
const statsBotSecret = (env.STATS_BOT_SECRET || '').trim();
if (statsBotSecret && statsBotSecret.length < 16) fail('STATS_BOT_SECRET dans .env : 16 caractères au moins (openssl rand -hex 32)');

// Google Sheets de la Direction : identifiant du classeur et de l'onglet (gid). Volontairement absents du dépôt : le
// classeur est partagé « toute personne disposant du lien — lecteur », son identifiant suffit à le lire.
const sheetId = (env.GOOGLE_SHEET_ID || '').trim();
const sheetGid = (env.GOOGLE_SHEET_GID || '').trim();
if (sheetId && !/^[A-Za-z0-9_-]{20,}$/.test(sheetId)) fail('GOOGLE_SHEET_ID dans .env : identifiant de classeur illisible');
if (sheetGid && !/^\d+$/.test(sheetGid)) fail('GOOGLE_SHEET_GID dans .env : un nombre (gid de l’onglet dans l’adresse du classeur)');

// tableau des cohérences (lien https, servi aux seuls comptes validés) et WebMap (relayée sur son sous-domaine)
const coherencesUrl = adresse('COHERENCES_SHEET_URL');
if (coherencesUrl && !coherencesUrl.startsWith('https://')) fail('COHERENCES_SHEET_URL dans .env doit commencer par https://');

export const configEntreprise = {
  statsBotSecret,
  sheet: sheetId ? { id: sheetId, gid: sheetGid || '0' } : null,
  coherencesUrl,
};
