// ============================================================================
// Lecture bornée du corps des requêtes /api/* (utilisé par server.js)
// ----------------------------------------------------------------------------
// server.js lit le corps entier en mémoire avant de le passer à src/index.js.
// Sans limite, un envoi énorme saturerait la mémoire du serveur avant même
// qu'un contrôle de droits ou de taille puisse s'exécuter. On refuse donc :
//   - dès l'en-tête Content-Length s'il annonce plus que la limite ;
//   - en cours de lecture dès que la limite est dépassée (corps « chunked »
//     ou Content-Length mensonger), sans accumuler la suite.
// ============================================================================

export const LIMITE_API_PAR_DEFAUT = 32 * 1024 * 1024; // annonces avec d'anciennes photos base64 (10 × 2 Mo)
export const LIMITE_PHOTO_PAR_DEFAUT = 8 * 1024 * 1024;

export class ErreurCorpsTropGros extends Error {
  constructor(limite) {
    super("Corps de requête trop volumineux.");
    this.name = "ErreurCorpsTropGros";
    this.limite = limite;
  }
}

function entierPositif(valeur, defaut) {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

const ROUTES_PHOTO = new Set(["/api/biens/photo", "/api/profil/photo"]);

// Les routes d'import de photo ont leur propre limite (taille maximale
// d'une photo, + marge pour l'ancien format JSON/base64 qui grossit d'un tiers).
export function limiteCorpsPour(chemin, env = {}) {
  if (ROUTES_PHOTO.has(chemin)) {
    const photo = entierPositif(env.FBFA_PHOTO_TAILLE_MAX, LIMITE_PHOTO_PAR_DEFAUT);
    return Math.ceil(photo * 1.4) + 64 * 1024;
  }
  return entierPositif(env.API_TAILLE_CORPS_MAX, LIMITE_API_PAR_DEFAUT);
}

export async function lireCorpsLimite(req, limite) {
  const annonce = Number(req.headers["content-length"]);
  if (Number.isFinite(annonce) && annonce > limite) throw new ErreurCorpsTropGros(limite);
  const morceaux = [];
  let total = 0;
  for await (const morceau of req) {
    total += morceau.length;
    if (total > limite) throw new ErreurCorpsTropGros(limite);
    morceaux.push(morceau);
  }
  return Buffer.concat(morceaux, total);
}
