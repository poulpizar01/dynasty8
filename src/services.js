// ============================================================================
// Membres en service — lus dans le salon Discord des prises/fins de service
// ----------------------------------------------------------------------------
// Le bot des services (« Agatha », pied « Dynasty8 Services ») publie un
// message par événement, avec un « ID service » unique :
//   🟢 Service démarré              Employé, Mode, Début, ID service
//   ⚫ Service terminé               Employé, Cause de fin, Durée réelle, Début, Fin, ID service
//   🟣 Service fermé pour inactivité (mêmes champs + Fermé par)
//   🔴 Service terminé en avance     (mêmes champs + Minimum requis, Justification)
// Début et Fin sont des horodatages Discord (<t:1791…:f>).
//
// Le site lit ce salon (API Discord, jeton du bot Roxwood : DISCORD_BOT_TOKEN
// dans le .env ; ID du salon dans l'onglet Paramètres) toutes les minutes,
// à partir du dernier message déjà lu, et tient la table services à jour :
// une ligne par ID service, fin vide tant que la personne est en service.
//
// Cas particuliers :
//   - fin sans début lu   : la ligne est créée depuis le message de fin (son
//                           champ Début), marquée « fin_sans_debut » ;
//   - double début        : une nouvelle prise de service de la même personne
//                           ferme la précédente restée ouverte, à l'heure de
//                           la nouvelle (« debut_en_double ») ;
//   - service jamais fermé: fermé automatiquement N heures après son début
//                           (réglage « services_cloture_heures », 12 par
//                           défaut) ; une vraie fin reçue plus tard la remplace ;
//   - message relu         : ignoré (ID service et message déjà connus).
// Rien n'est deviné : un message sans « ID service » ni titre reconnu est
// compté comme ignoré, jamais interprété.
// ============================================================================

import { nomComplet } from "./rh.js";

export const API_DISCORD = "https://discord.com/api/v10";
const DELAI_DISCORD_MS = 10_000;
export const CLOTURE_PAR_DEFAUT_HEURES = 12;
const PAGES_MAX_PAR_PASSE = 10; // 1 000 messages par minute au plus

const RE_SNOWFLAKE = /^\d{15,21}$/;

