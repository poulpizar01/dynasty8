// ============================================================================
// Dynasty 8 — Worker Cloudflare (API + authentification)
// ----------------------------------------------------------------------------
// Ce fichier gère uniquement les adresses qui commencent par /api/ (voir
// wrangler.toml : run_worker_first = ["/api/*"]). Toutes les autres adresses
// (les pages du site) sont servies directement par Cloudflare depuis le
// dossier /public, sans passer par ce code.
//
// Principe de connexion : chaque membre de l'équipe reçoit un « code
// d'accès » unique (ex: DYN-4F2A-9K1B-77XQ). Ce code n'est jamais stocké en
// clair : on garde seulement son empreinte (hash) en base. Quand quelqu'un se
// connecte avec le bon code, le Worker pose un cookie signé (comme un
// bracelet infalsifiable) qui prouve son identité pendant 12h.
// ============================================================================

const COOKIE = "d8_session";
const DUREE = 60 * 60 * 12; // 12 heures, en secondes
const MAX_ESSAIS = 10;
const FENETRE = 10 * 60; // 10 minutes
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans caractères ambigus (0/O, 1/I...)
const CATEGORIES = ["habitation", "garage"];

// Sous-catégories autorisées pour la catégorie "habitation" (la catégorie "garage"
// reste simple et n'en a pas). La liste vient directement du fonctionnement du
// serveur RP : chaque nom correspond à un immeuble/type de logement précis.
const SOUS_CATEGORIES_HABITATION = [
  "Eclipse Tower", "Tinsel Tower", "Villa", "Del Perro Heights", "Richards Majestic",
  "Weazel Plaza", "San Andreas", "Alta Street", "Maison", "Entrepôt", "Flat",
  "Bureau", "Headquarter", "Caravane", "Motel", "Appartement", "Duplex", "Bar", "Autre",
];

// Les 4 "cohérences" du serveur : chaque bien est rattaché à l'une d'elles pour
// indiquer quel guide de règles RP s'applique (voir la page /coherences.html).
const COHERENCES = ["Habitation", "Garage", "Cayo Perico", "Roxwood"];

// Statuts VIP : purement informatifs (liés à la boutique officielle FlashbackFA,
// pas gérés par l'agence elle-même) — voir le texte affiché sur les pages publiques.
const VALEURS_VIP = ["", "vip", "vip+"];

const enc = new TextEncoder();
const maintenant = () => Math.floor(Date.now() / 1000);

// ---- outils bas niveau (encodage, signature, cookies) ---------------------

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function egal(a, b) {
  // Comparaison "à temps constant" : évite de révéler des indices sur le
  // code correct via le temps de réponse.
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function signer(secret, texte) {
  const cle = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", cle, enc.encode(texte))));
}

async function creerSession(secret, donnees) {
  const charge = b64url(enc.encode(JSON.stringify(donnees)));
  return charge + "." + (await signer(secret, charge));
}

async function lireSession(secret, jeton) {
  if (!jeton || jeton.indexOf(".") === -1) return null;
  const [charge, sig] = jeton.split(".");
  if (!egal(sig, await signer(secret, charge))) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(unb64url(charge)));
    if (!d.exp || d.exp < maintenant()) return null;
    return d;
  } catch (e) {
    return null;
  }
}

