// Parcours complets des photos contre une VRAIE base PostgreSQL et un FAUX
// service storage.fbfa.fr : droits, fichiers invalides, limites, délais,
// réponses inattendues, échecs de sauvegarde, médias partagés, profils,
// nettoyage et courses entre rattachement et nettoyage.
//
// Nécessite TEST_DATABASE_URL (serveur PostgreSQL de test, une base jetable
// y est créée puis supprimée), par exemple :
//   docker run -d --name d8-test-pg -e POSTGRES_USER=d8 -e POSTGRES_PASSWORD=d8test -p 127.0.0.1:55432:5432 postgres:17-alpine
//   TEST_DATABASE_URL=postgres://d8:d8test@127.0.0.1:55432/postgres npm test
// Sans cette variable, ces tests sont ignorés.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { creerPool, creerAdaptateurDB } from "../src/db-pg.js";
import worker from "../src/index.js";
import { nettoyerMedias, creerClientDepuisConfig, lireConfigMedias } from "../src/medias.js";
import {
  creerBaseDeTest, demarrerFauxFbfa, cookieSession, SECRET_TEST,
  jpegMinimal, jpegReel, pngValide, webpValide, dataUrl,
} from "./aide-medias.js";

const ACTIF = !!process.env.TEST_DATABASE_URL;
const it = (nom, fn) => test(nom, { skip: ACTIF ? false : "TEST_DATABASE_URL non définie" }, fn);

let base;
let pool;
let faux;
let env;
const membres = {};
const AVATAR_DISCORD = "https://cdn.discordapp.com/avatars/1/avatar.png";

