// ============================================================================
// Dynasty 8 — réglages du site modifiables depuis l'espace agents
// ----------------------------------------------------------------------------
// Tout ce qui est « un lien » (WebMap, document des cohérences, Google Sheets
// de la synchronisation, registre, Discord, boutique...) vit dans la table
// reglages_site et se règle dans l'onglet Paramètres : aucune adresse n'est
// écrite dans le code, et un changement s'applique tout de suite, sans
// redémarrage ni déploiement.
//
//   - Réglages PRIVÉS : lus seulement par le serveur ou par les comptes
//     connectés. La WebMap, les cohérences et le Google Sheets venaient
//     autrefois du .env : ce n'est plus le cas, seule la valeur réglée ici
//     compte. Pour qu'un site déjà en service ne perde rien, une valeur
//     encore présente dans son .env est recopiée ici UNE fois, au démarrage
//     (reprendreReglagesDuEnv), puis n'est plus jamais lue : la ligne peut
//     être retirée du .env.
//   - Réglages PUBLICS : liens affichés sur les pages publiques, servis par
//     GET /api/liens. Leur valeur de départ est posée une fois par
//     schema.postgres.sql.
//
// Modifiables par Patron, Co Patron et Développeur web seulement : l'adresse
// de la WebMap fait faire des requêtes au serveur (proxy /api/carte), ce
// n'est pas un réglage à laisser à tout le monde.
// ============================================================================

export const GRADES_REGLAGES = ["Patron", "Co Patron", "Développeur web"];

// type : "origine" (https://hôte, sans chemin), "url" (lien https complet),
//        "sheet" (lien ou identifiant d'un Google Sheets -> sheet_id + sheet_gid).
// ancienneVariable : variable du .env qui portait ce réglage, reprise une fois.
export const REGLAGES = [
  { cle: "webmap_origine", groupe: "prive", type: "origine", ancienneVariable: "WEBMAP_ORIGIN", libelle: "WebMap",
    aide: "Adresse de la carte interactive (ex. https://carte.exemple.fr). Le site la sert par /api/carte : cette adresse n'est jamais envoyée au navigateur." },
  { cle: "coherences_url", groupe: "prive", type: "url", ancienneVariable: "COHERENCES_SHEET_URL", libelle: "Document des cohérences",
    aide: "Lien du document ouvert par le bouton « Cohérences » de l'espace agents." },
  { cle: "sheet", groupe: "prive", type: "sheet", ancienneVariable: "GOOGLE_SHEET_ID", libelle: "Google Sheets de la synchronisation",
    aide: "Ouvrez dans Google Sheets l'onglet du récapitulatif des ventes, puis collez ici l'adresse de la barre du navigateur : elle doit se terminer par « gid=… », qui désigne cet onglet (sans gid, c'est le premier onglet du classeur qui est lu). Le tableur doit être partagé en lecture « Tous les utilisateurs disposant du lien »." },
  { cle: "registre_url", groupe: "prive", type: "url", libelle: "Registre (intranet)",
    aide: "Lien du bouton « Registre » de l'espace agents. Vide : le bouton est masqué." },
  { cle: "discord_agence", groupe: "public", type: "url", libelle: "Discord de l'agence",
    aide: "« Nous contacter », pied de page et boutons de contact des pages publiques." },
  { cle: "boutique_vip", groupe: "public", type: "url", libelle: "Boutique VIP",
    aide: "Boutons de la page VIP." },
  { cle: "discord_partenaire_deco", groupe: "public", type: "url", libelle: "Discord du partenaire décoration",
    aide: "Bouton « Rejoindre Terra Home Deco » de l'accueil." },
  { cle: "prestataire_site", groupe: "public", type: "url", libelle: "Site du prestataire",
    aide: "Lien « Site » du crédit en pied de page." },
  { cle: "prestataire_discord", groupe: "public", type: "url", libelle: "Discord du prestataire",
    aide: "Lien « Discord » du crédit en pied de page, et « Découvrir nos offres » de la page équipe." },
];

const RE_SHEET_ID = /^[A-Za-z0-9_-]{20,}$/;