function cookies(req) {
  const brut = req.headers.get("Cookie") || "";
  const out = {};
  brut.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function poserCookie(nom, valeur, secondes) {
  return `${nom}=${encodeURIComponent(valeur)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${secondes}`;
}

function json(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function txt(v, max) {
  return v == null ? "" : String(v).slice(0, max);
}

// ---- codes d'accès ----------------------------------------------------

function normaliserCode(brut) {
  return String(brut || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function empreinte(secret, codeNormalise) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(secret + ":dynasty8:" + codeNormalise));
  return hex(new Uint8Array(buf));
}

function genererCode() {
  const brut = crypto.getRandomValues(new Uint8Array(12));
  let corps = "";
  for (const o of brut) corps += ALPHABET[o % ALPHABET.length];
  return "DYN-" + corps.slice(0, 4) + "-" + corps.slice(4, 8) + "-" + corps.slice(8, 12);
}

// ---- anti-bruteforce (limite les essais de connexion par adresse IP) -----

async function bloque(env, ip) {
  const t = await env.DB.prepare("SELECT nombre, depuis FROM tentatives WHERE ip = ?1").bind(ip).first();
  if (!t) return false;
  if (maintenant() - t.depuis > FENETRE) return false;
  return t.nombre >= MAX_ESSAIS;
}

async function noterEchec(env, ip) {
  const t = await env.DB.prepare("SELECT nombre, depuis FROM tentatives WHERE ip = ?1").bind(ip).first();
  if (!t || maintenant() - t.depuis > FENETRE) {
    await env.DB.prepare(
      `INSERT INTO tentatives (ip, nombre, depuis) VALUES (?1, 1, ?2)
       ON CONFLICT(ip) DO UPDATE SET nombre = 1, depuis = ?2`
    ).bind(ip, maintenant()).run();
  } else {
    await env.DB.prepare("UPDATE tentatives SET nombre = nombre + 1 WHERE ip = ?1").bind(ip).run();
  }
}

async function oublierEchecs(env, ip) {
  await env.DB.prepare("DELETE FROM tentatives WHERE ip = ?1").bind(ip).run();
}

// ---- point d'entrée ---------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const chemin = url.pathname;
    try {
      if (!env.DB) return json({ erreur: "Base de données non reliée." }, 500);
      if (!env.SESSION_SECRET) {
        return json({ erreur: "SESSION_SECRET n'est pas configuré sur le serveur." }, 500);
      }
      if (chemin === "/api/init") return initialisation(request, env);
      if (chemin === "/api/connexion") return connexion(request, env);
      if (chemin === "/api/deconnexion") return deconnexion();
      if (chemin === "/api/moi") return moi(request, env);
      if (chemin === "/api/biens") return biens(request, url, env);
      if (chemin === "/api/membres") return membres(request, url, env);
      if (chemin === "/api/equipe") return equipe(env);
      return json({ erreur: "Adresse inconnue." }, 404);
    } catch (e) {
      return json({ erreur: "Erreur interne", detail: String((e && e.message) || e) }, 500);
    }
  },
};

// ---- initialisation (création du tout premier compte Direction) ----------

async function initialisation(request, env) {
  const combien = await env.DB.prepare("SELECT COUNT(*) AS n FROM membres").first();
  const vide = !combien || combien.n === 0;
  if (request.method === "GET") return json({ premier_demarrage: vide });
  if (request.method !== "POST") return json({ erreur: "Méthode non gérée." }, 405);
  if (!vide) return json({ erreur: "L'espace admin est déjà initialisé." }, 403);
  const b = await request.json().catch(() => null);
  const pseudo = txt(b && b.pseudo, 40).trim() || "Direction";
  const code = genererCode();
  const h = await empreinte(env.SESSION_SECRET, normaliserCode(code));
  await env.DB.prepare(
    `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le)
     VALUES (?1, 'Direction', ?2, ?3, 1, datetime('now'))`
  ).bind(pseudo, h, code.slice(-4)).run();
  return json({ code, pseudo });
}

// ---- connexion / session ------------------------------------------------

async function connexion(request, env) {
  if (request.method !== "POST") return json({ erreur: "Méthode non gérée." }, 405);
  const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
  if (await bloque(env, ip)) {
    return json({ erreur: "Trop de tentatives. Réessayez dans 10 minutes." }, 429);
  }
  const b = await request.json().catch(() => null);
  const codeNormalise = normaliserCode(b && b.code);
  const refus = () => json({ erreur: "Code invalide." }, 401);
  if (codeNormalise.length < 8) {
    await noterEchec(env, ip);
    return refus();
  }
  const h = await empreinte(env.SESSION_SECRET, codeNormalise);
  const m = await env.DB.prepare("SELECT id, pseudo, grade, actif FROM membres WHERE code_hash = ?1")
    .bind(h)
    .first();
  if (!m || !m.actif) {
    await noterEchec(env, ip);
    return refus();
  }
  await oublierEchecs(env, ip);
  await env.DB.prepare("UPDATE membres SET derniere_visite = datetime('now') WHERE id = ?1").bind(m.id).run();
  const jeton = await creerSession(env.SESSION_SECRET, {
    id: m.id,
    pseudo: m.pseudo,
    grade: m.grade,
    exp: maintenant() + DUREE,
  });
  return new Response(JSON.stringify({ pseudo: m.pseudo, grade: m.grade }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": poserCookie(COOKIE, jeton, DUREE),
    },
  });
}

function deconnexion() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": poserCookie(COOKIE, "", 0),
    },
  });
}