before(async () => {
  if (!ACTIF) return;
  base = await creerBaseDeTest("medias");
  pool = creerPool(base.url);
  faux = await demarrerFauxFbfa();
  env = {
    DB: creerAdaptateurDB(),
    SESSION_SECRET: SECRET_TEST,
    FBFA_STORAGE_TOKEN: faux.jeton,
    FBFA_STORAGE_BASE: faux.base,
    FBFA_STORAGE_DELAI_MS: "1000",
  };
  for (const [pseudo, grade] of [["direction", "Patron"], ["agent", "Agent"], ["agent2", "Agent Expert"], ["stagiaire", "Stagiaire"], ["partant", "Agent"]]) {
    const r = await pool.query(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le, statut, discord_avatar)
       VALUES ($1, $2, 'x', 'x', 1, '2026-01-01 00:00:00', 'valide', $3) RETURNING id, pseudo, grade`,
      [pseudo, grade, AVATAR_DISCORD]
    );
    membres[pseudo] = r.rows[0];
  }
  // Échec de sauvegarde simulé DANS la transaction (titre « ECHEC »).
  await pool.query(`
    CREATE FUNCTION echec_test() RETURNS trigger AS $$
    BEGIN IF NEW.titre = 'ECHEC' THEN RAISE EXCEPTION 'échec de sauvegarde simulé'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER echec_test BEFORE INSERT OR UPDATE ON biens FOR EACH ROW EXECUTE FUNCTION echec_test();
  `);
});

after(async () => {
  if (!ACTIF) return;
  await faux.arreter();
  await pool.end();
  await base.supprimer();
});

beforeEach(async () => {
  if (!ACTIF) return;
  faux.reinitialiser();
  await pool.query("TRUNCATE medias_references, medias_migration_sauvegarde, medias, biens RESTART IDENTITY CASCADE");
  await pool.query("UPDATE membres SET photo = NULL");
});

// ---- outils --------------------------------------------------------------------

async function api(methode, chemin, { membre, corps, type, envSup } = {}) {
  const headers = {};
  if (membre) headers.Cookie = cookieSession(membre);
  let body;
  if (corps instanceof Uint8Array) {
    body = corps;
    headers["Content-Type"] = type || "image/jpeg";
  } else if (corps !== undefined) {
    body = JSON.stringify(corps);
    headers["Content-Type"] = type || "application/json";
  }
  const reponse = await worker.fetch(new Request("http://local" + chemin, { method: methode, headers, body }), { ...env, ...envSup });
  const texte = await reponse.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* corps non JSON */ }
  return { status: reponse.status, json, texte };
}

async function importer({ membre = membres.agent, octets = jpegMinimal(), route = "/api/biens/photo" } = {}) {
  const r = await api("POST", route, { membre, corps: octets });
  assert.equal(r.status, 201, r.texte);
  return r.json.url;
}

function annonce(images, extra = {}) {
  return { titre: "Villa de test", categorie: "habitation", dispo_vente: true, prix: 1000, images, ...extra };
}

async function creerAnnonce(images, membre = membres.agent) {
  const r = await api("POST", "/api/biens", { membre, corps: annonce(images) });
  assert.equal(r.status, 200, r.texte);
  return r.json.id;
}

const mediaParUrl = async (url) => (await pool.query("SELECT * FROM medias WHERE url = $1", [url])).rows[0];
const references = async (mediaId) => (await pool.query("SELECT bien_id, membre_id FROM medias_references WHERE media_id = $1 ORDER BY id", [mediaId])).rows;
const appelsDelete = () => faux.appels.filter((a) => a.methode === "DELETE");

async function nettoyer(mode = "actif", envSup = {}) {
  const config = lireConfigMedias({ ...env, ...envSup });
  return nettoyerMedias({ db: env.DB, client: creerClientDepuisConfig(config), mode, delaiSecondes: config.delaiNettoyageHeures * 3600 });
}

// ---- droits et méthode ----------------------------------------------------------

it("import : session obligatoire, droits annonces, POST uniquement", async () => {
  assert.equal((await api("POST", "/api/biens/photo", { corps: jpegMinimal() })).status, 401);
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.stagiaire, corps: jpegMinimal() })).status, 403);
  for (const methode of ["GET", "PUT", "DELETE"]) {
    const r = await api(methode, "/api/biens/photo", { membre: membres.agent, corps: methode === "GET" ? undefined : jpegMinimal() });
    assert.equal(r.status, 405, methode);
  }
  // Photo de profil : tout membre connecté, y compris un stagiaire.
  assert.equal((await api("POST", "/api/profil/photo", { membre: membres.stagiaire, corps: jpegMinimal() })).status, 201);
  assert.equal((await api("POST", "/api/profil/photo", { corps: jpegMinimal() })).status, 401);
  assert.equal(faux.appels.filter((a) => a.methode === "PUT").length, 1, "seul l'import autorisé atteint le stockage");
});

it("import : stockage non configuré -> 503, rien en base ni à distance", async () => {
  const r = await api("POST", "/api/biens/photo", { membre: membres.agent, corps: jpegMinimal(), envSup: { FBFA_STORAGE_TOKEN: "" } });
  assert.equal(r.status, 503);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias")).rows[0].n, 0);
  assert.equal(faux.appels.length, 0);
});

// ---- fichiers invalides et limites ---------------------------------------------

it("import : fichiers invalides refusés avant tout envoi distant", async () => {
  const texte = new TextEncoder().encode("ceci n'est pas une image");
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: texte, type: "image/jpeg" })).status, 400);
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: pngValide(), type: "image/jpeg" })).status, 400, "type annoncé mensonger");
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: jpegMinimal(), type: "application/pdf" })).status, 415);
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: new Uint8Array(), type: "image/png" })).status, 400);
  const tronque = jpegReel().subarray(0, 5000);
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: tronque })).status, 400);
  const tropGros = await api("POST", "/api/biens/photo", { membre: membres.agent, corps: jpegReel(), envSup: { FBFA_PHOTO_TAILLE_MAX: "2048" } });
  assert.equal(tropGros.status, 413);
  assert.equal(faux.appels.length, 0);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias")).rows[0].n, 0);
});

it("import : JPEG réel, PNG, WebP et ancien format JSON acceptés ; clé sous le préfixe dédié", async () => {
  await importer({ octets: jpegReel() });
  await api("POST", "/api/biens/photo", { membre: membres.agent, corps: pngValide(), type: "image/png" });
  await api("POST", "/api/biens/photo", { membre: membres.agent, corps: webpValide(), type: "image/webp" });
  const ancien = await api("POST", "/api/biens/photo", { membre: membres.agent, corps: { image: dataUrl(jpegMinimal()) } });
  assert.equal(ancien.status, 201, ancien.texte);

  const lignes = (await pool.query("SELECT cle, statut, mime, taille, auteur_id, usage FROM medias ORDER BY id")).rows;
  assert.equal(lignes.length, 4);
  const aaaa = new Date().getUTCFullYear();
  const mm = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  for (const l of lignes) {
    assert.match(l.cle, new RegExp(`^dynasty8/biens/${aaaa}/${mm}/[0-9a-f-]{36}\\.(jpg|png|webp)$`));
    assert.equal(l.statut, "temporaire");
    assert.equal(l.auteur_id, membres.agent.id);
    assert.equal(l.usage, "bien");
  }
  assert.deepEqual(lignes.map((l) => l.mime), ["image/jpeg", "image/png", "image/webp", "image/jpeg"]);
  const put = faux.appels.find((a) => a.methode === "PUT");
  assert.equal(put.auth, `Bearer ${faux.jeton}`);
  assert.equal(put.type, "image/jpeg");
});

it("import : limite d'imports non enregistrés par membre", async () => {
  const envSup = { FBFA_IMPORTS_EN_ATTENTE_MAX: "2" };
  for (let i = 0; i < 2; i++) assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: jpegMinimal(), envSup })).status, 201);
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent, corps: jpegMinimal(), envSup })).status, 429);
  assert.equal((await api("POST", "/api/biens/photo", { membre: membres.agent2, corps: jpegMinimal(), envSup })).status, 201, "limite propre à chaque membre");
});

// ---- erreurs distantes ---------------------------------------------------------

it("import : jeton refusé, quota, délai, réponse inattendue -> messages clairs, état en base cohérent", async () => {
  const cas = [
    { regle: () => ({ status: 401, corps: JSON.stringify({ error: { code: "invalid_token", message: "Invalid token" } }) }), status: 502, statut: "echec" },
    { regle: () => ({ status: 507, corps: "" }), status: 507, statut: "echec" },
    { regle: () => ({ status: 413, corps: "" }), status: 413, statut: "echec" },
    { regle: () => ({ status: 500, corps: "boom" }), status: 502, statut: "envoi" },
    { regle: () => ({ bloquer: true }), status: 504, statut: "envoi" },
    { regle: (a) => (a.methode === "PUT" ? { json: () => ({ url: "https://pirate.example/view/x" }) } : undefined), status: 502, statut: "envoi" },
  ];
  for (const c of cas) {
    await pool.query("TRUNCATE medias RESTART IDENTITY CASCADE");
    faux.regles = c.regle;
    const r = await api("POST", "/api/biens/photo", { membre: membres.agent, corps: jpegMinimal() });
    assert.equal(r.status, c.status, r.texte);
    assert.ok(r.json && r.json.erreur, "message d'erreur lisible");
    assert.ok(!r.texte.includes(faux.jeton), "le jeton ne doit jamais être renvoyé au navigateur");
    const [ligne] = (await pool.query("SELECT statut, url, derniere_erreur FROM medias")).rows;
    assert.equal(ligne.statut, c.statut);
    assert.equal(ligne.url, null, "aucune URL enregistrée sans envoi confirmé");
  }
});

// ---- rattachement, échec de sauvegarde, retrait -------------------------------

it("annonce : l'URL importée devient attachée à la sauvegarde et s'affiche publiquement", async () => {
  const url = await importer();
  const id = await creerAnnonce([url, "https://exemple.fr/lien-colle.jpg"]);
  const m = await mediaParUrl(url);
  assert.equal(m.statut, "attache");
  assert.deepEqual(await references(m.id), [{ bien_id: id, membre_id: null }]);
  const publique = await api("GET", `/api/biens?id=${id}`);
  assert.deepEqual(publique.json.images, [url, "https://exemple.fr/lien-colle.jpg"]);
});

it("annonce : échec de sauvegarde -> photo toujours temporaire, aucune annonce ni référence", async () => {
  const url = await importer();
  const r = await api("POST", "/api/biens", { membre: membres.agent, corps: annonce([url], { titre: "ECHEC" }) });
  assert.equal(r.status, 500);
  assert.equal((await mediaParUrl(url)).statut, "temporaire");
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM biens")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias_references")).rows[0].n, 0);

  // Même chose sur une modification : l'annonce garde ses anciennes photos.
  const ancienne = await importer();
  const id = await creerAnnonce([ancienne]);
  const echec = await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([url], { titre: "ECHEC" }) });
  assert.equal(echec.status, 500);
  assert.equal((await mediaParUrl(ancienne)).statut, "attache", "retrait non validé : aucune suppression programmée");
  assert.equal((await mediaParUrl(url)).statut, "temporaire");
});

it("annonce : photo retirée -> suppression programmée après le délai, exécutée seulement à échéance", async () => {
  const url = await importer();
  const id = await creerAnnonce([url]);
  assert.equal((await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([]) })).status, 200);
  let m = await mediaParUrl(url);
  assert.equal(m.statut, "a_supprimer");
  assert.ok(m.suppression_prevue_le > new Date(Date.now() + 23 * 3600e3).toISOString().replace("T", " ").slice(0, 19));

  // Simulation : rien n'est écrit, rien n'est supprimé.
  await pool.query("UPDATE medias SET suppression_prevue_le = '2000-01-01 00:00:00' WHERE id = $1", [m.id]);
  const appelsAvant = faux.appels.length;
  const simulation = await nettoyer("simulation");
  assert.equal(simulation.suppressions.length, 1);
  assert.equal((await mediaParUrl(url)).statut, "a_supprimer");
  assert.equal(faux.appels.length, appelsAvant, "la simulation n'appelle jamais le stockage");

  // Actif : suppression distante PAR CLÉ.
  const rapport = await nettoyer("actif");
  assert.equal(rapport.suppressions.length, 1);
  m = await mediaParUrl(url);
  assert.equal(m.statut, "supprime");
  assert.deepEqual(appelsDelete().map((a) => decodeURIComponent(a.chemin)), [`/api/object/${m.cle}`]);
  assert.equal(faux.objets.has(m.cle), false);
});

it("annonce : 10 photos maximum, liens dangereux et nouvelles images base64 refusés", async () => {
  const onze = Array.from({ length: 11 }, (_, i) => `https://exemple.fr/${i}.jpg`);
  assert.equal((await api("POST", "/api/biens", { membre: membres.agent, corps: annonce(onze) })).status, 400);
  assert.equal((await api("POST", "/api/biens", { membre: membres.agent, corps: annonce(['https://x.fr/a.jpg"onerror="alert(1)']) })).status, 400);
  assert.equal((await api("POST", "/api/biens", { membre: membres.agent, corps: annonce(["javascript:alert(1)"]) })).status, 400);
  assert.equal((await api("POST", "/api/biens", { membre: membres.agent, corps: annonce([dataUrl(jpegMinimal())]) })).status, 400);
  assert.equal((await api("POST", "/api/biens", { membre: membres.stagiaire, corps: annonce([]) })).status, 403);
});

// ---- compatibilité avec les annonces existantes ---------------------------------

it("anciennes annonces : base64, liens et URL non suivies conservés et jamais supprimés", async () => {
  const base64 = dataUrl(jpegMinimal());
  const nonSuivie = `${faux.base}/view/ancien-fichier-hors-suivi`;
  const r = await pool.query(
    `INSERT INTO biens (categorie, titre, images, cree_le, maj) VALUES ('habitation', 'Ancienne', $1, '2026-01-01 00:00:00', '2026-01-01 00:00:00') RETURNING id`,
    [JSON.stringify([base64, "https://exemple.fr/lien.jpg", nonSuivie])]
  );
  const id = r.rows[0].id;
  // Réenregistrer sans rien changer : accepté (base64 déjà présent).
  const resave = await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([base64, "https://exemple.fr/lien.jpg", nonSuivie]) });
  assert.equal(resave.status, 200, resave.texte);
  // Retirer toutes ces photos puis supprimer l'annonce : aucune suppression distante.
  assert.equal((await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([]) })).status, 200);
  assert.equal((await api("DELETE", `/api/biens?id=${id}`, { membre: membres.agent })).status, 200);
  await nettoyer("actif");
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM medias")).rows[0].n, 0);
  assert.equal(appelsDelete().length, 0);
});

