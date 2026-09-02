// ============================================================================
// Dynasty 8 — Worker Cloudflare (API + authentification)
// ----------------------------------------------------------------------------
// Ce fichier gère uniquement les adresses qui commencent par /api/ (voir
// wrangler.toml : run_worker_first = ["/api/*"]). Toutes les autres adresses
// (les pages du site) sont servies directement par Cloudflare depuis le
// dossier /public, sans passer par ce code.
//
// Principe de connexion : chaque membre se connecte avec son compte Discord
// (bouton "Se connecter avec Discord"). On ne stocke jamais son mot de passe
// Discord — seulement son identifiant Discord (numéro permanent), obtenu via
// le protocole standard "OAuth2". Une fois l'identité confirmée par Discord,
// le Worker pose un cookie signé (comme un bracelet infalsifiable) qui prouve
// l'identité de la personne pendant 12h.
//
// Le tout premier accès d'un pseudo Discord inconnu crée une "demande en
// attente" que la Direction doit valider (bouton ✓) depuis l'onglet "Comptes
// & accès". La Direction peut aussi pré-autoriser quelqu'un à l'avance via
// "Créer le compte" (en tapant son pseudo Discord exact) : cette personne
// obtient alors l'accès dès sa toute première connexion, sans validation
// manuelle.
// ============================================================================

const COOKIE = "d8_session";
const COOKIE_ETAT_OAUTH = "d8_oauth_state"; // protection anti-CSRF pendant l'aller-retour vers Discord
const DUREE = 60 * 60 * 12; // 12 heures, en secondes
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
const VALEURS_VIP = ["", "vip"];

// Les 10 grades de la hiérarchie Dynasty 8, du plus élevé au plus bas. "niveau"
// détermine les droits réels dans l'espace agents :
//   "direction"  -> accès total (annonces + comptes & accès)
//   "commercial" -> gestion des annonces uniquement
//   "membre"     -> aucun accès, seulement "Mon profil"
// (même liste côté site public, dans layout.js — à garder synchronisée si elle change un jour)
const GRADES = [
  { nom: "Développeur web", niveau: "direction" },
  { nom: "Patron", niveau: "direction" },
  { nom: "Co Patron", niveau: "direction" },
  { nom: "Manager", niveau: "direction" },
  { nom: "DRH", niveau: "direction" },
  { nom: "Secrétaire de Direction", niveau: "direction" },
  { nom: "Référent Immobilier", niveau: "commercial" },
  { nom: "Agent Expert", niveau: "commercial" },
  { nom: "Agent", niveau: "commercial" },
  { nom: "Agent Novice", niveau: "commercial" },
  { nom: "Stagiaire", niveau: "membre" },
];
const NOMS_GRADES = GRADES.map((g) => g.nom);
const NIVEAU_PAR_GRADE = Object.fromEntries(GRADES.map((g) => [g.nom, g.niveau]));
// Grade attribué automatiquement quand la Direction clique "✓ Valider" sur une
// demande : le plus prudent (aucun accès annonces). La Direction l'ajuste
// ensuite via le menu déroulant de la ligne, dans le tableau des comptes.
const GRADE_PAR_DEFAUT = "Stagiaire";

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