async function session(request, env) {
  return lireSession(env.SESSION_SECRET, cookies(request)[COOKIE]);
}

function estDirection(s) {
  return String((s && s.grade) || "").toLowerCase() === "direction";
}

async function moi(request, env) {
  const s = await session(request, env);
  if (!s) return json({ connecte: false }, 401);
  if (request.method === "PUT") return modifierMonProfil(request, env, s);
  const m = await env.DB.prepare(
    "SELECT poste, specialite, bio, photo FROM membres WHERE id = ?1"
  ).bind(s.id).first();
  return json({
    connecte: true,
    pseudo: s.pseudo,
    grade: s.grade,
    direction: estDirection(s),
    poste: (m && m.poste) || "",
    specialite: (m && m.specialite) || "",
    bio: (m && m.bio) || "",
    photo: (m && m.photo) || "",
  });
}

// ---- « Mon profil » : chaque membre édite sa propre fiche publique ------
// Volontairement séparé de la gestion des comptes (membres()) : ces champs
// n'ont aucun effet sur les droits d'accès (grade), qui reste réservé à la
// Direction. Un agent ne peut modifier que sa propre fiche (son id vient de
// la session signée, jamais du corps de la requête).

function validerProfil(b) {
  if (!b) return "Formulaire invalide.";
  if (String(b.poste || "").length > 80) return "L'intitulé du poste est trop long (80 caractères maximum).";
  if (String(b.specialite || "").length > 100) return "La spécialité est trop longue (100 caractères maximum).";
  if (String(b.bio || "").length > 1000) return "La biographie est trop longue (1000 caractères maximum).";
  if (b.photo && (typeof b.photo !== "string" || b.photo.length > 1_500_000)) {
    return "La photo est invalide ou trop volumineuse.";
  }
  return null;
}

async function modifierMonProfil(request, env, s) {
  const b = await request.json().catch(() => null);
  const erreur = validerProfil(b);
  if (erreur) return json({ erreur }, 400);
  const poste = txt(b.poste, 80).trim();
  const specialite = txt(b.specialite, 100).trim();
  const bio = txt(b.bio, 1000).trim();
  const photo = typeof b.photo === "string" ? b.photo.trim() : "";
  await env.DB.prepare(
    "UPDATE membres SET poste=?2, specialite=?3, bio=?4, photo=?5 WHERE id=?1"
  ).bind(s.id, poste, specialite, bio, photo).run();
  return json({ ok: true });
}

// ---- équipe (page publique /equipe.html) ----------------------------------
// Lecture publique, aucune connexion requise. Ne renvoie que des champs
// destinés à être affichés (jamais code_hash, code_indice, dates internes...).

async function equipe(env) {
  const r = await env.DB.prepare(
    `SELECT id, pseudo, grade, poste, specialite, bio, photo
       FROM membres
       WHERE actif = 1
       ORDER BY CASE WHEN grade = 'Direction' THEN 0 ELSE 1 END, pseudo COLLATE NOCASE`
  ).all();
  const liste = (r.results || []).map((m) => ({
    id: m.id,
    pseudo: m.pseudo,
    poste: m.poste || (String(m.grade).toLowerCase() === "direction" ? "Direction de l'agence" : "Agent immobilier"),
    specialite: m.specialite || "",
    bio: m.bio || "",
    photo: m.photo || "",
  }));
  return json({ membres: liste });
}

// ---- biens (annonces immobilières) ---------------------------------------
// Lecture publique (aucune connexion requise) : tout le monde peut voir les
// annonces disponibles. Écriture réservée aux membres connectés.