// ---- médias partagés ------------------------------------------------------------

it("média partagé entre deux annonces : supprimable seulement après le dernier retrait", async () => {
  const url = await importer();
  const a = await creerAnnonce([url]);
  const b = await creerAnnonce([url], membres.agent2);
  const m = await mediaParUrl(url);
  assert.equal((await references(m.id)).length, 2);

  assert.equal((await api("PUT", `/api/biens?id=${a}`, { membre: membres.agent, corps: annonce([]) })).status, 200);
  assert.equal((await mediaParUrl(url)).statut, "attache", "encore utilisé par l'autre annonce");

  assert.equal((await api("DELETE", `/api/biens?id=${b}`, { membre: membres.agent })).status, 200);
  assert.equal((await mediaParUrl(url)).statut, "a_supprimer");
  assert.equal((await references(m.id)).length, 0);
});

it("média partagé entre une annonce et un profil", async () => {
  const url = await importer();
  const id = await creerAnnonce([url]);
  assert.equal((await api("PUT", "/api/moi", { membre: membres.agent, corps: { photo: url } })).status, 200);
  assert.equal((await api("DELETE", `/api/biens?id=${id}`, { membre: membres.agent })).status, 200);
  assert.equal((await mediaParUrl(url)).statut, "attache", "toujours la photo de profil");
});

