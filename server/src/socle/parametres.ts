// SOCLE — Paramètres : les liens et réglages propres au site (lien d'une boutique, adresse d'un service relayé, salon
// Discord, seuil…) se règlent dans la gestion (permission « parametres »), jamais dans le code ni dans le .env. Un
// changement s'applique aussitôt, sans redémarrage. L'entreprise déclare ses réglages dans entreprise.parametres
// (contrat.ts), par groupes ; le socle les valide, les range dans ses réglages (clés « site.<cle> ») et sert :
//   - GET /api/liens : les liens publics (déclarés `public`), pour les pages publiques : `data-lien="<cle>"`, rempli par
//     socle.js ; un lien vide masque l'élément ;
//   - GET / PUT /api/parametres : la page Paramètres de la gestion (construite d'après les déclarations).
// Lecture dans le code de l'entreprise : parametre(), lienParametre(), origineParametre(), entierParametre(),
// idsParametre(). Ce module ne lit pas entreprise/index.ts (dépendance circulaire) : index.ts lui transmet les
// déclarations au démarrage (declarerParametres).
import { Router } from 'express';
import type { DefinitionParametre, GroupeParametres } from './contrat.js';
import { hoteInterdit } from './adresses.js';
import { body, permission } from './http.js';
import { definirReglage, reglage } from './reglages.js';

let groupes: GroupeParametres[] = [];
const definitions = new Map<string, DefinitionParametre>();

// contrôlées au démarrage : une erreur de déclaration se voit tout de suite
export function declarerParametres(liste: GroupeParametres[] = []): void {
  groupes = liste;
  definitions.clear();
  for (const g of liste) for (const d of g.reglages) {
    if (!/^[a-z0-9_]{2,34}$/.test(d.cle)) throw new Error(`entreprise.parametres : clé invalide « ${d.cle} » (minuscules, chiffres, _ ; 34 caractères au plus)`);
    if (definitions.has(d.cle)) throw new Error(`entreprise.parametres : « ${d.cle} » déclaré deux fois`);
    if (d.public && d.type !== 'lien') throw new Error(`entreprise.parametres : « ${d.cle} » : seul un lien peut être public`);
    if (d.type === 'entier' && !(Number.isInteger(d.min) && Number.isInteger(d.max) && Number.isInteger(d.defaut))) throw new Error(`entreprise.parametres : « ${d.cle} » : min, max et defaut entiers attendus`);
    definitions.set(d.cle, d);
  }
}

const definition = (cle: string): DefinitionParametre => {
  const d = definitions.get(cle);
  if (!d) throw new Error(`paramètre « ${cle} » non déclaré dans entreprise.parametres`);
  return d;
};

// ---- lecture ----
// valeur enregistrée (texte, déjà validée à l'enregistrement), '' si vide
export const parametre = (cle: string): string => (definition(cle), reglage(`site.${cle}`) ?? '');
const https = (v: string): URL | null => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u : null; } catch { return null; } };
export const lienParametre = (cle: string): string => https(parametre(cle))?.toString() ?? '';
export const origineParametre = (cle: string): string => https(parametre(cle))?.origin ?? '';
export const idsParametre = (cle: string): string[] => parametre(cle).split(/\s+/).filter(Boolean);
export const entierParametre = (cle: string): number => {
  const d = definition(cle), v = parametre(cle), n = Number(v);
  return v !== '' && Number.isInteger(n) && n >= d.min! && n <= d.max! ? n : d.defaut!;
};

// ---- validation : saisie → valeur à enregistrer ('' : vide), ou message d'erreur ----
export function validerParametre(d: DefinitionParametre, saisie: unknown): { valeur: string } | { erreur: string } {
  const v = String(saisie ?? '').trim().slice(0, 500);
  if (!v) return { valeur: '' };
  if (d.lire) { const r = d.lire(v); return typeof r === 'string' ? { valeur: r } : { erreur: `${d.libelle} : ${r.erreur}` }; }
  switch (d.type) {
    case 'texte': return { valeur: v.slice(0, d.max ?? 200) };
    case 'entier': {
      const n = Number(v);
      return Number.isInteger(n) && n >= d.min! && n <= d.max! ? { valeur: String(n) } : { erreur: `${d.libelle} : un nombre entier entre ${d.min} et ${d.max} est attendu.` };
    }
    case 'id-discord': return /^\d{15,21}$/.test(v) ? { valeur: v } : { erreur: `${d.libelle} : un identifiant Discord est un nombre de 15 à 21 chiffres.` };
    case 'ids-discord': {
      const ids = v.split(/[\s,;]+/).filter(Boolean), faux = ids.find(x => !/^\d{15,21}$/.test(x));
      return faux ? { erreur: `${d.libelle} : « ${faux.slice(0, 30)} » n’est pas un identifiant Discord (15 à 21 chiffres).` } : { valeur: [...new Set(ids)].slice(0, 50).join(' ') };
    }
    case 'lien': case 'origine': {
      const u = https(v);
      if (!u) return { erreur: `${d.libelle} : un lien complet en https:// est attendu.` };
      // une origine est appelée par le serveur : jamais lui-même ni le réseau interne (recontrôlé à chaque connexion)
      if (d.type === 'origine') return hoteInterdit(u.hostname) ? { erreur: `${d.libelle} : cette adresse désigne le serveur lui-même ou un réseau privé.` } : { valeur: u.origin };
      return { valeur: u.toString() };
    }
  }
}

// ---- routes ----
export const parametres = Router();
const gerer = permission('parametres');

// liens des pages publiques (rien de privé ici)
parametres.get('/api/liens', (_req, res) => {
  res.json(Object.fromEntries([...definitions.values()].filter(d => d.public).map(d => [d.cle, lienParametre(d.cle)])));
});

parametres.get('/api/parametres', ...gerer, (_req, res) => {
  res.json({
    groupes: groupes.map(g => ({
      titre: g.titre, intro: g.intro ?? '',
      reglages: g.reglages.map(d => {
        const valeur = parametre(d.cle);
        return {
          cle: d.cle, type: d.type, libelle: d.libelle, aide: d.aide, public: !!d.public,
          valeur: d.afficher ? d.afficher(valeur) : valeur,
          ...(d.type === 'entier' && { min: d.min, max: d.max, defaut: d.defaut }),
        };
      }),
    })),
  });
});

// enregistre les réglages présents dans le corps ; tout ou rien (une erreur n'en écrit aucun)
parametres.put('/api/parametres', ...gerer, async (req, res) => {
  const b = body(req), ecrire: [string, string][] = [];
  for (const d of definitions.values()) {
    if (b[d.cle] === undefined) continue;
    const r = validerParametre(d, b[d.cle]);
    if ('erreur' in r) { res.status(400).json({ error: r.erreur }); return; }
    ecrire.push([d.cle, r.valeur]);
  }
  for (const [cle, valeur] of ecrire) await definirReglage(`site.${cle}`, valeur || null);
  res.json({ ok: true });
});