function json(donnees, status = 200) {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ---- validation ---------------------------------------------------------------

// Hôtes que le serveur ne doit jamais aller chercher pour le compte de
// quelqu'un : lui-même, et les réseaux privés (le proxy de la carte ferait
// sinon lire des services internes à qui règle cette adresse).
function hoteInterne(hote) {
  const h = hote.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true; // adresse IPv6 littérale
  const ip = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ip) return !h.includes("."); // nom sans domaine (ex. « postgres »)
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function lireUrlHttps(valeur) {
  let u;
  try { u = new URL(valeur); } catch { return null; }
  return u.protocol === "https:" && !u.username && !u.password ? u : null;
}

// Lien de partage Google Sheets (ou identifiant seul) -> { id, gid }.
export function lireLienSheet(valeur) {
  const brut = String(valeur || "").trim();
  if (RE_SHEET_ID.test(brut)) return { id: brut, gid: "0" };
  const u = lireUrlHttps(brut);
  if (!u || u.hostname !== "docs.google.com") return null;
  const id = (u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/) || [])[1];
  if (!id) return null;
  const gid = (u.hash.match(/gid=(\d+)/) || u.search.match(/[?&]gid=(\d+)/) || [])[1] || "0";
  return { id, gid };
}

// Valeur saisie -> lignes à enregistrer ({ cle: valeur }), ou une erreur.
function validerReglage(definition, saisie) {
  const valeur = String(saisie == null ? "" : saisie).trim().slice(0, 500);
  if (definition.type === "sheet") {
    if (!valeur) return { lignes: { sheet_id: "", sheet_gid: "" } };
    const sheet = lireLienSheet(valeur);
    if (!sheet) return { erreur: `${definition.libelle} : collez le lien du Google Sheets (https://docs.google.com/spreadsheets/d/…).` };
    return { lignes: { sheet_id: sheet.id, sheet_gid: sheet.gid } };
  }
  if (!valeur) return { lignes: { [definition.cle]: "" } };
  const u = lireUrlHttps(valeur);
  if (!u) return { erreur: `${definition.libelle} : un lien complet en https:// est attendu.` };
  if (definition.type === "origine") {
    if (hoteInterne(u.hostname)) return { erreur: `${definition.libelle} : cette adresse désigne le serveur lui-même ou un réseau privé.` };
    return { lignes: { [definition.cle]: u.origin } };
  }
  return { lignes: { [definition.cle]: u.toString() } };
}

// ---- lecture (avec un cache court, vidé à chaque enregistrement) --------------

const DUREE_CACHE_MS = 15_000;
const caches = new WeakMap(); // une entrée par base (env.DB)

async function lireValeurs(env) {
  const enCache = caches.get(env.DB);
  if (enCache && Date.now() - enCache.luA < DUREE_CACHE_MS) return enCache.valeurs;
  const r = await env.DB.prepare("SELECT cle, valeur FROM reglages_site").all();
  const valeurs = {};
  for (const { cle, valeur } of r.results || []) valeurs[cle] = valeur || "";
  caches.set(env.DB, { valeurs, luA: Date.now() });
  return valeurs;
}

// L'environnement vu par le reste du code. WEBMAP_ORIGIN, COHERENCES_SHEET_URL
// et GOOGLE_SHEET_ID / _GID y sont des noms INTERNES, toujours remplis depuis
// les réglages du site — jamais depuis le .env, même s'il en contient encore.
// Réglages illisibles (base injoignable) : ces liens sont alors simplement
// indisponibles.
export async function envAvecReglages(env) {
  let v = {};
  try { v = await lireValeurs(env); } catch (e) {
    console.error("[reglages] Lecture des réglages impossible :", e && e.message);
  }
  return {
    ...env,
    REGLAGES_SITE: v,
    WEBMAP_ORIGIN: v.webmap_origine || "",
    COHERENCES_SHEET_URL: v.coherences_url || "",
    GOOGLE_SHEET_ID: v.sheet_id || "",
    GOOGLE_SHEET_GID: v.sheet_id ? (v.sheet_gid || "0") : "",
  };
}