it("une URL citée hors références (ajout manuel en base) n'est jamais supprimée", async () => {
  const url = await importer();
  const id = await creerAnnonce([url]);
  await pool.query(
    `INSERT INTO biens (categorie, titre, images, cree_le, maj) VALUES ('garage', 'Copie manuelle', $1, '2026-01-01 00:00:00', '2026-01-01 00:00:00')`,
    [JSON.stringify([url])]
  );
  assert.equal((await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([]) })).status, 200);
  assert.equal((await mediaParUrl(url)).statut, "attache", "retrait sans programmation : l'URL est encore citée");
});

it("recherche exacte des URL : …/view/p1 n'est pas confondu avec …/view/p10", async () => {
  const u1 = `${faux.base}/view/p1`;
  const u10 = `${faux.base}/view/p10`;
  await pool.query(
    `INSERT INTO medias (cle, url, fbfa_id, usage, statut, envoye_le) VALUES
       ('dynasty8/biens/2026/01/p1.jpg', $1, 'p1', 'bien', 'temporaire', '2026-01-01 00:00:00'),
       ('dynasty8/biens/2026/01/p10.jpg', $2, 'p10', 'bien', 'temporaire', '2026-01-01 00:00:00')`,
    [u1, u10]
  );
  const a = await creerAnnonce([u1]);
  await creerAnnonce([u10]);
  assert.equal((await api("PUT", "/api/moi", { membre: membres.agent, corps: { photo: u10 } })).status, 200);
  assert.equal((await api("PUT", `/api/biens?id=${a}`, { membre: membres.agent, corps: annonce([]) })).status, 200);
  assert.equal((await mediaParUrl(u1)).statut, "a_supprimer", "p10 (annonce et profil) ne doit pas retenir p1");
  assert.equal((await mediaParUrl(u10)).statut, "attache");
});

