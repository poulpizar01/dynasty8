// ============================================================================
// Médias hébergés sur storage.fbfa.fr : import, rattachement, nettoyage
// ----------------------------------------------------------------------------
// Cycle de vie d'un fichier (table medias, voir schema.postgres.sql) :
//
//   1. import    : la ligne est créée (statut « envoi ») AVANT l'envoi, pour
//                  qu'aucun fichier distant ne puisse exister sans trace en
//                  base ; après un envoi confirmé elle passe « temporaire ».
//   2. rattache  : l'annonce ou le profil est enregistré ET, dans la même
//                  transaction, ses URL sont rattachées (« attache »). Si
//                  l'enregistrement échoue, rien n'est rattaché : le fichier
//                  reste temporaire.
//   3. retrait   : une URL retirée d'un contenu enregistré perd sa référence.
//                  S'il n'en reste aucune (autre annonce, profil) et que
//                  l'URL n'apparaît plus nulle part en base, la suppression
//                  distante est PROGRAMMÉE (« a_supprimer ») après un délai de
//                  grâce — toujours dans la transaction de l'enregistrement,
//                  donc seulement si celui-ci est validé.
//   4. nettoyage : tâche différée (nettoyerMedias) qui (a) programme la
//                  suppression des imports abandonnés depuis plus de N heures,
//                  (b) supprime à distance, par CLÉ, les médias arrivés à
//                  échéance, après une dernière vérification sous verrou.
//
// Concurrence : rattachement et nettoyage verrouillent la même ligne medias
// (FOR UPDATE / FOR UPDATE SKIP LOCKED). Un média « a_supprimer » réenregistré
// avant la suppression est simplement réactivé ; un média déjà en cours de
// suppression ne peut plus être rattaché (l'enregistrement est refusé, 409).
//
// Seuls les fichiers suivis dans cette table peuvent être supprimés : une URL
// collée à la main, une ancienne photo base64 ou un fichier envoyé avant ce
// suivi ne sont jamais touchés, même s'ils figurent dans une annonce.
// ============================================================================

import { creerClientFbfa, cleValide, ErreurStockage, FBFA_BASE_PAR_DEFAUT, FBFA_DELAI_PAR_DEFAUT_MS } from "./fbfa-storage.js";
import { analyserImage } from "./images.js";

export const MODES_NETTOYAGE = ["desactive", "simulation", "actif"];
export const USAGES = { bien: "biens", profil: "profils" };
const STATUTS_RATTACHABLES = ["temporaire", "attache", "a_supprimer"];

// Erreur « métier » destinée à être renvoyée telle quelle au navigateur.
export class ErreurMedia extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = "ErreurMedia";
    this.status = status;
    this.code = code;
  }
}

function nombreBorne(valeur, defaut, min, max) {
  if (valeur === undefined || valeur === null || valeur === "") return defaut;
  const n = Number(valeur);
  return Number.isFinite(n) && n >= min && n <= max ? n : defaut;
}

// Réglages lus depuis l'environnement (voir deploy/*/.env.example). Toute
// valeur absente ou invalide retombe sur un défaut prudent — en particulier
// le nettoyage reste en SIMULATION tant que FBFA_NETTOYAGE=actif n'est pas
// explicitement posé.
export function lireConfigMedias(env = {}) {
  const prefixe = String(env.FBFA_STORAGE_PREFIXE || "dynasty8").trim().replace(/^\/+|\/+$/g, "");
  const mode = String(env.FBFA_NETTOYAGE || "simulation").trim().toLowerCase();
  return {
    token: env.FBFA_STORAGE_TOKEN || "",
    base: env.FBFA_STORAGE_BASE || FBFA_BASE_PAR_DEFAUT,
    prefixe: cleValide(prefixe) ? prefixe : "dynasty8",
    delaiMs: nombreBorne(env.FBFA_STORAGE_DELAI_MS, FBFA_DELAI_PAR_DEFAUT_MS, 1000, 120_000),
    tailleMax: nombreBorne(env.FBFA_PHOTO_TAILLE_MAX, 8 * 1024 * 1024, 1024, 50 * 1024 * 1024),
    delaiNettoyageHeures: nombreBorne(env.FBFA_NETTOYAGE_DELAI_HEURES, 24, 1, 24 * 90),
    modeNettoyage: MODES_NETTOYAGE.includes(mode) ? mode : "simulation",
    importsEnAttenteMax: nombreBorne(env.FBFA_IMPORTS_EN_ATTENTE_MAX, 40, 1, 1000),
  };
}

