// ENTREPRISE — onglet Paramètres : les liens et réglages du site se règlent dans la gestion (permission « parametres »),
// jamais dans le code ni dans le .env. Rangés dans les réglages du socle (clés « site.* ») : un changement s'applique
// aussitôt, sans redémarrage.
//   - privés : lus par le serveur ou servis aux comptes validés (WebMap, Google Sheets, registre, services, agenda) ;
//   - publics : liens des pages publiques, servis par GET /api/liens ; un lien vide masque son bouton.
// Les liens du crédit Roxwood Network (pied de page, « Découvrir nos offres ») ne sont PAS réglables : ils restent
// écrits dans les pages.
import { Router } from 'express';
import { hoteInterdit } from '../socle/adresses.js';
import { body, permission } from '../socle/http.js';
import { definirReglage, reglage } from '../socle/reglages.js';

type Type = 'origine' | 'url' | 'sheet' | 'snowflake' | 'snowflakes' | 'entier';
type Definition = { cle: string; groupe: 'prive' | 'services' | 'agenda' | 'public'; type: Type; libelle: string; aide: string; min?: number; max?: number; defaut?: number };

const ROLES = 'Un ou plusieurs IDs de rôles Discord, séparés par des espaces (clic droit sur le rôle → Copier l’identifiant).';
const TOUJOURS = 'Qui a la permission « Paramètres du site » le peut toujours.';
export const DEFINITIONS: Definition[] = [
  { cle: 'webmap_origine', groupe: 'prive', type: 'origine', libelle: 'WebMap',
    aide: 'Adresse de la carte interactive (ex. https://carte.exemple.fr). Le site la relaie sur son sous-domaine : cette adresse n’est jamais envoyée au navigateur.' },
  { cle: 'sheet', groupe: 'prive', type: 'sheet', libelle: 'Google Sheets de la synchronisation',
    aide: 'Ouvrez dans Google Sheets l’onglet du récapitulatif des ventes, puis collez ici l’adresse de la barre du navigateur : elle doit se terminer par « gid=… », qui désigne cet onglet (sans gid, c’est le premier onglet du classeur qui est lu). Le classeur doit être partagé en lecture « Tous les utilisateurs disposant du lien ».' },
  { cle: 'registre_url', groupe: 'prive', type: 'url', libelle: 'Registre (intranet)',
    aide: 'Lien du bouton « Registre » de l’espace agents. Vide : le bouton est masqué.' },
  { cle: 'services_salon_id', groupe: 'services', type: 'snowflake', libelle: 'ID du salon des services',
    aide: 'Salon où le bot des services publie « Service démarré » / « Service terminé » (clic droit sur le salon → Copier l’identifiant). Le site le lit chaque minute avec le jeton du bot (DISCORD_BOT_TOKEN), qui doit pouvoir voir ce salon et ses anciens messages. Vide : encadré « En service » désactivé.' },
  { cle: 'services_cloture_heures', groupe: 'services', type: 'entier', min: 1, max: 72, defaut: 12, libelle: 'Clôture automatique (heures)',
    aide: 'Un service resté ouvert plus longtemps (fin jamais publiée) est fermé à son début + ce nombre d’heures ; une vraie fin publiée plus tard la remplace. Vide : 12 heures.' },
  { cle: 'agenda_roles_patrons', groupe: 'agenda', type: 'snowflakes', libelle: 'Rôles qui voient les événements « Patrons »', aide: ROLES },
  { cle: 'agenda_roles_direction', groupe: 'agenda', type: 'snowflakes', libelle: 'Rôles qui voient les événements « Direction »', aide: ROLES },
  { cle: 'agenda_role_tous', groupe: 'agenda', type: 'snowflake', libelle: 'Rôle qui voit les événements « Tous »', aide: 'Un seul ID de rôle Discord (par exemple le rôle commun à tous les employés).' },
  { cle: 'agenda_createurs_patrons', groupe: 'agenda', type: 'snowflakes', libelle: 'Rôles qui créent des événements « Patrons »', aide: TOUJOURS },
  { cle: 'agenda_createurs_direction', groupe: 'agenda', type: 'snowflakes', libelle: 'Rôles qui créent des événements « Direction »', aide: TOUJOURS },
  { cle: 'agenda_createurs_tous', groupe: 'agenda', type: 'snowflakes', libelle: 'Rôles qui créent des événements « Tous »', aide: TOUJOURS },
  { cle: 'agenda_createurs_perso', groupe: 'agenda', type: 'snowflakes', libelle: 'Rôles qui créent un événement « Perso » pour quelqu’un d’autre',
    aide: `L’événement est posté dans le ticket ouvert par cette personne. Un « Perso » pour soi-même reste ouvert à tous. ${TOUJOURS}` },
  { cle: 'agenda_categories_tickets', groupe: 'agenda', type: 'snowflakes', libelle: 'Catégories des tickets',
    aide: 'IDs des catégories Discord où Ticket Tool crée les tickets. Le site y cherche le ticket ouvert par la personne (le plus récent) ; le bot doit pouvoir y écrire.' },
  { cle: 'discord_agence', groupe: 'public', type: 'url', libelle: 'Discord de l’agence', aide: '« Nous contacter », pied de page et boutons de contact des pages publiques.' },
  { cle: 'boutique_vip', groupe: 'public', type: 'url', libelle: 'Boutique VIP', aide: 'Boutons de la page VIP.' },
  { cle: 'discord_partenaire_deco', groupe: 'public', type: 'url', libelle: 'Discord du partenaire décoration', aide: 'Bouton « Rejoindre Terra Home Deco » de l’accueil.' },
];