function egal(a, b) {
  // Comparaison "à temps constant" : évite de révéler des indices via le
  // temps de réponse.
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

// Redirection HTTP classique (utilisée pour l'aller-retour OAuth Discord),
// avec la possibilité de poser plusieurs cookies à la fois.
function redirection(location, setCookies) {
  const headers = new Headers({ Location: location });
  (setCookies || []).forEach((c) => headers.append("Set-Cookie", c));
  return new Response(null, { status: 302, headers });
}

function txt(v, max) {
  return v == null ? "" : String(v).slice(0, max);
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
      // "await" est indispensable ici (et pas juste "return xxx(...)") : sans lui,
      // une erreur survenant DANS une de ces fonctions passerait au travers du
      // "catch" ci-dessous et ferait planter tout le Worker (page Cloudflare
      // "Error 1101"), au lieu d'afficher un message clair.
      if (chemin === "/api/auth/discord") return await discordAutoriser(request, env);
      if (chemin === "/api/auth/discord/callback") return await discordCallback(request, url, env);
      if (chemin === "/api/deconnexion") return deconnexion();
      if (chemin === "/api/moi") return await moi(request, env);
      if (chemin === "/api/biens") return await biens(request, url, env);
      if (chemin === "/api/membres") return await comptes(request, url, env);
      if (chemin === "/api/equipe") return await equipe(env);
      if (chemin === "/api/agenda") return await agenda(request, url, env);
      return json({ erreur: "Adresse inconnue." }, 404);
    } catch (e) {
      return json({ erreur: "Erreur interne", detail: String((e && e.message) || e) }, 500);
    }
  },
};

// ---- connexion via Discord (OAuth2) ---------------------------------------

async function discordAutoriser(request, env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) {
    return json({ erreur: "La connexion Discord n'est pas encore configurée sur le serveur." }, 500);
  }
  // "état" aléatoire à usage unique : on le pose dans un cookie ET on le
  // renvoie à Discord, qui nous le redonne tel quel au retour. S'ils ne
  // correspondent pas au retour, on refuse (protection contre les faux liens).
  const etat = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state: etat,
    prompt: "consent",
  });
  return redirection(
    "https://discord.com/api/oauth2/authorize?" + params.toString(),
    [poserCookie(COOKIE_ETAT_OAUTH, etat, 600)]
  );
}