export function creerClientDepuisConfig(config, fetchImpl) {
  return creerClientFbfa({ token: config.token, base: config.base, delaiMs: config.delaiMs, fetchImpl });
}

// dynasty8/biens/2026/09/3f1c…-….jpg
export function genererCle(prefixe, usage, extension, date = new Date()) {
  const dossier = USAGES[usage];
  if (!dossier) throw new Error(`Usage de média inconnu : ${usage}`);
  const aaaa = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${prefixe}/${dossier}/${aaaa}/${mm}/${crypto.randomUUID()}.${extension}`;
}

// ---- dates calculées par PostgreSQL (même format texte que le reste du site) ----
const SQL_MAINTENANT = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";
function sqlDecalage(placeholder) {
  return `to_char(now() at time zone 'utc' + make_interval(secs => ${placeholder}::double precision), 'YYYY-MM-DD HH24:MI:SS')`;
}

function codeErreur(e) {
  if (e instanceof ErreurStockage) return [e.code, e.status, e.codeDistant].filter(Boolean).join(":").slice(0, 200);
  return String((e && e.message) || e).slice(0, 200);
}

// Message et statut HTTP à renvoyer au navigateur pour une erreur d'import.
export function reponseErreurImport(e) {
  if (e instanceof ErreurMedia) return { status: e.status, erreur: e.message };
  if (e instanceof ErreurStockage) {
    const table = {
      config: [503, "Le stockage des photos n'est pas configuré sur le serveur."],
      auth: [502, "Le serveur n'est plus autorisé par le service de stockage des photos. Prévenez la Direction."],
      taille: [413, "Photo refusée par le service de stockage : fichier trop volumineux."],
      quota: [507, "L'espace de stockage des photos est plein. Prévenez la Direction."],
      limite: [429, "Trop d'envois de photos en peu de temps. Réessayez dans un instant."],
      delai: [504, "Le service de stockage des photos met trop de temps à répondre. Réessayez."],
      reseau: [502, "Service de stockage des photos injoignable. Réessayez."],
      distant: [502, "Le service de stockage des photos rencontre une erreur. Réessayez plus tard."],
      reponse_invalide: [502, "Réponse inattendue du service de stockage des photos."],
    };
    const [status, erreur] = table[e.code] || [502, "Le service de stockage a refusé la photo."];
    return { status, erreur };
  }
  return null;
}

// ---- 1. import ---------------------------------------------------------------

export async function importerImage({ db, client, config, octets, mimeDeclare, usage, auteurId, origine = "import", cle }) {
  if (!USAGES[usage]) throw new ErreurMedia(400, "Usage de photo inconnu.", "usage_inconnu");
  if (octets.length > config.tailleMax) {
    throw new ErreurMedia(413, `Photo trop volumineuse (${Math.ceil(config.tailleMax / 1024 / 1024)} Mo maximum).`, "taille");
  }
  const analyse = analyserImage(octets);
  if (!analyse.ok) throw new ErreurMedia(400, analyse.raison, "image_invalide");
  if (mimeDeclare && mimeDeclare !== analyse.mime) {
    throw new ErreurMedia(400, `Le contenu du fichier (${analyse.mime}) ne correspond pas au type annoncé (${mimeDeclare}).`, "type_incoherent");
  }

  if (auteurId != null) {
    const enAttente = await db.prepare(
      "SELECT COUNT(*)::int AS n FROM medias WHERE auteur_id = ?1 AND statut IN ('envoi', 'temporaire')"
    ).bind(auteurId).first();
    if (enAttente && enAttente.n >= config.importsEnAttenteMax) {
      throw new ErreurMedia(429, "Trop de photos importées sans être enregistrées. Enregistrez ou fermez vos annonces en cours, puis réessayez.", "trop_imports");
    }
  }

  const cleFinale = cle || genererCle(config.prefixe, usage, analyse.extension);
  const ins = await db.prepare(
    `INSERT INTO medias (cle, usage, origine, statut, auteur_id, taille, mime)
     VALUES (?1, ?2, ?3, 'envoi', ?4, ?5, ?6)`
  ).bind(cleFinale, usage, origine, auteurId ?? null, octets.length, analyse.mime).run();
  const mediaId = ins.meta.last_row_id;

  let envoi;
  try {
    envoi = await client.envoyer(cleFinale, octets, analyse.mime);
  } catch (e) {
    // Refus explicite du service : rien n'a été stocké. Sinon (délai, réseau,
    // réponse inattendue…) l'objet existe peut-être : la ligne reste « envoi »
    // et le nettoyage différé tentera une suppression par clé.
    const refusCertain = e instanceof ErreurStockage && ["config", "auth", "taille", "quota", "limite", "requete", "introuvable"].includes(e.code);
    await db.prepare(
      `UPDATE medias SET statut = ?2, derniere_erreur = ?3, maj = ${SQL_MAINTENANT} WHERE id = ?1`
    ).bind(mediaId, refusCertain ? "echec" : "envoi", codeErreur(e)).run().catch(() => {});
    throw e;
  }

  try {
    await db.prepare(
      `UPDATE medias SET statut = 'temporaire', fbfa_id = ?2, url = ?3, taille = ?4, derniere_erreur = '',
              envoye_le = ${SQL_MAINTENANT}, maj = ${SQL_MAINTENANT}
        WHERE id = ?1 AND statut = 'envoi'`
    ).bind(mediaId, envoi.id, envoi.url, envoi.taille).run();
  } catch (e) {
    if (e && e.code === "23505") {
      // URL déjà suivie par une autre ligne : comportement du service non
      // documenté (déduplication ?). On ne devine pas : la ligne est isolée
      // (jamais supprimée automatiquement) et l'import est refusé.
      await db.prepare(
        `UPDATE medias SET statut = 'conflit', fbfa_id = ?2, derniere_erreur = 'url_deja_suivie', maj = ${SQL_MAINTENANT} WHERE id = ?1`
      ).bind(mediaId, envoi.id).run().catch(() => {});
      throw new ErreurMedia(502, "Réponse inattendue du service de stockage des photos (adresse déjà utilisée).", "url_deja_suivie");
    }
    throw e;
  }
  return { mediaId, url: envoi.url, cle: cleFinale, mime: analyse.mime, taille: octets.length, largeur: analyse.largeur, hauteur: analyse.hauteur };
}

// ---- 2/3. rattachement et retrait (toujours dans une transaction) -------------

function colonneCible(cible) {
  if (cible.type === "bien") return "bien_id";
  if (cible.type === "membre") return "membre_id";
  throw new Error(`Cible de média inconnue : ${cible.type}`);
}

// Un média sans référence peut encore être cité littéralement en base (URL
// ajoutée hors application, par exemple) : dans le doute, on le considère
// comme utilisé et on ne programme rien.
async function mediaEncoreUtilise(db, media) {
  const ref = await db.prepare("SELECT 1 AS x FROM medias_references WHERE media_id = ?1 LIMIT 1").bind(media.id).first();
  if (ref) return true;
  if (!media.url) return false;
  // Correspondance EXACTE : dans biens.images (tableau JSON), l'URL apparaît
  // entre guillemets ; « …/view/obj1 » ne doit pas être trouvé dans
  // « …/view/obj10 ». Une URL valide ne contient ni guillemet ni antislash,
  // donc aucune séquence d'échappement JSON ne peut la modifier.
  const cite = await db.prepare(
    `SELECT 1 AS x FROM biens WHERE strpos(images, ?1) > 0
     UNION ALL
     SELECT 1 AS x FROM membres WHERE photo = ?2
     LIMIT 1`
  ).bind(JSON.stringify(media.url), media.url).first();
  return !!cite;
}

// Programme la suppression distante des médias `ids` qui ne sont plus
// utilisés nulle part. À appeler dans la transaction qui a retiré les
// références, APRÈS l'écriture du contenu.
export async function planifierOrphelins(tx, ids, delaiSecondes) {
  const uniques = [...new Set(ids)].filter((x) => Number.isInteger(x));
  if (!uniques.length) return [];
  const r = await tx.prepare(
    `SELECT id, url, statut FROM medias WHERE id = ANY(?1::int[]) AND statut IN ('attache', 'temporaire') ORDER BY id FOR UPDATE`
  ).bind(uniques).all();
  const planifies = [];
  for (const m of r.results || []) {
    if (await mediaEncoreUtilise(tx, m)) continue;
    await tx.prepare(
      `UPDATE medias SET statut = 'a_supprimer', suppression_prevue_le = ${sqlDecalage("?2")}, maj = ${SQL_MAINTENANT} WHERE id = ?1`
    ).bind(m.id, delaiSecondes).run();
    planifies.push(m.id);
  }
  return planifies;
}

// Aligne les références de `cible` ({ type: "bien"|"membre", id }) sur la
// liste de valeurs enregistrée (URL, anciennes data URL, liens externes —
// seules les URL de médias suivis sont concernées). Refuse (409) si une URL
// correspond à un média qui n'est plus disponible.
export async function synchroniserReferences(tx, cible, valeurs, { delaiSecondes }) {
  const colonne = colonneCible(cible);
  const liste = (valeurs || []).filter((v) => typeof v === "string");
  const urls = [...new Set(liste.filter((v) => /^https?:\/\//i.test(v)))];

  // Verrouille, par id croissant (ordre stable : pas d'interblocage), les
  // médias cités par le nouveau contenu ET ceux déjà rattachés à la cible.
  const r = await tx.prepare(
    `SELECT id, url, statut FROM medias
      WHERE url = ANY(?1::text[])
         OR id IN (SELECT media_id FROM medias_references WHERE ${colonne} = ?2)
      ORDER BY id FOR UPDATE`
  ).bind(urls, cible.id).all();
  const medias = r.results || [];
  const parUrl = new Map(medias.filter((m) => m.url).map((m) => [m.url, m]));

  const cites = urls.map((u) => parUrl.get(u)).filter(Boolean);
  const indisponibles = cites.filter((m) => !STATUTS_RATTACHABLES.includes(m.statut));
  if (indisponibles.length) {
    const positions = indisponibles.map((m) => liste.indexOf(m.url) + 1).sort((a, b) => a - b);
    throw new ErreurMedia(
      409,
      `Photo n° ${positions.join(", ")} : ce fichier n'est plus disponible sur le stockage. Retirez-la puis importez-la à nouveau.`,
      "media_indisponible"
    );
  }

  const anciens = await tx.prepare(`SELECT media_id FROM medias_references WHERE ${colonne} = ?1`).bind(cible.id).all();
  const idsCites = new Set(cites.map((m) => m.id));
  const retires = (anciens.results || []).map((x) => x.media_id).filter((id) => !idsCites.has(id));

  if (retires.length) {
    await tx.prepare(`DELETE FROM medias_references WHERE ${colonne} = ?1 AND media_id = ANY(?2::int[])`).bind(cible.id, retires).run();
  }
  for (const m of cites) {
    await tx.prepare(
      `INSERT INTO medias_references (media_id, ${colonne}, position) VALUES (?1, ?2, ?3)
       ON CONFLICT (media_id, ${colonne}) WHERE ${colonne} IS NOT NULL DO UPDATE SET position = EXCLUDED.position`
    ).bind(m.id, cible.id, liste.indexOf(m.url)).run();
  }
  if (idsCites.size) {
    await tx.prepare(
      `UPDATE medias SET statut = 'attache', attache_le = COALESCE(attache_le, ${SQL_MAINTENANT}),
              suppression_prevue_le = NULL, maj = ${SQL_MAINTENANT}
        WHERE id = ANY(?1::int[]) AND statut <> 'attache'`
    ).bind([...idsCites]).run();
  }
  const planifies = await planifierOrphelins(tx, retires, delaiSecondes);
  return { rattaches: [...idsCites], retires, planifies };
}