const CLE = (cle: string) => `site.${cle}`;
export const parametre = (cle: string): string => reglage(CLE(cle)) ?? '';

// ---- lecture typée, pour le reste du site ----
const lireUrl = (v: string): URL | null => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u : null; } catch { return null; } };
export const lienRegle = (cle: string): string => lireUrl(parametre(cle))?.toString() ?? '';
export const webmapOrigine = (): string => lireUrl(parametre('webmap_origine'))?.origin ?? '';
export const sheetRegle = (): { id: string; gid: string } | null => { const id = parametre('sheet_id'); return id ? { id, gid: parametre('sheet_gid') || '0' } : null; };
export const idsRegles = (cle: string): string[] => parametre(cle).split(/\s+/).filter(Boolean);
export const entierRegle = (cle: string): number => {
  const d = DEFINITIONS.find(x => x.cle === cle), n = Number(parametre(cle));
  return Number.isInteger(n) && n >= (d?.min ?? -Infinity) && n <= (d?.max ?? Infinity) && parametre(cle) !== '' ? n : d?.defaut ?? 0;
};

// ---- validation ----
// Le serveur va chercher la WebMap pour le compte du visiteur : jamais lui-même ni un réseau privé.
function hoteInterne(hote: string): boolean {
  const h = hote.toLowerCase().replace(/^\[|\]$/g, '');
  // adresse IP interne, localhost (socle) ; en plus, noms qui ne sortent pas du réseau local
  return hoteInterdit(h) || /\.(local|internal)$/.test(h) || (!h.includes('.') && !h.includes(':'));
}
// lien de partage Google Sheets (ou identifiant seul) → { id, gid }
export function lireLienSheet(valeur: string): { id: string; gid: string } | null {
  if (/^[A-Za-z0-9_-]{20,}$/.test(valeur)) return { id: valeur, gid: '0' };
  const u = lireUrl(valeur);
  if (!u || u.hostname !== 'docs.google.com') return null;
  const id = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/)?.[1];
  if (!id) return null;
  return { id, gid: u.hash.match(/gid=(\d+)/)?.[1] ?? u.search.match(/[?&]gid=(\d+)/)?.[1] ?? '0' };
}
const lienSheet = (id: string, gid: string) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid || '0'}` : '');

// saisie → réglages à écrire ({ clé: valeur }), ou un message d'erreur
function valider(d: Definition, saisie: unknown): Record<string, string> | string {
  const v = String(saisie ?? '').trim().slice(0, 500);
  if (d.type === 'sheet') {
    if (!v) return { sheet_id: '', sheet_gid: '' };
    const s = lireLienSheet(v);
    return s ? { sheet_id: s.id, sheet_gid: s.gid } : `${d.libelle} : collez le lien du Google Sheets (https://docs.google.com/spreadsheets/d/…).`;
  }
  if (!v) return { [d.cle]: '' };
  if (d.type === 'snowflakes') {
    const ids = v.split(/[\s,;]+/).filter(Boolean), faux = ids.find(x => !/^\d{15,21}$/.test(x));
    return faux ? `${d.libelle} : « ${faux.slice(0, 30)} » n’est pas un identifiant Discord (15 à 21 chiffres).` : { [d.cle]: [...new Set(ids)].join(' ') };
  }
  if (d.type === 'snowflake') return /^\d{15,21}$/.test(v) ? { [d.cle]: v } : `${d.libelle} : un identifiant Discord est un nombre de 15 à 21 chiffres.`;
  if (d.type === 'entier') {
    const n = Number(v);
    return Number.isInteger(n) && n >= d.min! && n <= d.max! ? { [d.cle]: String(n) } : `${d.libelle} : un nombre entier entre ${d.min} et ${d.max} est attendu.`;
  }
  const u = lireUrl(v);
  if (!u) return `${d.libelle} : un lien complet en https:// est attendu.`;
  if (d.type === 'origine') return hoteInterne(u.hostname) ? `${d.libelle} : cette adresse désigne le serveur lui-même ou un réseau privé.` : { [d.cle]: u.origin };
  return { [d.cle]: u.toString() };
}

// ---- routes ----
export const parametres = Router();
const gerer = permission('parametres');

// liens des pages publiques (rien de privé ici)
parametres.get('/api/liens', (_req, res) => {
  res.json(Object.fromEntries(DEFINITIONS.filter(d => d.groupe === 'public').map(d => [d.cle, lienRegle(d.cle)])));
});

parametres.get('/api/parametres', ...gerer, (_req, res) => {
  res.json({
    reglages: DEFINITIONS.map(d => ({
      cle: d.cle, groupe: d.groupe, type: d.type, libelle: d.libelle, aide: d.aide,
      valeur: d.type === 'sheet' ? lienSheet(parametre('sheet_id'), parametre('sheet_gid')) : parametre(d.cle),
      ...(d.type === 'entier' && { min: d.min, max: d.max, defaut: d.defaut }),
    })),
  });
});

// enregistre les réglages présents dans le corps ; tout ou rien (une erreur n'en écrit aucun)
parametres.put('/api/parametres', ...gerer, async (req, res) => {
  const b = body(req), ecrire: Record<string, string> = {};
  for (const d of DEFINITIONS) {
    if (b[d.cle] === undefined) continue;
    const r = valider(d, b[d.cle]);
    if (typeof r === 'string') { res.status(400).json({ error: r }); return; }
    Object.assign(ecrire, r);
  }
  for (const [cle, valeur] of Object.entries(ecrire)) await definirReglage(CLE(cle), valeur || null);
  res.json({ ok: true });
});