// ---- courses entre rattachement et nettoyage -----------------------------------

it("course : un média programmé puis réenregistré avant échéance est réactivé", async () => {
  const url = await importer();
  const id = await creerAnnonce([url]);
  await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([]) });
  assert.equal((await mediaParUrl(url)).statut, "a_supprimer");
  assert.equal((await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([url]) })).status, 200);
  const m = await mediaParUrl(url);
  assert.equal(m.statut, "attache");
  assert.equal(m.suppression_prevue_le, null);
  await pool.query("UPDATE medias SET suppression_prevue_le = '2000-01-01 00:00:00'");
  await nettoyer("actif");
  assert.equal(appelsDelete().length, 0);
});

it("course : un média en cours de suppression ne peut plus être rattaché (annonce inchangée)", async () => {
  const url = await importer();
  const id = await creerAnnonce([]);
  await pool.query("UPDATE medias SET statut = 'suppression' WHERE url = $1", [url]);
  const r = await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([url], { titre: "Titre modifié" }) });
  assert.equal(r.status, 409);
  assert.match(r.json.erreur, /Photo n° 1/);
  const bien = (await pool.query("SELECT titre, images FROM biens WHERE id = $1", [id])).rows[0];
  assert.equal(bien.titre, "Villa de test", "transaction annulée : titre inchangé");
  assert.equal(bien.images, "[]");
});