// Avant de supprimer une annonce ou un compte : retire ses références et
// renvoie les médias concernés (à passer à planifierOrphelins APRÈS la
// suppression de la ligne, pour que l'URL n'y soit plus citée).
export async function detacherCible(tx, cible) {
  const colonne = colonneCible(cible);
  const r = await tx.prepare(`SELECT media_id FROM medias_references WHERE ${colonne} = ?1`).bind(cible.id).all();
  const ids = (r.results || []).map((x) => x.media_id);
  if (ids.length) {
    await tx.prepare(
      `SELECT id FROM medias WHERE id = ANY(?1::int[]) ORDER BY id FOR UPDATE`
    ).bind(ids).all();
    await tx.prepare(`DELETE FROM medias_references WHERE ${colonne} = ?1`).bind(cible.id).run();
  }
  return ids;
}

// ---- 4. nettoyage différé ------------------------------------------------------

// mode « simulation » : aucune écriture en base, aucun appel au service —
// le rapport liste seulement ce qui serait fait. mode « actif » : applique.
export async function nettoyerMedias({ db, client, mode = "simulation", delaiSecondes, limite = 100 }) {
  const rapport = {
    mode,
    abandonnes: [], // imports jamais rattachés, trop anciens
    suppressions: [], // médias arrivés à échéance (supprimés, ou qui le seraient en simulation)
    reactives: [], // référence retrouvée au dernier moment : suppression annulée
    conflits: [], // objet distant différent de celui suivi : jamais supprimé
    erreurs: [], // échecs de suppression distante (nouvelle tentative plus tard)
    interrompu: null, // code d'erreur qui a arrêté la passe (jeton refusé…)
  };
  if (mode === "desactive") return rapport;
  const actif = mode === "actif";

  // (a) imports abandonnés : « temporaire » jamais rattaché, ou « envoi »
  // resté incertain (délai, coupure) depuis plus que le délai de grâce. Sont
  // aussi rattrapés les médias « attache » qui n'ont plus aucune référence
  // depuis ce délai (ligne supprimée hors application, par exemple) : le
  // rattachement normal crée la référence et le statut dans la même
  // transaction, cet état ne peut donc pas être un rattachement en cours.
  const abandonnes = await db.prepare(
    `SELECT m.id, m.cle, m.url, m.statut FROM medias m
      WHERE (m.statut = 'temporaire' AND m.envoye_le < ${sqlDecalage("?1")})
         OR (m.statut = 'envoi' AND m.maj < ${sqlDecalage("?1")})
         OR (m.statut = 'attache' AND m.maj < ${sqlDecalage("?1")}
             AND NOT EXISTS (SELECT 1 FROM medias_references r WHERE r.media_id = m.id))
      ORDER BY m.id LIMIT ?2`
  ).bind(-delaiSecondes, limite).all();

  for (const candidat of abandonnes.results || []) {
    if (!actif) {
      const utilise = await mediaEncoreUtilise(db, candidat);
      rapport.abandonnes.push({ id: candidat.id, cle: candidat.cle, statut: candidat.statut, encoreUtilise: utilise });
      continue;
    }
    const programme = await db.transaction(async (tx) => {
      const m = await tx.prepare(
        "SELECT id, cle, url, statut FROM medias WHERE id = ?1 AND statut IN ('temporaire', 'envoi', 'attache') FOR UPDATE SKIP LOCKED"
      ).bind(candidat.id).first();
      if (!m || (await mediaEncoreUtilise(tx, m))) return false;
      await tx.prepare(
        `UPDATE medias SET statut = 'a_supprimer', suppression_prevue_le = ${SQL_MAINTENANT}, maj = ${SQL_MAINTENANT} WHERE id = ?1`
      ).bind(m.id).run();
      return true;
    });
    if (programme) rapport.abandonnes.push({ id: candidat.id, cle: candidat.cle, statut: candidat.statut });
  }

  // (b) suppressions distantes arrivées à échéance (+ reprise de celles
  // interrompues en cours de route depuis plus d'une heure).
  const dus = await db.prepare(
    `SELECT id, cle, url, fbfa_id, statut, tentatives_suppression FROM medias
      WHERE (statut = 'a_supprimer' AND suppression_prevue_le <= ${SQL_MAINTENANT})
         OR (statut = 'suppression' AND maj < ${sqlDecalage("?1")})
      ORDER BY id LIMIT ?2`
  ).bind(-3600, limite).all();

  for (const candidat of dus.results || []) {
    if (!actif) {
      const utilise = await mediaEncoreUtilise(db, candidat);
      rapport.suppressions.push({ id: candidat.id, cle: candidat.cle, encoreUtilise: utilise });
      continue;
    }

    const pris = await db.transaction(async (tx) => {
      const m = await tx.prepare(
        `SELECT id, cle, url, fbfa_id, statut, tentatives_suppression FROM medias
          WHERE id = ?1 AND ((statut = 'a_supprimer' AND suppression_prevue_le <= ${SQL_MAINTENANT}) OR statut = 'suppression')
          FOR UPDATE SKIP LOCKED`
      ).bind(candidat.id).first();
      if (!m) return null;
      if (await mediaEncoreUtilise(tx, m)) {
        // Cité à nouveau : on n'efface rien. Depuis « suppression », on ne
        // sait pas si le DELETE est déjà parti : examen manuel (conflit).
        const statut = m.statut === "a_supprimer" ? "attache" : "conflit";
        await tx.prepare(
          `UPDATE medias SET statut = ?2, suppression_prevue_le = NULL, derniere_erreur = 'reference_retrouvee', maj = ${SQL_MAINTENANT} WHERE id = ?1`
        ).bind(m.id, statut).run();
        (statut === "attache" ? rapport.reactives : rapport.conflits).push({ id: m.id, cle: m.cle });
        return null;
      }
      await tx.prepare(`UPDATE medias SET statut = 'suppression', maj = ${SQL_MAINTENANT} WHERE id = ?1`).bind(m.id).run();
      return m;
    });
    if (!pris) continue;

    try {
      // Garde-fou : GET /api/object/{clé} renvoie { id, url, size, mimeType }.
      // Si le service associe cette clé à un autre identifiant que celui
      // enregistré, ce n'est plus notre fichier — on ne supprime pas.
      const meta = await client.metadonnees(pris.cle);
      if (meta && pris.fbfa_id && meta.id != null && String(meta.id) !== String(pris.fbfa_id)) {
        await db.prepare(
          `UPDATE medias SET statut = 'conflit', derniere_erreur = 'id_distant_different', maj = ${SQL_MAINTENANT} WHERE id = ?1`
        ).bind(pris.id).run();
        rapport.conflits.push({ id: pris.id, cle: pris.cle });
        continue;
      }
      const resultat = meta ? await client.supprimer(pris.cle) : { dejaAbsent: true };
      await db.prepare(
        `UPDATE medias SET statut = 'supprime', supprime_le = ${SQL_MAINTENANT}, derniere_erreur = '', maj = ${SQL_MAINTENANT} WHERE id = ?1`
      ).bind(pris.id).run();
      rapport.suppressions.push({ id: pris.id, cle: pris.cle, dejaAbsent: !!resultat.dejaAbsent });
    } catch (e) {
      const tentatives = (pris.tentatives_suppression || 0) + 1;
      const attente = Math.min(2 ** tentatives, 24) * 3600; // 2 h, 4 h, 8 h… plafonné à 24 h
      await db.prepare(
        `UPDATE medias SET statut = 'a_supprimer', tentatives_suppression = ?2, derniere_erreur = ?3,
                suppression_prevue_le = ${sqlDecalage("?4")}, maj = ${SQL_MAINTENANT}
          WHERE id = ?1 AND statut = 'suppression'`
      ).bind(pris.id, tentatives, codeErreur(e), attente).run();
      rapport.erreurs.push({ id: pris.id, cle: pris.cle, erreur: codeErreur(e) });
      if (e instanceof ErreurStockage && (e.code === "auth" || e.code === "config")) {
        rapport.interrompu = e.code;
        break;
      }
    }
  }
  return rapport;
}

// Résumé lisible par la Direction (aucun appel au service distant).
export async function etatMedias(db) {
  const r = await db.prepare(
    "SELECT statut, COUNT(*)::int AS nombre, COALESCE(SUM(taille), 0)::bigint AS octets FROM medias GROUP BY statut"
  ).all();
  const parStatut = {};
  for (const l of r.results || []) parStatut[l.statut] = { nombre: Number(l.nombre), octets: Number(l.octets) };
  const echeances = await db.prepare(
    `SELECT COUNT(*)::int AS n FROM medias WHERE statut = 'a_supprimer' AND suppression_prevue_le <= ${SQL_MAINTENANT}`
  ).first();
  return { parStatut, suppressionsEchues: echeances ? Number(echeances.n) : 0 };
}