// Vérifie les données envoyées par le formulaire avant tout enregistrement.
// Renvoie un message d'erreur clair (en français, affichable tel quel dans la
// modale) si quelque chose ne va pas, ou null si tout est correct.
function validerBien(b) {
  if (!b) return "Formulaire invalide.";
  if (!txt(b.titre, 120).trim()) return "Le nom du bien est obligatoire.";
  if (b.categorie && !CATEGORIES.includes(b.categorie)) return "Catégorie invalide.";
  if (b.categorie === "habitation" && b.sous_categorie && !SOUS_CATEGORIES_HABITATION.includes(b.sous_categorie)) {
    return "Sous-catégorie invalide pour un bien Habitation.";
  }
  if (b.coherence && !COHERENCES.includes(b.coherence)) return "Cohérence invalide.";
  if (b.vip && !VALEURS_VIP.includes(b.vip)) return "Statut VIP invalide.";
  if (b.coffre_kg !== "" && b.coffre_kg != null) {
    const coffre = Number(b.coffre_kg);
    if (!Number.isFinite(coffre) || coffre < 0) return "La capacité de coffre doit être un nombre positif.";
  }
  // Un bien doit être proposé à la vente et/ou à la location (les deux en même temps sont
  // possibles), avec un prix valide pour chaque mode coché.
  const dispoVente = !!b.dispo_vente;
  const dispoLocation = !!b.dispo_location;
  if (!dispoVente && !dispoLocation) {
    return "Le bien doit être proposé à la vente et/ou à la location.";
  }
  if (dispoVente) {
    const prixVente = Number(b.prix);
    if (b.prix === "" || b.prix == null || !Number.isFinite(prixVente) || prixVente < 0) {
      return "Le prix de vente doit être un nombre positif.";
    }
  }
  if (dispoLocation) {
    const prixLocation = Number(b.prix_location);
    if (b.prix_location === "" || b.prix_location == null || !Number.isFinite(prixLocation) || prixLocation < 0) {
      return "Le prix de location doit être un nombre positif.";
    }
  }
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length > 5) return "5 photos maximum par bien.";
  if (images.some((u) => typeof u !== "string" || u.length > 2_000_000)) {
    return "Une des photos est invalide ou trop volumineuse.";
  }
  return null;
}

function normaliserBien(b) {
  let images = [];
  try {
    const arr = Array.isArray(b.images) ? b.images : JSON.parse(b.images || "[]");
    images = arr.filter((u) => typeof u === "string" && u.trim()).slice(0, 5).map((u) => u.trim());
  } catch (e) {
    images = [];
  }
  const categorie = CATEGORIES.includes(b.categorie) ? b.categorie : "habitation";
  const dispoVente = !!b.dispo_vente;
  const dispoLocation = !!b.dispo_location;
  return {
    categorie,
    // La sous-catégorie n'a de sens que pour "habitation" ; on l'ignore pour "garage".
    sous_categorie: categorie === "habitation" && SOUS_CATEGORIES_HABITATION.includes(b.sous_categorie)
      ? b.sous_categorie
      : "",
    titre: txt(b.titre, 120).trim(),
    zone: txt(b.zone, 60),
    prix: dispoVente ? Math.max(0, Number(b.prix) || 0) : 0,
    prix_location: dispoLocation ? Math.max(0, Number(b.prix_location) || 0) : null,
    dispo_vente: dispoVente ? 1 : 0,
    dispo_location: dispoLocation ? 1 : 0,
    // Conservé pour compatibilité avec d'anciennes lectures éventuelles ; l'affichage se base
    // désormais sur dispo_vente / dispo_location, qui permettent les deux à la fois.
    transaction_type: dispoLocation && !dispoVente ? "location" : "vente",
    places: b.places === "" || b.places == null ? null : Math.max(0, Number(b.places) || 0),
    description: txt(b.description, 4000),
    images: JSON.stringify(images),
    coup_de_coeur: b.coup_de_coeur ? 1 : 0,
    disponible: b.disponible === false || b.disponible === 0 ? 0 : 1,
    vendu: b.vendu ? 1 : 0,
    // Un garage n'est jamais "meublé" : le champ n'a de sens que pour l'habitation.
    meuble: categorie === "habitation" && b.meuble !== false && b.meuble !== 0 ? 1 : 0,
    coherence: COHERENCES.includes(b.coherence) ? b.coherence : (categorie === "garage" ? "Garage" : "Habitation"),
    coffre_kg: b.coffre_kg === "" || b.coffre_kg == null ? null : Math.max(0, Number(b.coffre_kg) || 0),
    vip: VALEURS_VIP.includes(b.vip) ? b.vip : "",
    standing: b.standing ? 1 : 0,
  };
}