it("course : nettoyage lancé pendant qu'un enregistrement verrouille le média -> média ignoré", async () => {
  const url = await importer();
  await pool.query("UPDATE medias SET envoye_le = '2000-01-01 00:00:00' WHERE url = $1", [url]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM medias WHERE url = $1 FOR UPDATE", [url]); // rattachement en cours
    const rapport = await nettoyer("actif");
    assert.equal(rapport.abandonnes.length, 0, "SKIP LOCKED : le média verrouillé n'est pas pris");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  assert.equal((await mediaParUrl(url)).statut, "temporaire");
});

it("course : enregistrement pendant la suppression distante -> refusé, puis suppression menée à terme", async () => {
  const url = await importer();
  const id = await creerAnnonce([url]);
  await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([]) });
  await pool.query("UPDATE medias SET suppression_prevue_le = '2000-01-01 00:00:00'");
  let pendant = null;
  faux.regles = (a) => (a.methode === "DELETE" ? {
    avant: async () => { pendant = await api("PUT", `/api/biens?id=${id}`, { membre: membres.agent, corps: annonce([url]) }); },
  } : undefined);
  await nettoyer("actif");
  assert.equal(pendant.status, 409);
  assert.equal((await mediaParUrl(url)).statut, "supprime");
  assert.equal((await pool.query("SELECT images FROM biens WHERE id = $1", [id])).rows[0].images, "[]");
});

// ---- nettoyage : imports abandonnés, reprises, garde-fous -----------------------

it("nettoyage : imports abandonnés depuis plus de 24 h supprimés, récents conservés", async () => {
  const vieux = await importer();
  const recent = await importer();
  await pool.query("UPDATE medias SET envoye_le = '2000-01-01 00:00:00' WHERE url = $1", [vieux]);
  // Envoi resté incertain (délai dépassé) il y a longtemps : suppression par clé tentée.
  await pool.query(
    "INSERT INTO medias (cle, usage, statut, maj) VALUES ('dynasty8/biens/2000/01/incertain.jpg', 'bien', 'envoi', '2000-01-01 00:00:00')"
  );

  const appelsAvant = faux.appels.length;
  const simulation = await nettoyer("simulation");
  assert.equal(simulation.abandonnes.length, 2);
  assert.equal(faux.appels.length, appelsAvant, "la simulation n'appelle jamais le stockage");
  assert.equal((await mediaParUrl(vieux)).statut, "temporaire", "la simulation n'écrit rien");

  const rapport = await nettoyer("actif");
  assert.equal(rapport.abandonnes.length, 2);
  assert.equal((await mediaParUrl(vieux)).statut, "supprime");
  assert.equal((await mediaParUrl(recent)).statut, "temporaire");
  const incertain = (await pool.query("SELECT statut FROM medias WHERE cle = 'dynasty8/biens/2000/01/incertain.jpg'")).rows[0];
  assert.equal(incertain.statut, "supprime", "objet absent (404) : considéré comme supprimé");
});

