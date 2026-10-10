// ENTREPRISE — réglages de la page Paramètres (socle/parametres.ts : validation, enregistrement, routes, permission
// « parametres »). Ici seulement ce que Dynasty 8 règle, et la lecture typée dont le reste du site a besoin.
//   - privés : lus par le serveur ou servis aux comptes validés (WebMap, Google Sheets, registre, services, agenda) ;
//   - publics : liens des pages publiques (GET /api/liens, data-lien de layout.js) ; un lien vide masque son bouton.
// Les liens du crédit Roxwood Network (pied de page, « Découvrir nos offres ») ne sont PAS réglables : ils restent
// écrits dans les pages.
import type { GroupeParametres } from '../socle/contrat.js';
import { entierParametre, idsParametre, lienParametre, origineParametre, parametre } from '../socle/parametres.js';

// lien de partage Google Sheets (ou identifiant seul) → { id, gid }
export function lireLienSheet(valeur: string): { id: string; gid: string } | null {
  if (/^[A-Za-z0-9_-]{20,}$/.test(valeur)) return { id: valeur, gid: '0' };
  let u: URL;
  try { u = new URL(valeur); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const id = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/)?.[1];
  if (!id) return null;
  return { id, gid: u.hash.match(/gid=(\d+)/)?.[1] ?? u.search.match(/[?&]gid=(\d+)/)?.[1] ?? '0' };
}
const lienSheet = (s: { id: string; gid: string }) => `https://docs.google.com/spreadsheets/d/${s.id}/edit#gid=${s.gid}`;

const ROLES = 'Un ou plusieurs IDs de rôles Discord, séparés par des espaces (clic droit sur le rôle → Copier l’identifiant).';
const TOUJOURS = 'Qui a la permission « Paramètres du site » le peut toujours.';
export const PARAMETRES: GroupeParametres[] = [
  { titre: '🔗 Liens de l’espace agents', intro: 'Lus par le serveur ou montrés aux seuls agents connectés.', reglages: [
    { cle: 'webmap_origine', type: 'origine', libelle: 'WebMap',
      aide: 'Adresse de la carte interactive (ex. https://carte.exemple.fr). Le site la relaie sur son sous-domaine : cette adresse n’est jamais envoyée au navigateur.' },
    // enregistré sous la forme d'un lien complet vers l'onglet (identifiant du classeur + gid)
    { cle: 'sheet', type: 'texte', libelle: 'Google Sheets de la synchronisation',
      aide: 'Ouvrez dans Google Sheets l’onglet du récapitulatif des ventes, puis collez ici l’adresse de la barre du navigateur : elle doit se terminer par « gid=… », qui désigne cet onglet (sans gid, c’est le premier onglet du classeur qui est lu). Le classeur doit être partagé en lecture « Tous les utilisateurs disposant du lien ».',
      lire: v => { const s = lireLienSheet(v); return s ? lienSheet(s) : { erreur: 'collez le lien du Google Sheets (https://docs.google.com/spreadsheets/d/…).' }; } },
    { cle: 'registre_url', type: 'lien', libelle: 'Registre (intranet)', aide: 'Lien du bouton « Registre » de l’espace agents. Vide : le bouton est masqué.' },
  ] },
  { titre: '🌐 Liens des pages publiques', intro: 'Boutons des pages du site public.', reglages: [
    { cle: 'discord_agence', type: 'lien', public: true, libelle: 'Discord de l’agence', aide: '« Nous contacter », pied de page et boutons de contact des pages publiques.' },
    { cle: 'boutique_vip', type: 'lien', public: true, libelle: 'Boutique VIP', aide: 'Boutons de la page VIP.' },
    { cle: 'discord_partenaire_deco', type: 'lien', public: true, libelle: 'Discord du partenaire décoration', aide: 'Bouton « Rejoindre Terra Home Deco » de l’accueil.' },
  ] },
  { titre: '🟢 Membres en service', intro: 'Lecture du salon Discord où le bot des services publie les prises et fins de service.', reglages: [
    { cle: 'services_salon_id', type: 'id-discord', libelle: 'ID du salon des services',
      aide: 'Salon où le bot des services publie « Service démarré » / « Service terminé » (clic droit sur le salon → Copier l’identifiant). Le site le lit chaque minute avec le jeton du bot (DISCORD_BOT_TOKEN), qui doit pouvoir voir ce salon et ses anciens messages. Vide : encadré « En service » désactivé.' },
    { cle: 'services_cloture_heures', type: 'entier', min: 1, max: 72, defaut: 12, libelle: 'Clôture automatique (heures)',
      aide: 'Un service resté ouvert plus longtemps (fin jamais publiée) est fermé à son début + ce nombre d’heures ; une vraie fin publiée plus tard la remplace. Vide : 12 heures.' },
  ] },
  { titre: '📅 Agenda partagé', intro: 'Qui voit et qui crée les événements partagés, selon ses rôles Discord.', reglages: [
    { cle: 'agenda_roles_patrons', type: 'ids-discord', libelle: 'Rôles qui voient les événements « Patrons »', aide: ROLES },
    { cle: 'agenda_roles_direction', type: 'ids-discord', libelle: 'Rôles qui voient les événements « Direction »', aide: ROLES },
    { cle: 'agenda_role_tous', type: 'id-discord', libelle: 'Rôle qui voit les événements « Tous »', aide: 'Un seul ID de rôle Discord (par exemple le rôle commun à tous les employés).' },
    { cle: 'agenda_createurs_patrons', type: 'ids-discord', libelle: 'Rôles qui créent des événements « Patrons »', aide: TOUJOURS },
    { cle: 'agenda_createurs_direction', type: 'ids-discord', libelle: 'Rôles qui créent des événements « Direction »', aide: TOUJOURS },
    { cle: 'agenda_createurs_tous', type: 'ids-discord', libelle: 'Rôles qui créent des événements « Tous »', aide: TOUJOURS },
    { cle: 'agenda_createurs_perso', type: 'ids-discord', libelle: 'Rôles qui créent un événement « Perso » pour quelqu’un d’autre',
      aide: `L’événement est posté dans le ticket ouvert par cette personne. Un « Perso » pour soi-même reste ouvert à tous. ${TOUJOURS}` },
    { cle: 'agenda_categories_tickets', type: 'ids-discord', libelle: 'Catégories des tickets',
      aide: 'IDs des catégories Discord où Ticket Tool crée les tickets. Le site y cherche le ticket ouvert par la personne (le plus récent) ; le bot doit pouvoir y écrire.' },
  ] },
];

// ---- lecture typée, pour le reste du site ----
export { parametre };
export const lienRegle = lienParametre;
export const webmapOrigine = (): string => origineParametre('webmap_origine');
export const sheetRegle = (): { id: string; gid: string } | null => (parametre('sheet') ? lireLienSheet(parametre('sheet')) : null);
export const idsRegles = idsParametre;
export const entierRegle = entierParametre;
