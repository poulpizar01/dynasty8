// ============================================================================
// Client du stockage externe FlashbackFA (https://storage.fbfa.fr)
// ----------------------------------------------------------------------------
// Seul endroit du code qui parle à l'API de stockage. Utilisé par le serveur
// (imports de photos, nettoyage différé, voir src/medias.js) et par les
// scripts manuels (scripts/*.js). Jamais chargé côté navigateur : le jeton
// FBFA_STORAGE_TOKEN reste exclusivement sur le serveur.
//
// Contrat connu de l'API (toutes les routes /api/* : Authorization: Bearer) :
//   PUT    /api/object/{clé}   corps binaire -> { id, url, size, mimeType }
//   GET    /api/object/{clé}   -> métadonnées { id, url, size, mimeType }
//   DELETE /api/object/{clé}   -> suppression (par CLÉ, jamais par id public)
//   GET    /api/objects?prefix=&limit=&cursor= -> { items: [...], nextCursor }
//   GET    /api/usage          -> quota et usage (format NON confirmé)
// Erreurs observées sur le service réel (11/09/2026, sans jeton / jeton mal
// formé) : HTTP 401 + {"error":{"code":"no_token"|"malformed_token","message":…}}.
// Les codes d'erreur de quota ou de taille ne sont pas documentés : on se fie
// d'abord au statut HTTP (413, 507…), le code distant n'est qu'un indice.
//
// Règles de sécurité :
//   - le jeton n'apparaît dans AUCUN message d'erreur ni journal ;
//   - chaque appel est borné dans le temps (délai maximal, lecture du corps
//     de la réponse comprise) ;
//   - une réponse d'envoi n'est acceptée que si son URL publique pointe bien
//     vers {base}/view/{id}.
// ============================================================================

export const FBFA_BASE_PAR_DEFAUT = "https://storage.fbfa.fr";
export const FBFA_DELAI_PAR_DEFAUT_MS = 15_000;

// Codes internes (stables, utilisés par src/medias.js et les tests) :
//   config            jeton absent / adresse de base invalide
//   auth              jeton refusé par le service (401/403)
//   taille            fichier refusé car trop volumineux (413)
//   quota             espace de stockage épuisé (507, ou code distant « quota »)
//   limite            trop de requêtes (429)
//   introuvable       objet absent (404)
//   requete           autre refus 4xx
//   distant           erreur du service (5xx)
//   delai             pas de réponse dans le délai imparti
//   reseau            service injoignable (DNS, connexion coupée…)
//   reponse_invalide  réponse illisible ou non conforme au contrat
export class ErreurStockage extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ErreurStockage";
    this.code = code;
    this.status = details.status ?? null; // statut HTTP renvoyé par le service, s'il y en a un
    this.codeDistant = details.codeDistant ?? null; // champ error.code du service, s'il y en a un
  }
}

// Une clé est générée par ce site (jamais saisie par un utilisateur) : on
// n'accepte que des segments simples, pour qu'aucune clé ne puisse sortir de
// son dossier ou être mal interprétée dans l'URL.
const RE_SEGMENT_CLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function cleValide(cle) {
  if (typeof cle !== "string" || !cle || cle.length > 512) return false;
  return cle.split("/").every((seg) => RE_SEGMENT_CLE.test(seg) && seg !== "." && seg !== "..");
}

function cheminObjet(cle) {
  if (!cleValide(cle)) throw new ErreurStockage("config", "Clé de stockage invalide.");
  return "/api/object/" + cle.split("/").map(encodeURIComponent).join("/");
}

function normaliserBase(base) {
  let u;
  try {
    u = new URL(base || FBFA_BASE_PAR_DEFAUT);
  } catch (e) {
    throw new ErreurStockage("config", "Adresse du service de stockage invalide.");
  }
  // HTTP simple toléré uniquement sur la machine locale (faux service des
  // tests) : ailleurs, le jeton circulerait en clair.
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new ErreurStockage("config", "Adresse du service de stockage invalide (HTTPS obligatoire).");
  }
  return u.origin;
}

