// ENTREPRISE — réglages de la page Paramètres (socle/parametres.ts : validation, enregistrement, routes, permission
// « parametres »). Ici seulement ce que Dynasty 8 règle, et la lecture typée dont le reste du site a besoin.
//   - privés : lus par le serveur ou servis aux comptes validés (WebMap, Google Sheets, registre, services, agenda) ;
//   - publics : liens des pages publiques (GET /api/liens, data-lien de layout.js) ; un lien vide masque son bouton.
// Les liens du crédit Roxwood Network (pied de page, « Découvrir nos offres ») ne sont PAS réglables : ils restent
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

// Onglets de la page Paramètres : Liens, Google Sheets et carte, Discord (Apparence : propre à la page). Les aides parlent
// à la Direction, pas à un administrateur : ni .env ni jargon ; un réglage Discord se choisit par son nom (discord).
export const PARAMETRES: GroupeParametres[] = [
  { onglet: 'Liens', titre: 'Espace agents', reglages: [
    { cle: 'registre_url', type: 'lien', libelle: 'Registre (intranet)', aide: 'Bouton « Registre » du menu. Vide : bouton masqué.' },
  ] },
  { onglet: 'Liens', titre: 'Site public', intro: 'Un lien vide masque son bouton.', reglages: [
    { cle: 'discord_agence', type: 'lien', public: true, libelle: 'Discord de l’agence', aide: 'Boutons « Nous contacter » et pied de page.' },
    { cle: 'boutique_vip', type: 'lien', public: true, libelle: 'Boutique VIP', aide: 'Boutons de la page VIP.' },
    { cle: 'discord_partenaire_deco', type: 'lien', public: true, libelle: 'Discord du partenaire décoration', aide: 'Bouton « Rejoindre Terra Home Deco » de l’accueil.' },
  ] },
  { onglet: 'Google Sheets et carte', titre: 'Google Sheets de la Direction', intro: 'Les ventes et locations de chaque agent, lues toutes les 20 minutes pour les primes.', reglages: [
    // enregistré sous la forme d'un lien complet vers l'onglet (identifiant du classeur + gid)
    { cle: 'sheet', type: 'texte', libelle: 'Lien de l’onglet du récapitulatif',
      aide: 'Ouvrez l’onglet dans Google Sheets et collez l’adresse de la barre du navigateur (elle finit par « gid=… »). Le classeur doit être partagé à « Tous les utilisateurs disposant du lien », en lecture.',
      lire: v => { const s = lireLienSheet(v); return s ? lienSheet(s) : { erreur: 'collez le lien du Google Sheets (https://docs.google.com/spreadsheets/d/…).' }; } },
  ] },
  { onglet: 'Google Sheets et carte', titre: 'WebMap', intro: 'La carte interactive du site.', reglages: [
    { cle: 'webmap_origine', type: 'origine', libelle: 'Adresse de la carte',
      aide: 'Par exemple https://carte.exemple.fr. Les visiteurs l’ouvrent par le site, sans voir cette adresse.' },
  ] },
  { onglet: 'Discord', titre: 'Membres en service', intro: 'L’encadré « En service » du menu lit le salon où le bot des services annonce les prises et fins de service.', reglages: [
    { cle: 'services_salon_id', type: 'id-discord', discord: 'salon', libelle: 'Salon des services',
      aide: 'Vide : encadré désactivé. Le bot doit pouvoir lire ce salon et son historique.' },
    { cle: 'services_cloture_heures', type: 'entier', min: 1, max: 72, defaut: 12, libelle: 'Clôture automatique, en heures',
      aide: 'Un service resté ouvert (fin jamais annoncée) est fermé après ce délai ; une vraie fin annoncée plus tard la remplace.' },
  ] },
  // Agenda : présenté en tableau (qui voit, qui crée) par la page ; « Paramètres du site » peut toujours tout créer
  { onglet: 'Discord', titre: 'Agenda partagé', intro: 'Qui voit et qui crée les événements partagés, selon ses rôles Discord. Qui a le droit « Paramètres du site » peut toujours en créer.', reglages: [
    { cle: 'agenda_roles_patrons', type: 'ids-discord', discord: 'role', libelle: 'Qui voit les événements « Patrons »', aide: '' },
    { cle: 'agenda_roles_direction', type: 'ids-discord', discord: 'role', libelle: 'Qui voit les événements « Direction »', aide: '' },
    { cle: 'agenda_role_tous', type: 'id-discord', discord: 'role', libelle: 'Qui voit les événements « Tous »', aide: 'Un seul rôle, par exemple celui commun à tous les employés.' },
    { cle: 'agenda_createurs_patrons', type: 'ids-discord', discord: 'role', libelle: 'Qui crée les événements « Patrons »', aide: '' },
    { cle: 'agenda_createurs_direction', type: 'ids-discord', discord: 'role', libelle: 'Qui crée les événements « Direction »', aide: '' },
    { cle: 'agenda_createurs_tous', type: 'ids-discord', discord: 'role', libelle: 'Qui crée les événements « Tous »', aide: '' },
    { cle: 'agenda_createurs_perso', type: 'ids-discord', discord: 'role', libelle: 'Qui crée un « Perso » pour quelqu’un d’autre',
      aide: 'L’événement est posté dans le ticket ouvert par cette personne. Un « Perso » pour soi reste ouvert à tous.' },
    { cle: 'agenda_categories_tickets', type: 'ids-discord', discord: 'categorie', libelle: 'Catégories des tickets',
      aide: 'Les catégories où Ticket Tool crée les tickets : le site y cherche le ticket de la personne. Le bot doit pouvoir y écrire.' },
  ] },
];

// ---- lecture typée, pour le reste du site ----
export { parametre };
export const lienRegle = lienParametre;
export const webmapOrigine = (): string => origineParametre('webmap_origine');
export const sheetRegle = (): { id: string; gid: string } | null => (parametre('sheet') ? lireLienSheet(parametre('sheet')) : null);
export const idsRegles = idsParametre;
export const entierRegle = entierParametre;