async function biens(request, url, env) {
  const id = url.searchParams.get("id");
  const m = request.method;

  if (m === "GET") {
    const sSeule = await session(request, env);
    const inclureIndisponiblesSeul = !!sSeule; // seuls les membres connectés voient les biens masqués

    if (id) {
      const d = await env.DB.prepare("SELECT * FROM biens WHERE id = ?1").bind(id).first();
      // Un bien décoché "visible sur le site" ne doit pas être consultable via son lien direct
      // par quelqu'un qui n'est pas connecté à l'espace agents.
      if (!d || (!d.disponible && !inclureIndisponiblesSeul)) return json({ erreur: "Introuvable." }, 404);
      return json(bienPourAffichage(d));
    }
    const categorie = url.searchParams.get("categorie");
    const zone = url.searchParams.get("zone");
    const coupDeCoeur = url.searchParams.get("coup_de_coeur");
    const vendu = url.searchParams.get("vendu");
    const meuble = url.searchParams.get("meuble");
    const coherence = url.searchParams.get("coherence");
    const standing = url.searchParams.get("standing");
    const inclureIndisponibles = inclureIndisponiblesSeul;

    let sql = "SELECT * FROM biens WHERE 1=1";
    const binds = [];
    // La vitrine "Nos dernières ventes" (accueil) est un contenu public assumé :
    // un bien vendu doit y rester visible même s'il a par ailleurs été décoché
    // "visible sur le site" par l'agent une fois la transaction conclue.
    if (!inclureIndisponibles && vendu !== "1") {
      sql += " AND disponible = 1";
    }
    if (categorie && CATEGORIES.includes(categorie)) {
      binds.push(categorie);
      sql += ` AND categorie = ?${binds.length}`;
    }
    if (zone) {
      binds.push(zone);
      sql += ` AND zone = ?${binds.length}`;
    }
    if (coupDeCoeur === "1") {
      sql += " AND coup_de_coeur = 1";
    }
    if (vendu === "1") {
      sql += " AND vendu = 1";
    }
    if (meuble === "1" || meuble === "0") {
      binds.push(meuble === "1" ? 1 : 0);
      sql += ` AND meuble = ?${binds.length}`;
    }
    if (coherence && COHERENCES.includes(coherence)) {
      binds.push(coherence);
      sql += ` AND coherence = ?${binds.length}`;
    }
    if (standing === "1") {
      sql += " AND standing = 1";
    }
    sql += vendu === "1" ? " ORDER BY vendu_le DESC" : " ORDER BY coup_de_coeur DESC, maj DESC";
    const stmt = env.DB.prepare(sql);
    const r = await (binds.length ? stmt.bind(...binds) : stmt).all();
    return json({ biens: (r.results || []).map(bienPourAffichage) });
  }

  // Toute écriture nécessite d'être connecté.
  const s = await session(request, env);
  if (!s) return json({ erreur: "Non connecté." }, 401);

  if (m === "POST") {
    const b = await request.json().catch(() => null);
    const erreur = validerBien(b);
    if (erreur) return json({ erreur }, 400);
    const n = normaliserBien(b);
    const r = await env.DB.prepare(
      `INSERT INTO biens (categorie, sous_categorie, titre, zone, prix, prix_location, dispo_vente,
                          dispo_location, transaction_type, places,
                          description, images, coup_de_coeur, disponible, vendu, vendu_le,
                          meuble, coherence, coffre_kg, vip, standing, auteur, cree_le, maj)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
               CASE WHEN ?15 = 1 THEN datetime('now') ELSE NULL END,
               ?16, ?17, ?18, ?19, ?20, ?21, datetime('now'), datetime('now'))`
    ).bind(
      n.categorie, n.sous_categorie, n.titre, n.zone, n.prix, n.prix_location, n.dispo_vente,
      n.dispo_location, n.transaction_type, n.places,
      n.description, n.images, n.coup_de_coeur, n.disponible, n.vendu,
      n.meuble, n.coherence, n.coffre_kg, n.vip, n.standing, s.pseudo
    ).run();
    return json({ id: r.meta.last_row_id });
  }

  if (m === "PUT") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    const existe = await env.DB.prepare("SELECT id FROM biens WHERE id = ?1").bind(id).first();
    if (!existe) return json({ erreur: "Introuvable." }, 404);
    const b = await request.json().catch(() => null);
    const erreur = validerBien(b);
    if (erreur) return json({ erreur }, 400);
    const n = normaliserBien(b);
    await env.DB.prepare(
      `UPDATE biens SET categorie=?2, sous_categorie=?3, titre=?4, zone=?5, prix=?6,
              prix_location=?7, dispo_vente=?8, dispo_location=?9, transaction_type=?10,
              places=?11, description=?12, images=?13, coup_de_coeur=?14,
              disponible=?15, vendu=?16,
              vendu_le = CASE
                WHEN ?16 = 1 AND vendu = 0 THEN datetime('now')
                WHEN ?16 = 0 THEN NULL
                ELSE vendu_le
              END,
              meuble=?17, coherence=?18, coffre_kg=?19, vip=?20, standing=?21,
              maj=datetime('now') WHERE id=?1`
    ).bind(
      id, n.categorie, n.sous_categorie, n.titre, n.zone, n.prix,
      n.prix_location, n.dispo_vente, n.dispo_location, n.transaction_type,
      n.places, n.description, n.images, n.coup_de_coeur, n.disponible, n.vendu,
      n.meuble, n.coherence, n.coffre_kg, n.vip, n.standing
    ).run();
    return json({ ok: true });
  }

  if (m === "DELETE") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    await env.DB.prepare("DELETE FROM biens WHERE id = ?1").bind(id).run();
    return json({ ok: true });
  }

  return json({ erreur: "Méthode non gérée." }, 405);
}

