// ============================================================================
// Nom d'hôte public du site, derrière un reverse proxy
// ----------------------------------------------------------------------------
// nginx (opérateur) ou Caddy (VPS) proxifient tout vers le serveur Node. Selon
// leur configuration, l'en-tête Host reçu peut porter l'adresse INTERNE
// (127.0.0.1:3010, app:3000…). X-Forwarded-Host, quand le proxy le transmet,
// donne l'adresse réellement demandée par le visiteur : c'est elle qu'il faut
// utiliser pour reconstruire les URL (retour OAuth Discord, cookies).
//
// Un en-tête reste une donnée envoyée par un tiers : on ne l'accepte que si
// l'on fait confiance au proxy ET s'il ressemble à un nom d'hôte (rien
// d'autre ne doit pouvoir se glisser dans une URL construite ensuite).
// ============================================================================

// 255 caractères : longueur maximale d'un nom de domaine.
const RE_HOTE = /^[A-Za-z0-9.-]{1,255}(:\d{1,5})?$/;

export function choisirHote({ host, xForwardedHost, confiance }) {
  if (confiance && xForwardedHost) {
    // Une chaîne de proxys ajoute ses hôtes séparés par des virgules : le
    // premier est celui vu par le visiteur.
    const premier = String(xForwardedHost).split(",")[0].trim();
    if (RE_HOTE.test(premier)) return premier;
  }
  return host;
}