// Vérifie qu'une URL publique renvoyée par le service est bien de la forme
// {base}/view/{id} (même origine que l'API, rien d'autre dans l'adresse).
export function urlPubliqueValide(url, base, id) {
  if (typeof url !== "string" || url.length > 2048) return false;
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return false;
  }
  let origine;
  try {
    origine = normaliserBase(base);
  } catch (e) {
    return false;
  }
  if (u.origin !== origine || u.username || u.password || u.search || u.hash) return false;
  if (!u.pathname.startsWith("/view/")) return false;
  const segment = u.pathname.slice("/view/".length);
  if (!segment || segment.includes("/")) return false;
  if (id == null) return true;
  let decode;
  try {
    decode = decodeURIComponent(segment);
  } catch (e) {
    return false;
  }
  return decode === String(id);
}

// Extrait {code, message} du format d'erreur observé ({"error":{…}}), sans
// jamais échouer si le corps est différent.
function lireErreurDistante(texte) {
  try {
    const d = JSON.parse(texte);
    const e = d && typeof d.error === "object" && d.error ? d.error : null;
    return {
      code: e && typeof e.code === "string" ? e.code.slice(0, 80) : null,
      message: e && typeof e.message === "string" ? e.message.slice(0, 200) : null,
    };
  } catch (err) {
    return { code: null, message: null };
  }
}

function erreurDepuisStatut(status, texte) {
  const { code: codeDistant } = lireErreurDistante(texte);
  const details = { status, codeDistant };
  if (status === 401 || status === 403) {
    return new ErreurStockage("auth", "Le service de stockage a refusé l'authentification du serveur.", details);
  }
  if (status === 413) return new ErreurStockage("taille", "Fichier refusé par le service de stockage : trop volumineux.", details);
  if (status === 507 || (codeDistant && /quota/i.test(codeDistant))) {
    return new ErreurStockage("quota", "Espace du service de stockage épuisé.", details);
  }
  if (status === 429) return new ErreurStockage("limite", "Trop de requêtes vers le service de stockage.", details);
  if (status === 404) return new ErreurStockage("introuvable", "Objet introuvable sur le service de stockage.", details);
  if (status >= 500) return new ErreurStockage("distant", `Erreur du service de stockage (HTTP ${status}).`, details);
  return new ErreurStockage("requete", `Requête refusée par le service de stockage (HTTP ${status}).`, details);
}

