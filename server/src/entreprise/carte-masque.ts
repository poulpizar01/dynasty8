// ENTREPRISE — l'adresse réelle de la WebMap ne parvient jamais au navigateur (exigence : elle ne doit pas fuiter).
// Le relais (carte.ts) passe chaque réponse texte par masquerAdresse : toutes les écritures de l'adresse réelle y sont
// remplacées par celle du sous-domaine du site, pas seulement la forme exacte « https://hote » — un code JavaScript
// l'écrit aussi échappée (« https:\/\/hote »), un lien la porte encodée (« https%3A%2F%2Fhote »), une donnée peut ne
// garder que le nom d'hôte. Fonctions pures, testées par test/carte-masque.test.ts.

const echapperRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// types de réponse lus comme du texte (donc réécrits) : pages, scripts, styles, données, SVG, flux des composants Next.js
export const estTexte = (type: string): boolean =>
  /^\s*(text\/|application\/([\w.+-]*\+)?(javascript|ecmascript|json|xml|x-javascript|manifest\+json)|image\/svg\+xml)/i.test(type);

// origineCarte : adresse réelle (« https://carte.exemple.fr ») ; publique : celle du sous-domaine du site
export function masquerAdresse(texte: string, origineCarte: string, publique: string): string {
  const reelle = new URL(origineCarte), cible = new URL(publique);
  const hote = echapperRegex(reelle.host);
  const remplacer = (t: string, motif: string, par: string) => t.replace(new RegExp(motif, 'gi'), () => par);
  let r = texte;
  // 1. avec le protocole, sous toutes ses écritures (http et https : l'un ou l'autre mène à la carte réelle)
  r = remplacer(r, `https?://${hote}`, cible.origin);
  r = remplacer(r, `https?:\\\\/\\\\/${hote}`, cible.origin.replace(/\//g, '\\/'));
  r = remplacer(r, `https?%3A%2F%2F${hote}`, encodeURIComponent(cible.origin));
  r = remplacer(r, `https?\\\\u002F\\\\u002F${hote}`, cible.origin.replace(/\//g, '\\u002F'));
  // 2. sans protocole (« //hote », échappé ou non), puis 3. le nom d'hôte seul, où qu'il reste
  r = remplacer(r, `//${hote}`, `//${cible.host}`);
  r = remplacer(r, hote, cible.host);
  return r;
}

// Politique de contenu des pages de la carte : rien d'autre que le sous-domaine lui-même ('self'), quel que soit le
// code que l'opérateur de la carte y met (mesure d'audience, polices, images hébergées ailleurs) — confidentialite.html
// affirme qu'aucun tiers n'est contacté. 'unsafe-inline' et 'unsafe-eval' restent permis : le code de la carte n'est
// pas le nôtre, et il tourne sur son propre sous-domaine, sans accès au site ni à sa session.
export const cspCarte = (ancetres: string[]): string => [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${ancetres.join(' ')}`,
].join('; ');
