// ============================================================================
// Paramètres → Apparence : images de la marque (logo, emblème, icônes…)
// ----------------------------------------------------------------------------
// Les images d'origine restent dans public/img, livrées avec le code et en
// lecture seule. La Direction peut en remplacer une : le fichier part sur le
// stockage externe (storage.fbfa.fr, voir src/medias.js) et seule son URL est
// enregistrée, dans la table apparence_images. « Rétablir » supprime la
// ligne : l'image livrée revient aussitôt.
//
// Les pages ne changent pas d'adresse : /img/logo-full.png reste l'adresse du
// logo partout (pages publiques, espace agents, animations WebGL, balises de
// partage). server.js demande à imageMarque() s'il existe une image réglée :
// si oui, il la relaie depuis le stockage — même origine que le site, donc
// aucun souci de CORS pour les textures WebGL ni de redirection pour les
// robots qui lisent og:image —, sinon il sert le fichier livré. Rien n'est
// écrit sur disque : les octets relayés restent en mémoire, une entrée par
// image réglée.
// ============================================================================

import { GRADES_DIRECTION } from "./grades.js";
import { analyserImage, TYPES_IMAGE } from "./images.js";
import { ErreurStockage } from "./fbfa-storage.js";
import {
  lireConfigMedias, creerClientDepuisConfig, importerImage, reponseErreurImport, planifierOrphelins,
} from "./medias.js";

// largeur / hauteur : dimensions de l'image livrée. Les animations de
// l'accueil sont calées sur ces proportions : une image très différente y
// serait déformée (le serveur le signale, sans refuser).
export const IMAGES_MARQUE = [
  { cle: "logo", fichier: "/img/logo-full.png", largeur: 917, hauteur: 507, libelle: "Logo complet",
    aide: "Écran de connexion de l'espace agents, pied de page, animation de la page d'entrée." },
  { cle: "embleme", fichier: "/img/logo-mark.png", largeur: 828, hauteur: 326, libelle: "Emblème",
    aide: "En-tête des pages publiques, à côté du nom de l'agence." },
  { cle: "lettrage", fichier: "/img/logo-wordmark.png", largeur: 1150, hauteur: 252, libelle: "Nom de l'agence (lettrage)",
    aide: "Animation de la page d'accueil." },
  { cle: "icone", fichier: "/img/favicon-32.png", largeur: 32, hauteur: 32, libelle: "Icône d'onglet",
    aide: "Petite icône affichée dans l'onglet du navigateur." },
  { cle: "icone_mobile", fichier: "/img/favicon-180.png", largeur: 180, hauteur: 180, libelle: "Icône d'écran d'accueil",
    aide: "Icône utilisée quand le site est ajouté à l'écran d'accueil d'un téléphone." },
  { cle: "partage", fichier: "/img/og-image.jpg", largeur: 1200, hauteur: 630, libelle: "Image de partage",
    aide: "Aperçu affiché quand un lien du site est partagé (Discord, réseaux…)." },
];
const PAR_CLE = new Map(IMAGES_MARQUE.map((d) => [d.cle, d]));
const PAR_FICHIER = new Map(IMAGES_MARQUE.map((d) => [d.fichier, d]));
export const FICHIERS_MARQUE = IMAGES_MARQUE.map((d) => d.fichier);

const ECART_PROPORTIONS_TOLERE = 0.08;