it("nettoyage : échec distant -> nouvelle tentative programmée ; jeton refusé -> passe interrompue", async () => {
  const urls = [await importer(), await importer()];
  await pool.query("UPDATE medias SET statut = 'a_supprimer', suppression_prevue_le = '2000-01-01 00:00:00'");

  faux.regles = (a) => (a.methode === "DELETE" ? { status: 500, corps: "" } : undefined);
  const rapport = await nettoyer("actif");
  assert.equal(rapport.erreurs.length, 2);
  for (const url of urls) {
    const m = await mediaParUrl(url);
    assert.equal(m.statut, "a_supprimer");
    assert.equal(m.tentatives_suppression, 1);
    assert.ok(m.suppression_prevue_le > "2026-01-01", "reprogrammé plus tard");
  }

  await pool.query("UPDATE medias SET suppression_prevue_le = '2000-01-01 00:00:00'");
  faux.regles = () => ({ status: 401, corps: JSON.stringify({ error: { code: "invalid_token" } }) });
  const interrompu = await nettoyer("actif");
  assert.equal(interrompu.interrompu, "auth");
  assert.equal(interrompu.erreurs.length, 1, "arrêt au premier refus d'authentification");

  faux.regles = null;
  await pool.query("UPDATE medias SET suppression_prevue_le = '2000-01-01 00:00:00'");
  await nettoyer("actif");
  for (const url of urls) assert.equal((await mediaParUrl(url)).statut, "supprime", "reprise réussie");
});

it("nettoyage : objet distant différent de celui suivi -> conflit, aucune suppression", async () => {
  const url = await importer();
  await pool.query("UPDATE medias SET statut = 'a_supprimer', suppression_prevue_le = '2000-01-01 00:00:00' WHERE url = $1", [url]);
  faux.regles = (a) => (a.methode === "GET" && a.chemin.startsWith("/api/object/") ? { json: () => ({ id: "un-autre-objet" }) } : undefined);
  const rapport = await nettoyer("actif");
  assert.equal(rapport.conflits.length, 1);
  assert.equal((await mediaParUrl(url)).statut, "conflit");
  assert.equal(appelsDelete().length, 0);
});

it("nettoyage : média « attache » resté sans référence (suppression hors application) rattrapé après le délai", async () => {
  const url = await importer();
  const id = await creerAnnonce([url]);
  await pool.query("DELETE FROM biens WHERE id = $1", [id]); // suppression SQL directe : références effacées en cascade
  assert.equal((await mediaParUrl(url)).statut, "attache");
  await nettoyer("actif");
  assert.equal((await mediaParUrl(url)).statut, "attache", "trop récent : conservé");
  await pool.query("UPDATE medias SET maj = '2000-01-01 00:00:00' WHERE url = $1", [url]);
  await nettoyer("actif");
  assert.equal((await mediaParUrl(url)).statut, "supprime");
});

it("nettoyage : suppression interrompue (état « suppression » ancien) reprise", async () => {
  const url = await importer();
  await pool.query("UPDATE medias SET statut = 'suppression', maj = '2000-01-01 00:00:00' WHERE url = $1", [url]);
  await nettoyer("actif");
  assert.equal((await mediaParUrl(url)).statut, "supprime");
});

it("nettoyage : mode désactivé ou valeur inconnue -> jamais actif par défaut", async () => {
  assert.equal(lireConfigMedias({}).modeNettoyage, "simulation");
  assert.equal(lireConfigMedias({ FBFA_NETTOYAGE: "oui" }).modeNettoyage, "simulation");
  const url = await importer();
  await pool.query("UPDATE medias SET envoye_le = '2000-01-01 00:00:00' WHERE url = $1", [url]);
  const rapport = await nettoyer("desactive");
  assert.equal(rapport.abandonnes.length, 0);
  assert.equal((await mediaParUrl(url)).statut, "temporaire");
});

// ---- photos de profil -----------------------------------------------------------