// Reprise unique des anciennes variables du .env (WEBMAP_ORIGIN,
// COHERENCES_SHEET_URL, GOOGLE_SHEET_ID / GOOGLE_SHEET_GID), au démarrage du
// serveur : une valeur encore présente est recopiée dans les réglages SI ce
// réglage n'a jamais été enregistré. Une fois la ligne créée (même vidée
// ensuite dans l'onglet Paramètres), la variable n'est plus jamais reprise.
// Renvoie les noms des variables reprises, qui peuvent être retirées du .env.
export async function reprendreReglagesDuEnv(env, variables) {
  const reprises = [];
  for (const d of REGLAGES) {
    if (!d.ancienneVariable) continue;
    let saisie = String((variables && variables[d.ancienneVariable]) || "").trim();
    if (!saisie) continue;
    if (d.type === "sheet") {
      const gid = String((variables && variables.GOOGLE_SHEET_GID) || "").trim();
      saisie = lienSheet(saisie, /^\d+$/.test(gid) ? gid : "0");
    }
    const r = validerReglage(d, saisie);
    if (r.erreur) {
      console.error(`[reglages] ${d.ancienneVariable} du .env non reprise (${r.erreur}) : à régler dans l'onglet Paramètres.`);
      continue;
    }
    let creee = false;
    for (const [cle, valeur] of Object.entries(r.lignes)) {
      const ligne = await env.DB.prepare(
        "INSERT INTO reglages_site (cle, valeur, maj_par) VALUES (?1, ?2, 'reprise du .env') ON CONFLICT (cle) DO NOTHING RETURNING cle"
      ).bind(cle, valeur).first();
      if (ligne) creee = true;
    }
    if (creee) reprises.push(d.ancienneVariable);
  }
  if (reprises.length) caches.delete(env.DB);
  return reprises;
}

// Lien privé réglé sur le site (ex. le registre), pour un compte connecté.
export function lienRegle(env, cle) {
  const u = lireUrlHttps((env && env.REGLAGES_SITE && env.REGLAGES_SITE[cle]) || "");
  return u ? u.toString() : "";
}

// GET /api/liens — liens des pages publiques (rien de privé ici).
export async function liensPublics(env) {
  const v = (env && env.REGLAGES_SITE) || (await lireValeurs(env));
  const liens = {};
  for (const d of REGLAGES) if (d.groupe === "public") liens[d.cle] = lienRegle({ REGLAGES_SITE: v }, d.cle);
  return json(liens);
}

// ---- onglet Paramètres --------------------------------------------------------

const lienSheet = (id, gid) => (id ? `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid || "0"}` : "");

async function lister(env) {
  caches.delete(env.DB);
  const v = await lireValeurs(env);
  return {
    reglages: REGLAGES.map((d) => {
      const valeur = d.type === "sheet" ? lienSheet(v.sheet_id, v.sheet_gid) : (v[d.cle] || "");
      return { cle: d.cle, groupe: d.groupe, type: d.type, libelle: d.libelle, aide: d.aide, valeur, regle: !!valeur };
    }),
  };
}

async function enregistrer(env, request, s) {
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ erreur: "Requête illisible." }, 400);
  const lignes = {};
  for (const d of REGLAGES) {
    if (b[d.cle] === undefined) continue;
    const r = validerReglage(d, b[d.cle]);
    if (r.erreur) return json({ erreur: r.erreur }, 400);
    Object.assign(lignes, r.lignes);
  }
  if (!Object.keys(lignes).length) return json({ erreur: "Rien à enregistrer." }, 400);
  await env.DB.transaction(async (tx) => {
    for (const [cle, valeur] of Object.entries(lignes)) {
      // RETURNING explicite : reglages_site n'a pas de colonne « id ».
      await tx.prepare(
        `INSERT INTO reglages_site (cle, valeur, maj, maj_par) VALUES (?1, ?2, datetime('now'), ?3)
         ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur, maj = excluded.maj, maj_par = excluded.maj_par
         RETURNING cle`
      ).bind(cle, valeur, String((s && s.pseudo) || "").slice(0, 100)).run();
    }
  });
  caches.delete(env.DB);
  return json({ ok: true, ...(await lister(env)) });
}

// /api/reglages — session déjà vérifiée par l'appelant.
export async function routeReglages(request, env, s) {
  if (!s || !GRADES_REGLAGES.includes(s.grade)) {
    return json({ erreur: "Réservé au Patron, au Co Patron et au Développeur web." }, 403);
  }
  if (request.method === "GET") return json(await lister(env));
  if (request.method === "PUT") return enregistrer(env, request, s);
  return json({ erreur: "Méthode non autorisée." }, 405);
}