export function creerClientFbfa({ token, base, delaiMs, fetchImpl } = {}) {
  const origine = normaliserBase(base);
  const delai = Number(delaiMs) > 0 ? Number(delaiMs) : FBFA_DELAI_PAR_DEFAUT_MS;
  const faireFetch = fetchImpl || globalThis.fetch;

  // Un seul minuteur couvre l'envoi de la requête ET la lecture de la
  // réponse : un service qui répond les en-têtes puis se bloque ne peut pas
  // retenir la requête indéfiniment.
  async function appeler(methode, chemin, { corps, typeContenu } = {}) {
    if (!token) throw new ErreurStockage("config", "Le jeton du service de stockage n'est pas configuré.");
    const controleur = new AbortController();
    let expire = false;
    const minuteur = setTimeout(() => {
      expire = true;
      controleur.abort();
    }, delai);
    try {
      let reponse;
      try {
        const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
        if (typeContenu) headers["Content-Type"] = typeContenu;
        reponse = await faireFetch(origine + chemin, {
          method: methode,
          headers,
          body: corps,
          signal: controleur.signal,
          redirect: "error",
        });
      } catch (e) {
        if (expire) throw new ErreurStockage("delai", "Le service de stockage n'a pas répondu à temps.");
        throw new ErreurStockage("reseau", "Service de stockage injoignable.");
      }
      let texte;
      try {
        texte = await reponse.text();
      } catch (e) {
        if (expire) throw new ErreurStockage("delai", "Le service de stockage n'a pas répondu à temps.");
        throw new ErreurStockage("reseau", "Réponse du service de stockage interrompue.");
      }
      return { status: reponse.status, ok: reponse.ok, texte };
    } finally {
      clearTimeout(minuteur);
    }
  }

  function lireJson(texte) {
    try {
      const d = JSON.parse(texte);
      if (d && typeof d === "object" && !Array.isArray(d)) return d;
    } catch (e) {
      // traité ci-dessous
    }
    throw new ErreurStockage("reponse_invalide", "Réponse illisible du service de stockage.");
  }

  return {
    origine,

    // Envoie (ou remplace) l'objet `cle`. Ne renvoie que si la réponse est
    // conforme : id présent, URL publique {origine}/view/{id}, taille égale au
    // nombre d'octets envoyés quand le service l'indique.
    async envoyer(cle, octets, mime) {
      const chemin = cheminObjet(cle);
      const r = await appeler("PUT", chemin, { corps: octets, typeContenu: mime });
      if (!r.ok) throw erreurDepuisStatut(r.status, r.texte);
      const d = lireJson(r.texte);
      const id = typeof d.id === "string" || typeof d.id === "number" ? String(d.id) : "";
      if (!id || id.length > 200) {
        throw new ErreurStockage("reponse_invalide", "Réponse du service de stockage sans identifiant.");
      }
      if (!urlPubliqueValide(d.url, origine, id)) {
        throw new ErreurStockage("reponse_invalide", "URL publique inattendue renvoyée par le service de stockage.");
      }
      if (typeof d.size === "number" && octets && d.size !== octets.length) {
        throw new ErreurStockage("reponse_invalide", "Taille enregistrée différente du fichier envoyé.");
      }
      return {
        id,
        url: d.url,
        taille: typeof d.size === "number" ? d.size : octets ? octets.length : null,
        mime: typeof d.mimeType === "string" ? d.mimeType.slice(0, 100) : null,
      };
    },

    // Métadonnées { id, url, size, mimeType } ; null si l'objet n'existe pas.
    // Renvoyées telles quelles : c'est l'appelant qui décide quoi en faire
    // (voir le garde-fou avant suppression, dans src/medias.js).
    async metadonnees(cle) {
      const r = await appeler("GET", cheminObjet(cle));
      if (r.status === 404) return null;
      if (!r.ok) throw erreurDepuisStatut(r.status, r.texte);
      return lireJson(r.texte);
    },

    // Supprime par CLÉ. Un objet déjà absent (404) est considéré comme
    // supprimé : la suppression peut ainsi être relancée sans risque.
    async supprimer(cle) {
      const r = await appeler("DELETE", cheminObjet(cle));
      if (r.status === 404) return { supprime: true, dejaAbsent: true };
      if (!r.ok) throw erreurDepuisStatut(r.status, r.texte);
      return { supprime: true, dejaAbsent: false };
    },

    async lister({ prefix, limit, cursor } = {}) {
      const params = new URLSearchParams();
      if (prefix) params.set("prefix", String(prefix));
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", String(cursor));
      const r = await appeler("GET", "/api/objects" + (params.toString() ? "?" + params : ""));
      if (!r.ok) throw erreurDepuisStatut(r.status, r.texte);
      const d = lireJson(r.texte);
      if (!Array.isArray(d.items)) throw new ErreurStockage("reponse_invalide", "Liste d'objets illisible.");
      const suivant = typeof d.nextCursor === "string" && d.nextCursor ? d.nextCursor : null;
      return { items: d.items, nextCursor: suivant };
    },

    // Renvoie l'objet JSON tel quel : ses champs ne sont pas documentés, on
    // ne les interprète donc pas ici (voir scripts/fbfa-diagnostic.js).
    async usage() {
      const r = await appeler("GET", "/api/usage");
      if (!r.ok) throw erreurDepuisStatut(r.status, r.texte);
      return lireJson(r.texte);
    },
  };
}