it("profil : import, enregistrement, remplacement ; avatar Discord intact", async () => {
  const premiere = await importer({ membre: membres.stagiaire, route: "/api/profil/photo" });
  assert.equal((await mediaParUrl(premiere)).cle.split("/")[1], "profils");
  assert.equal((await api("PUT", "/api/moi", { membre: membres.stagiaire, corps: { poste: "Stagiaire", photo: premiere } })).status, 200);
  let m = await mediaParUrl(premiere);
  assert.equal(m.statut, "attache");
  assert.deepEqual(await references(m.id), [{ bien_id: null, membre_id: membres.stagiaire.id }]);

  const seconde = await importer({ membre: membres.stagiaire, route: "/api/profil/photo" });
  assert.equal((await api("PUT", "/api/moi", { membre: membres.stagiaire, corps: { photo: seconde } })).status, 200);
  assert.equal((await mediaParUrl(premiere)).statut, "a_supprimer");
  assert.equal((await mediaParUrl(seconde)).statut, "attache");

  const membre = (await pool.query("SELECT photo, discord_avatar FROM membres WHERE id = $1", [membres.stagiaire.id])).rows[0];
  assert.equal(membre.photo, seconde);
  assert.equal(membre.discord_avatar, AVATAR_DISCORD);
});

it("profil : ancienne photo base64 conservée, nouvelle base64 refusée", async () => {
  const ancienne = dataUrl(jpegMinimal());
  await pool.query("UPDATE membres SET photo = $1 WHERE id = $2", [ancienne, membres.agent.id]);
  assert.equal((await api("PUT", "/api/moi", { membre: membres.agent, corps: { bio: "Bio", photo: ancienne } })).status, 200);
  const nouvelle = dataUrl(pngValide(), "image/png");
  assert.equal((await api("PUT", "/api/moi", { membre: membres.agent, corps: { photo: nouvelle } })).status, 400);
  assert.equal((await pool.query("SELECT photo FROM membres WHERE id = $1", [membres.agent.id])).rows[0].photo, ancienne);
});

it("profil : la Direction modifie la photo d'un autre membre, un agent ne le peut pas", async () => {
  const url = await importer({ membre: membres.direction, route: "/api/profil/photo" });
  assert.equal((await api("PATCH", `/api/membres?id=${membres.agent2.id}`, { membre: membres.agent, corps: { photo: url } })).status, 403);
  assert.equal((await mediaParUrl(url)).statut, "temporaire");
  assert.equal((await api("PATCH", `/api/membres?id=${membres.agent2.id}`, { membre: membres.direction, corps: { photo: url } })).status, 200);
  const m = await mediaParUrl(url);
  assert.equal(m.statut, "attache");
  assert.deepEqual(await references(m.id), [{ bien_id: null, membre_id: membres.agent2.id }]);
});

it("profil : suppression d'un compte -> sa photo programmée pour suppression", async () => {
  const url = await importer({ membre: membres.partant, route: "/api/profil/photo" });
  assert.equal((await api("PUT", "/api/moi", { membre: membres.partant, corps: { photo: url } })).status, 200);
  assert.equal((await api("DELETE", `/api/membres?id=${membres.partant.id}`, { membre: membres.direction })).status, 200);
  const m = await mediaParUrl(url);
  assert.equal(m.statut, "a_supprimer");
  assert.equal(m.auteur_id, null);
});

// ---- suivi Direction -------------------------------------------------------------

it("état des médias : réservé à la Direction, sans le jeton", async () => {
  await importer();
  assert.equal((await api("GET", "/api/medias/etat", { membre: membres.agent })).status, 403);
  const r = await api("GET", "/api/medias/etat", { membre: membres.direction });
  assert.equal(r.status, 200);
  assert.equal(r.json.par_statut.temporaire.nombre, 1);
  assert.equal(r.json.nettoyage.mode, "simulation");
  assert.equal(r.json.usage_distant, "non_confirme");
  assert.ok(!r.texte.includes(faux.jeton));
});
