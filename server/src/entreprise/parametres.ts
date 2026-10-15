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

// présentation Google Slides d'un guide de cohérence : lien de partage (ou identifiant seul) → lien d'ouverture
function lireLienSlides(valeur: string): string | { erreur: string } {
  let id = /^[A-Za-z0-9_-]{20,}$/.test(valeur) ? valeur : null;
  if (!id) try {
    const u = new URL(valeur);
    if (u.protocol === 'https:' && u.hostname === 'docs.google.com') id = u.pathname.match(/^\/presentation\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/)?.[1] ?? null;
  } catch { /* erreur ci-dessous */ }
  return id ? `https://docs.google.com/presentation/d/${id}/edit` : { erreur: 'collez le lien de la présentation Google Slides (https://docs.google.com/presentation/d/…).' };
}
const slides = (cle: string, zone: string) => ({ cle, type: 'lien' as const, public: true, libelle: `Cohérence ${zone}`, aide: '', lire: lireLienSlides });

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
  { onglet: 'Liens', titre: 'Présentations des cohérences', intro: 'Bouton « Ouvrir sur Google Slides » de chaque page de cohérence. La présentation doit être partagée à « Tous les utilisateurs disposant du lien ». Vide : bouton masqué.', reglages: [
    slides('slides_coherence_habitation', 'Habitation'), slides('slides_coherence_garage', 'Garage'),
    slides('slides_coherence_cayo_perico', 'Cayo Perico'), slides('slides_coherence_roxwood', 'Roxwood'),
  ] },
  { onglet: 'Google Sheets et carte', titre: 'Google Sheets de la Direction', intro: 'Les ventes et locations de chaque agent, lues toutes les 5 minutes pour les primes.', reglages: [
    // enregistré sous la forme d'un lien complet vers l'onglet (identifiant du classeur + gid)
    { cle: 'sheet', type: 'texte', libelle: 'Lien de l’onglet du récapitulatif',
      aide: 'Ouvrez l’onglet dans Google Sheets et collez l’adresse de la barre du navigateur (elle finit par « gid=… »). Le classeur doit être partagé à « Tous les utilisateurs disposant du lien », en lecture.',
      lire: v => { const s = lireLienSheet(v); return s ? lienSheet(s) : { erreur: 'collez le lien du Google Sheets (https://docs.google.com/spreadsheets/d/…).' }; } },
  ] },
  { onglet: 'Google Sheets et carte', titre: 'WebMap', intro: 'La carte interactive du site.', reglages: [
    { cle: 'webmap_origine', type: 'origine', libelle: 'Adresse de la carte',
      aide: 'Par exemple https://carte.exemple.fr. Les visiteurs l’ouvrent par le site, sans voir cette adresse.' },
  ] },
  // les prises et fins de service arrivent du bot (événement monitoring.duty, services.ts) : seule la clôture se règle
  { onglet: 'Discord', titre: 'Membres en service', intro: 'Le bot Discord de l’agence envoie au site chaque prise et fin de service lue en jeu : rien d’autre à régler que la clôture automatique.', reglages: [
    { cle: 'services_cloture_heures', type: 'entier', min: 1, max: 72, defaut: 12, libelle: 'Clôture automatique, en heures',
      aide: 'Un service resté ouvert (fin jamais annoncée) est fermé après ce délai ; une vraie fin annoncée plus tard la remplace.' },
  ] },
  // Agenda : qui voit, crée et modifie quoi se règle par grade (page Grades) ; ici, seulement où trouver les tickets
  { onglet: 'Discord', titre: 'Agenda : prévenir sur Discord', intro: 'Un événement créé pour quelqu’un d’autre lui est posté sur Discord : dans son ticket s’il en a un, sinon en message privé. Qui voit, crée et modifie les événements se règle dans la fiche de chaque grade.', reglages: [
    { cle: 'agenda_categories_tickets', type: 'ids-discord', discord: 'categorie', libelle: 'Catégories des tickets',
      aide: 'Les catégories où le bot de tickets les ouvre : le site y cherche le ticket de la personne (le bot doit pouvoir y voir les salons et écrire). Vide : message privé seulement.' },
  ] },
];

// ---- lecture typée, pour le reste du site ----
export { parametre };
export const lienRegle = lienParametre;
export const webmapOrigine = (): string => origineParametre('webmap_origine');
export const sheetRegle = (): { id: string; gid: string } | null => (parametre('sheet') ? lireLienSheet(parametre('sheet')) : null);
export const idsRegles = idsParametre;
export const entierRegle = entierParametre;
