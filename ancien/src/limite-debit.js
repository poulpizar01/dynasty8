// ============================================================================
// Limite de débit en mémoire (fenêtre glissante)
// ----------------------------------------------------------------------------
// Rien n'empêchait jusqu'ici une boucle — volontaire ou accidentelle — de
// marteler les routes du site : connexions Discord en rafale, messages de
// messagerie, requêtes sur le proxy de carte (public). Ce limiteur borne le
// nombre d'appels par « clé » (adresse IP, ou identifiant de membre) sur une
// fenêtre de temps.
//
// En mémoire du processus, volontairement : le site tourne en UN seul
// processus Node (voir l'unité systemd et le compose). Si un jour il tournait
// en plusieurs exemplaires, chaque exemplaire aurait son propre compteur — la
// limite réelle serait multipliée d'autant, et il faudrait passer par la base
// ou un Redis. C'est un garde-fou contre l'emballement, pas une protection
// contre une attaque distribuée : celle-ci se traite devant, chez nginx.
// ============================================================================

const compteurs = new Map();

// Un ménage périodique suffit : sans lui, une IP vue une fois resterait en
// mémoire indéfiniment.
const MENAGE_MS = 5 * 60 * 1000;
let dernierMenage = 0;

function menage(maintenant) {
  if (maintenant - dernierMenage < MENAGE_MS) return;
  dernierMenage = maintenant;
  for (const [cle, horodatages] of compteurs) {
    const restants = horodatages.filter((t) => maintenant - t < MENAGE_MS);
    if (restants.length) compteurs.set(cle, restants);
    else compteurs.delete(cle);
  }
}

/**
 * Enregistre un appel et dit s'il est autorisé.
 * Renvoie { autorise, restant, reessayerDansSecondes }.
 */
export function consommer(cle, max, fenetreMs, maintenant = Date.now()) {
  menage(maintenant);
  const horodatages = (compteurs.get(cle) || []).filter((t) => maintenant - t < fenetreMs);
  if (horodatages.length >= max) {
    const plusAncien = horodatages[0];
    compteurs.set(cle, horodatages);
    return {
      autorise: false,
      restant: 0,
      reessayerDansSecondes: Math.max(1, Math.ceil((fenetreMs - (maintenant - plusAncien)) / 1000)),
    };
  }
  horodatages.push(maintenant);
  compteurs.set(cle, horodatages);
  return { autorise: true, restant: max - horodatages.length, reessayerDansSecondes: 0 };
}

/** Adresse de l'appelant, telle que la transmet le reverse proxy. */
export function adresseAppelant(request) {
  const transmis = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return transmis || request.headers.get("x-real-ip") || "inconnue";
}

/** Uniquement pour les tests : vide les compteurs. */
export function reinitialiserLimites() {
  compteurs.clear();
  dernierMenage = 0;
}