// Construit l'adresse de la photo de profil Discord à partir de l'identifiant
// et du "hash" d'avatar renvoyés par Discord. Si la personne n'a jamais mis de
// photo (avatarHash vide), on retombe sur l'avatar par défaut de Discord.
function urlAvatarDiscord(discordId, avatarHash) {
  if (avatarHash) {
    const extension = avatarHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${extension}?size=64`;
  }
  try {
    // Formule officielle Discord pour l'avatar par défaut (nouveaux comptes,
    // sans discriminant) : (identifiant >> 22) % 6.
    const index = Number((BigInt(discordId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch (e) {
    return "";
  }
}

async function discordCallback(request, url, env) {
  const echec = (raison) =>
    redirection("/admin.html?d8=" + encodeURIComponent(raison), [poserCookie(COOKIE_ETAT_OAUTH, "", 0)]);

  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI) {
    return echec("config");
  }

  const code = url.searchParams.get("code");
  const etatRecu = url.searchParams.get("state");
  const etatAttendu = cookies(request)[COOKIE_ETAT_OAUTH];
  if (!code || !etatRecu || !etatAttendu || etatRecu !== etatAttendu) {
    return echec("erreur");
  }

  let jetonDiscord;
  try {
    const reponseJeton = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.DISCORD_REDIRECT_URI,
      }),
    });
    if (!reponseJeton.ok) return echec("erreur");
    jetonDiscord = await reponseJeton.json();
  } catch (e) {
    return echec("erreur");
  }

  let discordUser;
  try {
    const reponseUser = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `${jetonDiscord.token_type || "Bearer"} ${jetonDiscord.access_token}` },
    });
    if (!reponseUser.ok) return echec("erreur");
    discordUser = await reponseUser.json();
  } catch (e) {
    return echec("erreur");
  }

  const discordId = String(discordUser.id || "");
  const discordPseudo = String(discordUser.username || "").trim();
  if (!discordId || !discordPseudo) return echec("erreur");
  const discordAvatar = urlAvatarDiscord(discordId, discordUser.avatar || "");

  // Toute la partie base de données est protégée : si la migration n'a pas
  // encore été appliquée (colonnes manquantes) ou qu'un autre souci survient,
  // on affiche l'écran d'erreur habituel plutôt que de faire planter le Worker.
  try {
    let m = await env.DB.prepare("SELECT * FROM membres WHERE discord_id = ?1").bind(discordId).first();

    if (!m) {
      // Pas encore lié à ce Discord : peut-être pré-autorisé par la Direction ?
      const preAutorise = await env.DB.prepare(
        "SELECT * FROM membres WHERE discord_id IS NULL AND statut = 'invite' AND lower(discord_pseudo) = lower(?1)"
      ).bind(discordPseudo).first();

      if (preAutorise) {
        // Lien définitif : à partir de maintenant, seul ce compte Discord ouvrira ce compte Dynasty 8.
        await env.DB.prepare(
          "UPDATE membres SET discord_id = ?2, discord_pseudo = ?3, discord_avatar = ?4, statut = 'valide', derniere_visite = datetime('now') WHERE id = ?1"
        ).bind(preAutorise.id, discordId, discordPseudo, discordAvatar).run();
        m = { ...preAutorise, discord_id: discordId, statut: "valide" };
      } else {
        // Personne ne l'attendait : on crée une demande en attente de validation.
        await env.DB.prepare(
          `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, statut, discord_id, discord_pseudo, discord_avatar, cree_le)
           VALUES (?1, '', lower(hex(randomblob(32))), '----', 0, 'attente', ?2, ?3, ?4, datetime('now'))`
        ).bind(discordUser.global_name || discordPseudo, discordId, discordPseudo, discordAvatar).run();
        return echec("attente");
      }
    }

    if (m.statut === "attente") return echec("attente");
    if (m.statut !== "valide" || !m.actif) return echec("desactive");

    // On rafraîchit aussi l'avatar à chaque connexion : la photo Discord de la
    // personne a pu changer depuis la dernière fois.
    await env.DB.prepare("UPDATE membres SET derniere_visite = datetime('now'), discord_avatar = ?2 WHERE id = ?1").bind(m.id, discordAvatar).run();
    const jeton = await creerSession(env.SESSION_SECRET, {
      id: m.id,
      pseudo: m.pseudo,
      grade: m.grade,
      exp: maintenant() + DUREE,
    });
    return redirection("/admin.html", [
      poserCookie(COOKIE, jeton, DUREE),
      poserCookie(COOKIE_ETAT_OAUTH, "", 0),
    ]);
  } catch (e) {
    return echec("erreur");
  }
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

// On ne se contente jamais du grade/pseudo enregistrés dans le cookie au moment
// de la connexion (il peut rester valable jusqu'à 12h) : à chaque requête, on
// revérifie en base que le compte existe toujours, qu'il est bien "valide" et
// actif, et on renvoie son grade ACTUEL. Comme ça, un changement de grade fait
// par la Direction (ou une suspension) s'applique tout de suite, même si la
// personne concernée est déjà connectée — sans attendre qu'elle se déconnecte.
async function session(request, env) {
  const s = await lireSession(env.SESSION_SECRET, cookies(request)[COOKIE]);
  if (!s || !s.id) return null;
  const m = await env.DB.prepare(
    "SELECT id, pseudo, grade, statut, actif FROM membres WHERE id = ?1"
  ).bind(s.id).first();
  if (!m || m.statut !== "valide" || !m.actif) return null;
  return { id: m.id, pseudo: m.pseudo, grade: m.grade, exp: s.exp };
}

// "niveau" résume le grade en 3 paliers de droits (voir GRADES ci-dessus).
// Un grade vide/inconnu (ex: demande en attente) n'a par sécurité aucun accès.
function niveauAcces(s) {
  return NIVEAU_PAR_GRADE[(s && s.grade) || ""] || "membre";
}
function estDirection(s) {
  return niveauAcces(s) === "direction";
}
function peutGererAnnonces(s) {
  const n = niveauAcces(s);
  return n === "direction" || n === "commercial";
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
    peut_gerer_annonces: peutGererAnnonces(s),
    poste: (m && m.poste) || "",
    specialite: (m && m.specialite) || "",
    bio: (m && m.bio) || "",
    photo: (m && m.photo) || "",
  });
}

// ---- « Mon profil » : chaque membre édite sa propre fiche publique ------
// Volontairement séparé de la gestion des comptes (comptes()) : ces champs
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

// ---- « Mon agenda » : planning personnel de chaque membre ----------------
// Strictement privé : accessible à tout membre connecté, quel que soit son
// grade (comme « Mon profil »), mais chaque personne ne voit et ne modifie
// QUE ses propres événements. La clause "membre_id = s.id" vient toujours de
// la session signée, jamais d'une valeur envoyée par le client — impossible
// donc de lire ou modifier l'agenda d'un collègue en devinant un identifiant.

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validerEvenementAgenda(b) {
  if (!b) return "Formulaire invalide.";
  if (!txt(b.titre, 80).trim()) return "Le titre de l'événement est obligatoire.";
  if (!RE_DATE.test(String(b.jour || ""))) return "Date invalide.";
  if (!RE_HEURE.test(String(b.heure_debut || ""))) return "Heure de début invalide.";
  if (!RE_HEURE.test(String(b.heure_fin || ""))) return "Heure de fin invalide.";
  if (String(b.heure_fin) <= String(b.heure_debut)) return "L'heure de fin doit être après l'heure de début.";
  if (String(b.notes || "").length > 500) return "Les notes sont trop longues (500 caractères maximum).";
  return null;
}

async function agenda(request, url, env) {
  const s = await session(request, env);
  if (!s) return json({ erreur: "Non connecté." }, 401);
  const id = url.searchParams.get("id");
  const m = request.method;

  if (m === "GET") {
    const debut = url.searchParams.get("debut");
    const fin = url.searchParams.get("fin");
    if (!RE_DATE.test(debut || "") || !RE_DATE.test(fin || "")) {
      return json({ erreur: "Plage de dates invalide." }, 400);
    }
    const r = await env.DB.prepare(
      `SELECT id, titre, jour, heure_debut, heure_fin, notes FROM evenements_agenda
       WHERE membre_id = ?1 AND jour >= ?2 AND jour <= ?3 ORDER BY jour, heure_debut`
    ).bind(s.id, debut, fin).all();
    return json({ evenements: r.results || [] });
  }

  if (m === "POST") {
    const b = await request.json().catch(() => null);
    const erreur = validerEvenementAgenda(b);
    if (erreur) return json({ erreur }, 400);
    const r = await env.DB.prepare(
      `INSERT INTO evenements_agenda (membre_id, titre, jour, heure_debut, heure_fin, notes, cree_le, maj)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))`
    ).bind(s.id, txt(b.titre, 80).trim(), b.jour, b.heure_debut, b.heure_fin, txt(b.notes, 500).trim()).run();
    return json({ id: r.meta.last_row_id });
  }

  if (m === "PUT") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    const existe = await env.DB.prepare(
      "SELECT id FROM evenements_agenda WHERE id = ?1 AND membre_id = ?2"
    ).bind(id, s.id).first();
    if (!existe) return json({ erreur: "Introuvable." }, 404);
    const b = await request.json().catch(() => null);
    const erreur = validerEvenementAgenda(b);
    if (erreur) return json({ erreur }, 400);
    await env.DB.prepare(
      `UPDATE evenements_agenda SET titre=?3, jour=?4, heure_debut=?5, heure_fin=?6, notes=?7, maj=datetime('now')
       WHERE id=?1 AND membre_id=?2`
    ).bind(id, s.id, txt(b.titre, 80).trim(), b.jour, b.heure_debut, b.heure_fin, txt(b.notes, 500).trim()).run();
    return json({ ok: true });
  }

  if (m === "DELETE") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    await env.DB.prepare("DELETE FROM evenements_agenda WHERE id = ?1 AND membre_id = ?2").bind(id, s.id).run();
    return json({ ok: true });
  }

  return json({ erreur: "Méthode non gérée." }, 405);
}

// ---- équipe (page publique /equipe.html) ----------------------------------
// Lecture publique, aucune connexion requise. Ne renvoie que des champs
// destinés à être affichés (jamais discord_id, code_hash, dates internes...).

async function equipe(env) {
  const r = await env.DB.prepare(
    `SELECT id, pseudo, grade, poste, specialite, bio, photo
       FROM membres
       WHERE statut = 'valide' AND actif = 1
       ORDER BY CASE grade
         WHEN 'Développeur web' THEN 0 WHEN 'Patron' THEN 1 WHEN 'Co Patron' THEN 2 WHEN 'Manager' THEN 3
         WHEN 'DRH' THEN 4 WHEN 'Secrétaire de Direction' THEN 5 WHEN 'Référent Immobilier' THEN 6
         WHEN 'Agent Expert' THEN 7 WHEN 'Agent' THEN 8 WHEN 'Agent Novice' THEN 9
         WHEN 'Stagiaire' THEN 10 ELSE 11 END,
         pseudo COLLATE NOCASE`
  ).all();
  const liste = (r.results || []).map((m) => ({
    id: m.id,
    pseudo: m.pseudo,
    poste: m.poste || m.grade || "Agent immobilier",
    specialite: m.specialite || "",
    bio: m.bio || "",
    photo: m.photo || "",
  }));
  return json({ membres: liste });
}

// ---- biens (annonces immobilières) ---------------------------------------
// Lecture publique (aucune connexion requise) : tout le monde peut voir les
// annonces disponibles. Écriture réservée aux membres ayant un grade Direction
// ou Commercial (voir GRADES) — un membre de niveau "membre" (ex: Stagiaire)
// n'a accès qu'à son propre profil.

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

  // Toute écriture nécessite d'être connecté ET d'avoir un grade Direction ou Commercial.
  const s = await session(request, env);
  if (!s) return json({ erreur: "Non connecté." }, 401);
  if (!peutGererAnnonces(s)) {
    return json({ erreur: "Votre grade ne permet pas de gérer les annonces." }, 403);
  }

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

// ---- comptes & accès (réservé à la Direction) ------------------------------
// Regroupe 3 choses dans l'onglet "Comptes & accès" de l'espace agents :
//  - les demandes en attente (quelqu'un s'est connecté via Discord, personne
//    ne l'attendait) : la Direction clique ✓ (Valider) ou ✕ (Refuser/supprimer) ;
//  - le tableau des comptes existants : identifiant renommable, grade
//    modifiable, compte suspendable/supprimable ;
//  - "Créer le compte" : pré-autoriser un pseudo Discord exact à l'avance —
//    cette personne obtient l'accès dès sa toute première connexion.

async function comptes(request, url, env) {
  const s = await session(request, env);
  if (!s) return json({ erreur: "Non connecté." }, 401);
  if (!estDirection(s)) return json({ erreur: "Réservé à la Direction." }, 403);
  const id = url.searchParams.get("id");
  const m = request.method;

  if (m === "GET") {
    const r = await env.DB.prepare(
      `SELECT id, pseudo, grade, discord_pseudo, discord_avatar, statut, actif, cree_le, derniere_visite, poste, specialite, bio, photo
         FROM membres
         WHERE statut != 'desactive'
         ORDER BY CASE statut WHEN 'attente' THEN 0 WHEN 'invite' THEN 1 ELSE 2 END,
                  pseudo COLLATE NOCASE`
    ).all();
    return json({ membres: r.results || [] });
  }

  if (m === "POST") {
    // "Créer le compte" — pré-autorisation par pseudo Discord exact.
    const b = await request.json().catch(() => null);
    const discordPseudo = txt(b && b.discord_pseudo, 40).trim();
    const grade = NOMS_GRADES.includes(b && b.grade) ? b.grade : GRADE_PAR_DEFAUT;
    if (!discordPseudo) return json({ erreur: "Le pseudo Discord exact est obligatoire." }, 400);
    const existe = await env.DB.prepare(
      "SELECT id FROM membres WHERE statut != 'desactive' AND lower(discord_pseudo) = lower(?1)"
    ).bind(discordPseudo).first();
    if (existe) return json({ erreur: "Un compte existe déjà pour ce pseudo Discord." }, 400);
    const r = await env.DB.prepare(
      `INSERT INTO membres (pseudo, grade, code_hash, code_indice, actif, statut, discord_pseudo, cree_le)
       VALUES (?1, ?2, lower(hex(randomblob(32))), '----', 1, 'invite', ?3, datetime('now'))`
    ).bind(discordPseudo, grade, discordPseudo).run();
    return json({ id: r.meta.last_row_id, pseudo: discordPseudo, grade });
  }

  if (m === "PATCH") {
    if (!id) return json({ erreur: "Identifiant manquant." }, 400);
    const b = await request.json().catch(() => null);
    if (!b) return json({ erreur: "Requête illisible." }, 400);

    if (b.action === "valider") {
      // Un seul clic suffit : le compte est activé avec le grade le plus
      // prudent, que la Direction pourra ajuster ensuite dans le tableau.
      await env.DB.prepare(
        "UPDATE membres SET statut = 'valide', actif = 1, grade = ?2 WHERE id = ?1 AND statut = 'attente'"
      ).bind(id, GRADE_PAR_DEFAUT).run();
      return json({ ok: true });
    }

    const cible = await env.DB.prepare("SELECT id FROM membres WHERE id = ?1 AND statut != 'desactive'").bind(id).first();
    if (!cible) return json({ erreur: "Introuvable." }, 404);

    const champs = [];
    const binds = [id];
    if (b.pseudo !== undefined) {
      const pseudo = txt(b.pseudo, 40).trim();
      if (!pseudo) return json({ erreur: "L'identifiant est obligatoire." }, 400);
      binds.push(pseudo);
      champs.push(`pseudo = ?${binds.length}`);
    }
    if (b.grade !== undefined) {
      if (!NOMS_GRADES.includes(b.grade)) return json({ erreur: "Grade invalide." }, 400);
      if (String(id) === String(s.id) && NIVEAU_PAR_GRADE[b.grade] !== "direction") {
        return json({ erreur: "Vous ne pouvez pas retirer vos propres droits de Direction." }, 400);
      }
      binds.push(b.grade);
      champs.push(`grade = ?${binds.length}`);
    }
    if (b.actif !== undefined) {
      if (String(id) === String(s.id) && !b.actif) {
        return json({ erreur: "Vous ne pouvez pas suspendre votre propre compte." }, 400);
      }
      binds.push(b.actif ? 1 : 0);
      champs.push(`actif = ?${binds.length}`);
    }
    // La Direction peut aussi éditer la fiche publique (équipe.html) de
    // n'importe quel membre — mêmes champs et mêmes règles que « Mon profil ».
    if (b.poste !== undefined || b.specialite !== undefined || b.bio !== undefined || b.photo !== undefined) {
      const erreurProfil = validerProfil({
        poste: b.poste !== undefined ? b.poste : "",
        specialite: b.specialite !== undefined ? b.specialite : "",
        bio: b.bio !== undefined ? b.bio : "",
        photo: b.photo !== undefined ? b.photo : "",
      });
      if (erreurProfil) return json({ erreur: erreurProfil }, 400);
      if (b.poste !== undefined) { binds.push(txt(b.poste, 80).trim()); champs.push(`poste = ?${binds.length}`); }
      if (b.specialite !== undefined) { binds.push(txt(b.specialite, 100).trim()); champs.push(`specialite = ?${binds.length}`); }
      if (b.bio !== undefined) { binds.push(txt(b.bio, 1000).trim()); champs.push(`bio = ?${binds.length}`); }
      if (b.photo !== undefined) { binds.push(typeof b.photo === "string" ? b.photo.trim() : ""); champs.push(`photo = ?${binds.length}`); }
    }
    if (!champs.length) return json({ erreur: "Aucune modification envoyée." }, 400);
    await env.DB.prepare(`UPDATE membres SET ${champs.join(", ")} WHERE id = ?1`).bind(...binds).run();
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