function bienPourAffichage(d) {
  let images = [];
  try {
    images = JSON.parse(d.images || "[]");
  } catch (e) {
    images = [];
  }
  return {
    ...d,
    images,
    coup_de_coeur: !!d.coup_de_coeur,
    disponible: !!d.disponible,
    vendu: !!d.vendu,
    meuble: !!d.meuble,
    standing: !!d.standing,
    dispo_vente: !!d.dispo_vente,
    dispo_location: !!d.dispo_location,
  };
}

// ---- membres (comptes de l'équipe admin) ----------------------------------

async function membres(request, url, env) {
  const s = await session(request, env);
  if (!s) return json({ erreur: "Non connecté." }, 401);
  if (!estDirection(s)) return json({ erreur: "Réservé à la Direction." }, 403);
  const id = url.searchParams.get("id");
  const m = request.method;

  if (m === "GET") {
    const r = await env.DB.prepare(
      `SELECT id, pseudo, grade, code_indice, actif, cree_le, derniere_visite
         FROM membres ORDER BY grade ASC, pseudo COLLATE NOCASE`
    ).all();
    return json({ membres: r.results || [] });
  }

  if (m === "POST") {
    const b = await request.json().catch(() => null);
    const pseudo = txt(b && b.pseudo, 40).trim();
    if (!pseudo) return json({ erreur: "Le pseudo est obligatoire." }, 400);
    const grade = (b && b.grade) === "Direction" ? "Direction" : "Agent";
    const code = genererCode();
    const h = await empreinte(env.SESSION_SECRET, normaliserCode(code));
    const r = await env.DB.prepare(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, cree_le)
       VALUES (?1, ?2, ?3, ?4, 1, datetime('now'))`
    ).bind(pseudo, grade, h, code.slice(-4)).run();
    return json({ id: r.meta.last_row_id, pseudo, grade, code });
  }

  if (m === "PATCH") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    const b = await request.json().catch(() => null);
    if (!b) return json({ erreur: "Requête illisible." }, 400);
    if (b.action === "regenerer") {
      const code = genererCode();
      const h = await empreinte(env.SESSION_SECRET, normaliserCode(code));
      await env.DB.prepare("UPDATE membres SET code_hash = ?2, code_indice = ?3 WHERE id = ?1")
        .bind(id, h, code.slice(-4))
        .run();
      return json({ code });
    }
    const pseudo = txt(b.pseudo, 40).trim();
    if (!pseudo) return json({ erreur: "Le pseudo est obligatoire." }, 400);
    const grade = b.grade === "Direction" ? "Direction" : "Agent";
    const actif = b.actif ? 1 : 0;
    if (String(id) === String(s.id) && (grade !== "Direction" || !actif)) {
      return json({ erreur: "Vous ne pouvez pas retirer vos propres droits." }, 400);
    }
    await env.DB.prepare("UPDATE membres SET pseudo = ?2, grade = ?3, actif = ?4 WHERE id = ?1")
      .bind(id, pseudo, grade, actif)
      .run();
    return json({ ok: true });
  }

  if (m === "DELETE") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    if (String(id) === String(s.id)) {
      return json({ erreur: "Vous ne pouvez pas supprimer votre propre accès." }, 400);
    }
    await env.DB.prepare("DELETE FROM membres WHERE id = ?1").bind(id).run();
    return json({ ok: true });
  }

  return json({ erreur: "Méthode non gérée." }, 405);
}