export const normaliserTexte = (v) => String(v == null ? "" : v)
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Date JS -> texte UTC « AAAA-MM-JJ HH:MM:SS » (format de toute la base).
export function versTexteUtc(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
const depuisTexteUtc = (t) => new Date(String(t).replace(" ", "T") + "Z");

// « <t:1791477420:f>\n<t:1791477420:R> » -> Date ; null sans horodatage Discord.
export function lireHorodatageDiscord(valeur) {
  const m = String(valeur || "").match(/<t:(\d{9,11})(?::[a-zA-Z])?>/);
  return m ? new Date(Number(m[1]) * 1000) : null;
}

// Identifiant Discord de la personne, lu dans l'adresse de son avatar quand
// le bot met l'avatar du membre en tête de message.
export function discordIdDepuisAvatar(url) {
  const m = String(url || "").match(/\/(?:avatars|users)\/(\d{15,21})\//);
  return m ? m[1] : null;
}

// Un embed -> { type: "debut"|"fin", serviceId, employe, discordId, mode, debut, fin, cause } ou null.
export function lireEmbedService(embed, messageHorodatage) {
  if (!embed || typeof embed !== "object") return null;
  const titre = normaliserTexte(embed.title);
  let type = null;
  if (/^service demarre\b/.test(titre)) type = "debut";
  else if (/^service (termine|ferme)\b/.test(titre)) type = "fin";
  if (!type) return null;

  const champs = new Map();
  for (const f of Array.isArray(embed.fields) ? embed.fields : []) {
    champs.set(normaliserTexte(f && f.name), String((f && f.value) || "").trim());
  }
  const serviceId = (champs.get("id service") || "").replace(/[`*_\s]/g, "");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(serviceId)) return null;

  const employe = (champs.get("employe") || (embed.author && embed.author.name) || "").replace(/[`*_]/g, "").trim();
  const horodatageMessage = messageHorodatage ? new Date(messageHorodatage) : null;
  const debut = lireHorodatageDiscord(champs.get("debut")) || (type === "debut" ? horodatageMessage : null);
  const fin = type === "fin" ? (lireHorodatageDiscord(champs.get("fin")) || horodatageMessage) : null;
  let cause = champs.get("cause de fin") || "";
  if (!cause && type === "fin") cause = /inactivite/.test(titre) ? "Inactivité" : /avance/.test(titre) ? "Fin anticipée" : "Fin normale";
  return {
    type,
    serviceId,
    employe: employe.slice(0, 120),
    discordId: discordIdDepuisAvatar(embed.author && embed.author.icon_url),
    mode: (champs.get("mode") || "").slice(0, 60),
    debut: debut && !isNaN(debut) ? debut : null,
    fin: fin && !isNaN(fin) ? fin : null,
    cause: cause.slice(0, 120),
  };
}

// ---- lecture du salon -------------------------------------------------------

export class ErreurDiscord extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function appelDiscord(jeton, chemin, fetchImpl) {
  let r;
  try {
    r = await fetchImpl(API_DISCORD + chemin, {
      headers: { Authorization: `Bot ${jeton}`, "User-Agent": "Dynasty8Site (services, 1.0)" },
      signal: AbortSignal.timeout(DELAI_DISCORD_MS),
    });
  } catch (e) {
    throw new ErreurDiscord("reseau", "Discord injoignable.");
  }
  if (r.status === 401) throw new ErreurDiscord("jeton", "Jeton du bot refusé par Discord (DISCORD_BOT_TOKEN).", 401);
  if (r.status === 403) throw new ErreurDiscord("acces", "Le bot n'a pas accès à ce salon (droits « Voir le salon » et « Voir les anciens messages »).", 403);
  if (r.status === 404) throw new ErreurDiscord("salon", "Salon introuvable : vérifiez l'ID du salon des services.", 404);
  if (r.status === 429) throw new ErreurDiscord("limite", "Discord demande de ralentir : nouvelle tentative à la prochaine minute.", 429);
  if (!r.ok) throw new ErreurDiscord("discord", `Erreur Discord (HTTP ${r.status}).`, r.status);
  return r.json();
}

const comparerSnowflakes = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

// Messages du salon après `apres` (ou les 100 derniers au premier passage),
// du plus ancien au plus récent.
export async function lireMessagesSalon({ jeton, salonId, apres, fetchImpl = globalThis.fetch }) {
  const messages = [];
  let curseur = apres || null;
  for (let page = 0; page < PAGES_MAX_PAR_PASSE; page++) {
    const parametre = curseur ? `&after=${curseur}` : "";
    const lot = await appelDiscord(jeton, `/channels/${salonId}/messages?limit=100${parametre}`, fetchImpl);
    if (!Array.isArray(lot) || !lot.length) break;
    lot.sort((a, b) => comparerSnowflakes(a.id, b.id));
    messages.push(...lot);
    if (!curseur || lot.length < 100) break; // premier passage : les 100 derniers suffisent
    curseur = lot[lot.length - 1].id;
  }
  return messages;
}

// ---- enregistrement -----------------------------------------------------------

// Fiche RH de la personne : par identifiant Discord, sinon par « Prénom Nom ».
function trouverFiche(employes, evenement) {
  if (evenement.discordId) {
    const parId = employes.find((e) => e.discord_id && String(e.discord_id) === evenement.discordId);
    if (parId) return parId;
  }
  const nom = normaliserTexte(evenement.employe);
  return nom ? employes.find((e) => normaliserTexte(`${e.prenom} ${e.nom}`) === nom) || null : null;
}

// Même personne : même fiche RH, sinon même Discord, sinon même nom affiché.
function memePersonne(ligne, evenement, fiche) {
  if (fiche && ligne.employe_id) return ligne.employe_id === fiche.id;
  if (evenement.discordId && ligne.discord_id) return ligne.discord_id === evenement.discordId;
  return normaliserTexte(ligne.employe_nom) === normaliserTexte(evenement.employe);
}

async function enregistrerEvenement(tx, ev, messageId, employes) {
  const fiche = trouverFiche(employes, ev);
  const existant = await tx.prepare("SELECT * FROM services WHERE service_id = ?1 FOR UPDATE").bind(ev.serviceId).first();

  if (ev.type === "debut") {
    if (existant) return "deja_connu";
    if (!ev.debut) return "ignore";
    const debutTexte = versTexteUtc(ev.debut);
    // Double début : la prise de service précédente de la même personne,
    // jamais fermée, s'arrête à l'heure de la nouvelle.
    const ouverts = (await tx.prepare("SELECT * FROM services WHERE fin IS NULL AND debut < ?1 FOR UPDATE").bind(debutTexte).all()).results || [];
    for (const o of ouverts.filter((o) => memePersonne(o, ev, fiche))) {
      await tx.prepare(
        `UPDATE services SET fin = ?2, cause_fin = 'Nouvelle prise de service sans fin', fin_source = 'doublon',
                anomalie = 'debut_en_double', maj = datetime('now') WHERE id = ?1`
      ).bind(o.id, debutTexte).run();
    }
    await tx.prepare(
      `INSERT INTO services (service_id, employe_nom, discord_id, employe_id, mode, debut, message_debut)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(ev.serviceId, ev.employe, ev.discordId, fiche ? fiche.id : null, ev.mode, debutTexte, messageId).run();
    return "debut";
  }

  // Fin : la vraie fin du bot l'emporte toujours, même sur une clôture automatique.
  if (!ev.fin) return "ignore";
  const finTexte = versTexteUtc(ev.fin);
  if (existant) {
    if (existant.fin_source === "bot") return "deja_connu";
    await tx.prepare(
      `UPDATE services SET fin = ?2, cause_fin = ?3, fin_source = 'bot', message_fin = ?4,
              anomalie = CASE WHEN anomalie = 'cloture_auto' THEN '' ELSE anomalie END, maj = datetime('now')
        WHERE id = ?1`
    ).bind(existant.id, finTexte, ev.cause, messageId).run();
    return "fin";
  }
  // Fin sans début lu (début publié avant la première lecture, message supprimé…).
  await tx.prepare(
    `INSERT INTO services (service_id, employe_nom, discord_id, employe_id, mode, debut, fin, cause_fin, fin_source, message_fin, anomalie)
     VALUES (?1, ?2, ?3, ?4, '', ?5, ?6, ?7, 'bot', ?8, 'fin_sans_debut')`
  ).bind(ev.serviceId, ev.employe, ev.discordId, fiche ? fiche.id : null, versTexteUtc(ev.debut || ev.fin), finTexte, ev.cause, messageId).run();
  return "fin";
}

// Services ouverts depuis plus de `heures` : fermés à début + heures.
export async function cloturerServicesOublies(db, heures, maintenant = new Date()) {
  const limite = versTexteUtc(new Date(maintenant.getTime() - heures * 3600_000));
  const ouverts = (await db.prepare("SELECT id, debut FROM services WHERE fin IS NULL AND debut <= ?1").bind(limite).all()).results || [];
  for (const o of ouverts) {
    const fin = versTexteUtc(new Date(depuisTexteUtc(o.debut).getTime() + heures * 3600_000));
    await db.prepare(
      `UPDATE services SET fin = ?2, cause_fin = ?3, fin_source = 'auto', anomalie = 'cloture_auto', maj = datetime('now')
        WHERE id = ?1 AND fin IS NULL`
    ).bind(o.id, fin, `Clôture automatique (${heures} h sans fin de service)`).run();
  }
  return ouverts.length;
}

export function heuresDeCloture(reglages) {
  const n = Number(reglages && reglages.services_cloture_heures);
  return Number.isInteger(n) && n >= 1 && n <= 72 ? n : CLOTURE_PAR_DEFAUT_HEURES;
}

async function ecrireEtat(db, champs) {
  await db.prepare(
    `INSERT INTO services_etat (id, derniere_lecture, statut, erreur, dernier_message_id, nb_lus, nb_reconnus)
     VALUES (1, datetime('now'), ?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (id) DO UPDATE SET derniere_lecture = excluded.derniere_lecture, statut = excluded.statut, erreur = excluded.erreur,
       dernier_message_id = COALESCE(excluded.dernier_message_id, services_etat.dernier_message_id),
       nb_lus = excluded.nb_lus, nb_reconnus = excluded.nb_reconnus
     RETURNING id`
  ).bind(champs.statut, champs.erreur || "", champs.dernierMessageId || null, champs.nbLus || 0, champs.nbReconnus || 0).first();
}

// Une passe : lit les nouveaux messages, les enregistre, ferme les oubliés.
// env : DB, DISCORD_BOT_TOKEN, REGLAGES_SITE (voir src/reglages.js).
export async function lireServices(env, { fetchImpl = globalThis.fetch, maintenant = new Date() } = {}) {
  const reglages = env.REGLAGES_SITE || {};
  const salonId = String(reglages.services_salon_id || "").trim();
  const jeton = String(env.DISCORD_BOT_TOKEN || "").trim();
  if (!salonId || !jeton) return { statut: "non_regle" };
  if (!RE_SNOWFLAKE.test(salonId)) return { statut: "non_regle" };

  const etat = await env.DB.prepare("SELECT dernier_message_id, salon_id FROM services_etat WHERE id = 1").first();
  // Salon changé dans Paramètres : on repart de ses derniers messages.
  const apres = etat && etat.salon_id === salonId ? etat.dernier_message_id : null;
  if (!etat || etat.salon_id !== salonId) {
    await env.DB.prepare(
      `INSERT INTO services_etat (id, salon_id, dernier_message_id) VALUES (1, ?1, NULL)
       ON CONFLICT (id) DO UPDATE SET salon_id = excluded.salon_id, dernier_message_id = NULL RETURNING id`
    ).bind(salonId).first();
  }

  let messages;
  try {
    messages = await lireMessagesSalon({ jeton, salonId, apres, fetchImpl });
  } catch (e) {
    if (!(e instanceof ErreurDiscord)) throw e;
    await ecrireEtat(env.DB, { statut: "erreur", erreur: e.message });
    return { statut: "erreur", erreur: e.message, code: e.code };
  }

  const employes = (await env.DB.prepare("SELECT id, prenom, nom, discord_id FROM employes").all()).results || [];
  let reconnus = 0;
  for (const message of messages) {
    // Seuls les bots et webhooks publient des messages à embeds : un membre
    // ne peut pas imiter une prise de service en écrivant dans le salon.
    if (!message.author || !(message.author.bot || message.webhook_id)) continue;
    for (const embed of message.embeds || []) {
      const ev = lireEmbedService(embed, message.timestamp);
      if (!ev) continue;
      const resultat = await env.DB.transaction((tx) => enregistrerEvenement(tx, ev, message.id, employes));
      if (resultat === "debut" || resultat === "fin") reconnus++;
    }
  }
  const fermes = await cloturerServicesOublies(env.DB, heuresDeCloture(reglages), maintenant);
  const dernier = messages.length ? messages[messages.length - 1].id : null;
  await ecrireEtat(env.DB, { statut: "ok", dernierMessageId: dernier, nbLus: messages.length, nbReconnus: reconnus });
  return { statut: "ok", lus: messages.length, reconnus, fermes };
}

// ---- API ----------------------------------------------------------------------

function json(donnees, status = 200) {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// GET /api/services/en-cours — tout membre connecté : qui est en service, depuis quand.
export async function servicesEnCours(env) {
  const r = await env.DB.prepare(
    `SELECT s.employe_nom, s.debut, s.mode, e.prenom, e.nom, e.discord_pseudo, e.id_employe
       FROM services s LEFT JOIN employes e ON e.id = s.employe_id
      WHERE s.fin IS NULL ORDER BY s.debut ASC`
  ).all();
  const regle = !!(env.REGLAGES_SITE && env.REGLAGES_SITE.services_salon_id && env.DISCORD_BOT_TOKEN);
  return json({
    regle,
    en_service: (r.results || []).map((l) => ({
      nom: l.prenom || l.nom ? nomComplet(l) : l.employe_nom,
      depuis: l.debut,
      mode: l.mode,
    })),
  });
}

// GET /api/services/etat — Paramètres : dernière lecture, erreur, anomalies récentes.
export async function servicesEtat(env) {
  const [etat, anomalies, ouverts] = await Promise.all([
    env.DB.prepare("SELECT derniere_lecture, statut, erreur, nb_lus, nb_reconnus FROM services_etat WHERE id = 1").first(),
    env.DB.prepare(
      `SELECT employe_nom, debut, fin, cause_fin, anomalie FROM services
        WHERE anomalie <> '' ORDER BY maj DESC, id DESC LIMIT 10`
    ).all(),
    env.DB.prepare("SELECT COUNT(*)::int AS n FROM services WHERE fin IS NULL").first(),
  ]);
  return json({
    jeton_present: !!env.DISCORD_BOT_TOKEN,
    salon_regle: !!(env.REGLAGES_SITE && env.REGLAGES_SITE.services_salon_id),
    cloture_heures: heuresDeCloture(env.REGLAGES_SITE),
    etat: etat || null,
    en_service: ouverts ? Number(ouverts.n) : 0,
    anomalies: anomalies.results || [],
  });
}