function json(donnees, status = 200) {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function peutReglerApparence(s) {
  return !!s && GRADES_DIRECTION.includes(s.grade);
}

// ---- lecture des images réglées (cache court, vidé à chaque modification) ----

const DUREE_CACHE_MS = 15_000;
const caches = new WeakMap(); // une entrée par base (env.DB)

async function imagesReglees(db) {
  const enCache = caches.get(db);
  if (enCache && Date.now() - enCache.luA < DUREE_CACHE_MS) return enCache.parCle;
  const r = await db.prepare("SELECT cle, url, media_id, maj, maj_par FROM apparence_images").all();
  const parCle = new Map((r.results || []).filter((l) => PAR_CLE.has(l.cle)).map((l) => [l.cle, l]));
  caches.set(db, { parCle, luA: Date.now() });
  return parCle;
}

// ---- relais des images réglées (appelé par server.js) -------------------------

// Octets déjà relus, par URL (une URL du stockage désigne toujours le même
// fichier : un remplacement crée une nouvelle URL). Borné au nombre d'images.
const octetsParUrl = new Map();
const DELAI_LECTURE_MS = 10_000;

async function lireDistant(url, tailleMax, fetchImpl) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_LECTURE_MS);
  try {
    const r = await fetchImpl(url, { signal: controleur.signal, headers: { Accept: "image/*" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const annonce = Number(r.headers.get("content-length"));
    if (annonce > tailleMax) throw new Error("fichier trop volumineux");
    const octets = new Uint8Array(await r.arrayBuffer());
    if (octets.length > tailleMax) throw new Error("fichier trop volumineux");
    return octets;
  } finally {
    clearTimeout(minuteur);
  }
}

// Seules les adresses du stockage configuré (FBFA_STORAGE_BASE) sont relues :
// le serveur ne va jamais chercher ailleurs, même si la base contenait autre chose.
function adresseDuStockage(url, env) {
  try {
    const origine = new URL(lireConfigMedias(env).base).origin;
    const u = new URL(url);
    return u.origin === origine && /^https?:$/.test(u.protocol);
  } catch {
    return false;
  }
}

// Chemin demandé (ex. « /img/logo-full.png ») -> { octets, mime, etag } si une
// image réglée le remplace, null sinon (le fichier livré est alors servi).
// Une image réglée mais illisible (stockage injoignable, fichier supprimé)
// retombe aussi sur le fichier livré : le site garde toujours un logo.
export async function imageMarque({ db, env = {}, chemin, fetchImpl = globalThis.fetch }) {
  const definition = PAR_FICHIER.get(chemin);
  if (!definition) return null;
  let reglee;
  try {
    reglee = (await imagesReglees(db)).get(definition.cle);
  } catch (e) {
    console.error("[apparence] lecture des images réglées impossible :", (e && e.message) || e);
    return null;
  }
  if (!reglee || !adresseDuStockage(reglee.url, env)) return null;

  let image = octetsParUrl.get(reglee.url);
  if (!image) {
    try {
      const octets = await lireDistant(reglee.url, lireConfigMedias(env).tailleMax, fetchImpl);
      // Jamais servi sans contrôle : seul un vrai fichier JPEG/PNG/WebP passe,
      // avec le type lu dans ses octets (pas celui annoncé par le stockage).
      const analyse = analyserImage(octets);
      if (!analyse.ok) throw new Error("contenu qui n'est pas une image");
      image = { octets, mime: analyse.mime, etag: `"apparence-${reglee.media_id || 0}-${octets.length}"` };
    } catch (e) {
      console.error(`[apparence] « ${definition.libelle} » illisible sur le stockage (${(e && e.message) || e}) : image d'origine servie.`);
      return null;
    }
    for (const url of octetsParUrl.keys()) {
      if (octetsParUrl.size < IMAGES_MARQUE.length * 2) break;
      octetsParUrl.delete(url);
    }
    octetsParUrl.set(reglee.url, image);
  }
  return image;
}

// ---- onglet Paramètres → Apparence ---------------------------------------------

async function lister(env) {
  caches.delete(env.DB);
  const reglees = await imagesReglees(env.DB);
  return {
    stockage_configure: lireConfigMedias(env).configure,
    images: IMAGES_MARQUE.map((d) => {
      const r = reglees.get(d.cle);
      return {
        cle: d.cle, libelle: d.libelle, aide: d.aide, largeur: d.largeur, hauteur: d.hauteur,
        // Aperçu : l'adresse du site (même image que celle servie aux visiteurs).
        apercu: d.fichier,
        origine: d.fichier,
        personnalisee: !!r,
        maj: r ? r.maj : null,
        maj_par: r ? r.maj_par : null,
      };
    }),
  };
}

function definitionDemandee(url) {
  return PAR_CLE.get(String(url.searchParams.get("cle") || ""));
}

async function remplacer(request, url, env, s) {
  const definition = definitionDemandee(url);
  if (!definition) return json({ erreur: "Image inconnue." }, 400);
  const config = lireConfigMedias(env);
  if (!config.configure) {
    return json({ erreur: "Le stockage des images n'est pas configuré sur le serveur : les images d'origine restent en place." }, 503);
  }
  // Envoyée telle quelle par le navigateur (aucune conversion en JPEG : un
  // logo PNG garde sa transparence).
  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES_IMAGE[type]) return json({ erreur: "Format non pris en charge : envoyez une image PNG, JPEG ou WebP." }, 415);
  if (Number(request.headers.get("Content-Length")) > config.tailleMax) {
    return json({ erreur: `Image trop volumineuse (${Math.ceil(config.tailleMax / 1024 / 1024)} Mo maximum).` }, 413);
  }
  const octets = new Uint8Array(await request.arrayBuffer());
  if (!octets.length) return json({ erreur: "Fichier vide." }, 400);

  let importe;
  try {
    importe = await importerImage({
      db: env.DB, client: creerClientDepuisConfig(config), config, octets, mimeDeclare: type, usage: "apparence", auteurId: s.id,
    });
  } catch (e) {
    const reponse = reponseErreurImport(e);
    if (!reponse) throw e;
    if (e instanceof ErreurStockage) {
      console.error(`[apparence] import refusé (${definition.cle}, membre ${s.id}) : ${e.code}${e.status ? " HTTP " + e.status : ""}`);
    }
    return json({ erreur: reponse.erreur }, reponse.status);
  }

  await env.DB.transaction(async (tx) => {
    const ancien = await tx.prepare("SELECT media_id FROM apparence_images WHERE cle = ?1 FOR UPDATE").bind(definition.cle).first();
    await tx.prepare("SELECT id FROM medias WHERE id = ?1 FOR UPDATE").bind(importe.mediaId).first();
    // RETURNING explicite : apparence_images n'a pas de colonne « id ».
    await tx.prepare(
      `INSERT INTO apparence_images (cle, url, media_id, maj, maj_par) VALUES (?1, ?2, ?3, datetime('now'), ?4)
       ON CONFLICT (cle) DO UPDATE SET url = excluded.url, media_id = excluded.media_id, maj = excluded.maj, maj_par = excluded.maj_par
       RETURNING cle`
    ).bind(definition.cle, importe.url, importe.mediaId, String(s.pseudo || "").slice(0, 100)).run();
    await tx.prepare(
      `UPDATE medias SET statut = 'attache', attache_le = COALESCE(attache_le, datetime('now')), suppression_prevue_le = NULL, maj = datetime('now')
        WHERE id = ?1`
    ).bind(importe.mediaId).run();
    // L'image remplacée n'est plus utilisée : sa suppression du stockage est
    // programmée après le délai de grâce habituel (voir src/medias.js).
    if (ancien && ancien.media_id && ancien.media_id !== importe.mediaId) {
      await planifierOrphelins(tx, [ancien.media_id], config.delaiNettoyageHeures * 3600);
    }
  });
  caches.delete(env.DB);

  const ratio = (importe.largeur / importe.hauteur) / (definition.largeur / definition.hauteur);
  const avertissement = Math.abs(ratio - 1) > ECART_PROPORTIONS_TOLERE
    ? `Image enregistrée, mais ses proportions (${importe.largeur} × ${importe.hauteur}) diffèrent de l'originale (${definition.largeur} × ${definition.hauteur}) : elle peut apparaître déformée.`
    : null;
  return json({ ok: true, avertissement, ...(await lister(env)) });
}

async function retablir(url, env) {
  const definition = definitionDemandee(url);
  if (!definition) return json({ erreur: "Image inconnue." }, 400);
  const config = lireConfigMedias(env);
  await env.DB.transaction(async (tx) => {
    const ancien = await tx.prepare(
      "DELETE FROM apparence_images WHERE cle = ?1 RETURNING media_id"
    ).bind(definition.cle).first();
    if (ancien && ancien.media_id) await planifierOrphelins(tx, [ancien.media_id], config.delaiNettoyageHeures * 3600);
  });
  caches.delete(env.DB);
  return json({ ok: true, ...(await lister(env)) });
}

// /api/apparence (GET : liste) et /api/apparence/image?cle=… (POST : remplacer,
// DELETE : rétablir l'image d'origine). Session déjà vérifiée par l'appelant.
export async function routeApparence(request, url, env, s) {
  if (!peutReglerApparence(s)) return json({ erreur: "Réservé à la Direction." }, 403);
  if (url.pathname === "/api/apparence") {
    if (request.method === "GET") return json(await lister(env));
    return json({ erreur: "Méthode non autorisée." }, 405);
  }
  if (url.pathname === "/api/apparence/image") {
    if (request.method === "POST") return remplacer(request, url, env, s);
    if (request.method === "DELETE") return retablir(url, env);
    return json({ erreur: "Méthode non autorisée." }, 405);
  }
  return json({ erreur: "Adresse inconnue." }, 404);
}
