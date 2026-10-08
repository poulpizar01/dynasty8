// ============================================================================
// Agenda de l'espace agents : visibilité par rôle Discord, événements « Perso »
// envoyés dans le ticket de la personne concernée
// ----------------------------------------------------------------------------
// Visible par :
//   - perso     : le créateur et la personne choisie. Pour soi-même, c'est
//                 une note privée (comme avant). Pour quelqu'un d'autre : son
//                 ID Discord est lu dans sa fiche RH, le ticket qu'elle a
//                 ouvert (Ticket Tool, catégories réglées dans Paramètres) est
//                 retrouvé et l'événement y est posté par le bot Roxwood ;
//                 sans ticket, l'événement n'est PAS créé et le créateur le sait.
//   - patrons   : membres ayant l'un des rôles Discord « Patrons » (Paramètres)
//   - direction : membres ayant l'un des rôles Discord « Direction »
//   - tous      : membres ayant le rôle Discord « Tous »
// Le créateur voit toujours ses propres événements.
//
// Les rôles Discord de chacun sont relus à chaque connexion Discord
// (autorisation « guilds.members.read », serveur DISCORD_GUILD_ID du .env) et
// gardés dans membres.discord_roles.
//
// Peut créer chaque visibilité : les rôles réglés dans Paramètres, plus
// toujours Patron, Co Patron et Développeur web (ceux qui règlent ces rôles :
// personne n'est bloqué avant que les rôles soient saisis). « Perso » pour
// soi-même reste ouvert à tous.
//
// Les heures sont celles de Paris (heure d'été comprise) : c'est l'heure de
// l'agence, et celle utilisée pour l'horodatage du message Discord.
// ============================================================================

import { GRADES_ADMINISTRATEURS } from "./grades.js";
import { API_DISCORD } from "./services.js";
import { nomComplet } from "./rh.js";

export const VISIBILITES = ["perso", "patrons", "direction", "tous"];
const PARTAGEES = ["patrons", "direction", "tous"];
const LIBELLES = { perso: "Perso", patrons: "Patrons", direction: "Direction", tous: "Tous" };
const DELAI_DISCORD_MS = 10_000;

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

function json(donnees, status = 200) {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
const texte = (v, max) => String(v == null ? "" : v).slice(0, max);

// « 123…, 456… » (espaces, virgules, retours à la ligne) -> ["123…", "456…"].
export function lireIdsDiscord(valeur) {
  return [...new Set(String(valeur || "").split(/[\s,;]+/).filter((x) => /^\d{15,21}$/.test(x)))];
}

export function lireRoles(json) {
  try {
    const r = JSON.parse(json || "[]");
    return Array.isArray(r) ? r.filter((x) => /^\d{15,21}$/.test(String(x))).map(String) : [];
  } catch {
    return [];
  }
}

// Ce que `membre` ({ grade, roles }) peut voir et créer, d'après les réglages.
export function droitsAgenda(membre, reglages = {}) {
  const roles = new Set(membre.roles || []);
  const aUnRole = (cle) => lireIdsDiscord(reglages[cle]).some((r) => roles.has(r));
  const admin = GRADES_ADMINISTRATEURS.includes(membre.grade);
  const voit = new Set(["perso"]);
  if (aUnRole("agenda_roles_patrons")) voit.add("patrons");
  if (aUnRole("agenda_roles_direction")) voit.add("direction");
  if (aUnRole("agenda_role_tous")) voit.add("tous");
  const cree = new Set(["perso"]);
  for (const v of PARTAGEES) if (admin || aUnRole(`agenda_createurs_${v}`)) cree.add(v);
  return { voit, cree, persoAutrui: admin || aUnRole("agenda_createurs_perso") };
}

// « 2026-10-08 », « 14:30 » (heure de Paris) -> Date (instant réel).
export function parisVersDate(jour, heure) {
  const [a, mo, j] = jour.split("-").map(Number);
  const [h, mi] = heure.split(":").map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, mi);
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const decalage = (instant) => {
    const p = Object.fromEntries(format.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - instant;
  };
  let instant = naif - decalage(naif);
  instant = naif - decalage(instant); // second passage : changement d'heure
  return new Date(instant);
}

function validerEvenement(b) {
  if (!b || typeof b !== "object") return "Formulaire invalide.";
  if (!texte(b.titre, 80).trim()) return "Le titre de l'événement est obligatoire.";
  if (!RE_DATE.test(String(b.jour || ""))) return "Date invalide.";
  if (!RE_HEURE.test(String(b.heure_debut || ""))) return "Heure de début invalide.";
  if (!RE_HEURE.test(String(b.heure_fin || ""))) return "Heure de fin invalide.";
  if (String(b.heure_fin) <= String(b.heure_debut)) return "L'heure de fin doit être après l'heure de début.";
  if (String(b.notes || "").length > 500) return "Le descriptif est trop long (500 caractères maximum).";
  if (b.visibilite !== undefined && !VISIBILITES.includes(b.visibilite)) return "Visibilité inconnue.";
  return null;
}

// ---- ticket Discord de la personne ---------------------------------------------

export class ErreurTicket extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function discord(env, methode, chemin, corps, fetchImpl) {
  let r;
  try {
    r = await fetchImpl(API_DISCORD + chemin, {
      method: methode,
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json", "User-Agent": "Dynasty8Site (agenda, 1.0)" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_DISCORD_MS),
    });
  } catch {
    throw new ErreurTicket(502, "Discord ne répond pas : l'événement n'a pas été créé. Réessayez dans un instant.");
  }
  if (r.status === 401) throw new ErreurTicket(503, "Le jeton du bot Discord (DISCORD_BOT_TOKEN) est refusé : l'événement n'a pas été créé. Prévenez le Développeur web.");
  if (r.status === 403) throw new ErreurTicket(502, "Le bot n'a pas le droit d'écrire dans ce ticket (« Voir le salon » et « Envoyer des messages ») : l'événement n'a pas été créé.");
  if (r.status === 429) throw new ErreurTicket(503, "Discord demande de ralentir : réessayez dans un instant.");
  if (!r.ok) throw new ErreurTicket(502, `Discord a refusé la demande (HTTP ${r.status}) : l'événement n'a pas été créé.`);
  return r.json();
}

// Le ticket le plus récent ouvert par `discordId` : salon texte d'une des
// catégories réglées, où la personne a une permission à son nom (c'est ainsi
// que Ticket Tool donne accès au ticket à celui qui l'a ouvert).
export async function trouverTicket(env, discordId, categories, fetchImpl = globalThis.fetch) {
  const salons = await discord(env, "GET", `/guilds/${env.DISCORD_GUILD_ID}/channels`, undefined, fetchImpl);
  const tickets = (Array.isArray(salons) ? salons : []).filter((c) =>
    c && c.type === 0 && categories.includes(String(c.parent_id || ""))
    && (c.permission_overwrites || []).some((o) => String(o.type) === "1" && String(o.id) === discordId)
  );
  tickets.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
  return tickets[0] || null;
}

async function posterEvenement(env, { salonId, discordId, evenement, auteur }, fetchImpl) {
  const debut = Math.floor(parisVersDate(evenement.jour, evenement.heure_debut).getTime() / 1000);
  const fin = Math.floor(parisVersDate(evenement.jour, evenement.heure_fin).getTime() / 1000);
  const message = await discord(env, "POST", `/channels/${salonId}/messages`, {
    content: `<@${discordId}>`,
    allowed_mentions: { users: [discordId] },
    embeds: [{
      title: `📅 ${evenement.titre}`.slice(0, 256),
      description: evenement.notes ? evenement.notes.slice(0, 2000) : undefined,
      color: 0xc9a55c,
      fields: [
        { name: "Début", value: `<t:${debut}:F>`, inline: true },
        { name: "Fin", value: `<t:${fin}:t>`, inline: true },
      ],
      footer: { text: `Agenda Dynasty 8 — ajouté par ${auteur}`.slice(0, 2048) },
    }],
  }, fetchImpl);
  return message && message.id ? String(message.id) : null;
}

// ---- route /api/agenda ------------------------------------------------------------

async function lireMembre(env, s) {
  const m = await env.DB.prepare("SELECT id, pseudo, grade, discord_id, discord_roles FROM membres WHERE id = ?1").bind(s.id).first();
  return { ...m, roles: lireRoles(m && m.discord_roles) };
}

function versClient(e, moi, droits) {
  const auteurOuAdmin = e.membre_id === moi.id || (e.visibilite !== "perso" && GRADES_ADMINISTRATEURS.includes(moi.grade));
  return {
    id: e.id, titre: e.titre, jour: e.jour, heure_debut: e.heure_debut, heure_fin: e.heure_fin, notes: e.notes || "",
    visibilite: e.visibilite, visibilite_libelle: LIBELLES[e.visibilite] || e.visibilite,
    auteur: e.auteur_pseudo || "", mien: e.membre_id === moi.id,
    pour: e.visibilite === "perso" && e.cible_nom ? e.cible_nom : "",
    envoye_discord: !!e.discord_message_id,
    // Modifiable : par son auteur (dans la limite de ce qu'il peut créer), et
    // les événements partagés aussi par Patron, Co Patron et Développeur web.
    modifiable: auteurOuAdmin && (e.visibilite === "perso" || droits.cree.has(e.visibilite) || GRADES_ADMINISTRATEURS.includes(moi.grade)),
  };
}

// Fiches RH proposées pour un événement « Perso » destiné à quelqu'un d'autre.
async function listerPersonnes(env) {
  const r = await env.DB.prepare(
    "SELECT id, prenom, nom, discord_pseudo, id_employe, discord_id FROM employes WHERE statut = 'actif' ORDER BY prenom, nom"
  ).all();
  return (r.results || []).map((e) => ({ id: e.id, nom: nomComplet(e), discord: !!e.discord_id }));
}

export async function routeAgenda(request, url, env, s, { fetchImpl = globalThis.fetch } = {}) {
  const moi = await lireMembre(env, s);
  const reglages = env.REGLAGES_SITE || {};
  const droits = droitsAgenda(moi, reglages);
  const m = request.method;
  const id = url.searchParams.get("id");

  if (url.pathname === "/api/agenda/personnes") {
    if (m !== "GET") return json({ erreur: "Méthode non gérée." }, 405);
    if (!droits.persoAutrui) return json({ erreur: "Votre rôle ne permet pas de créer un événement pour quelqu'un d'autre." }, 403);
    return json({ personnes: await listerPersonnes(env) });
  }

  if (m === "GET") {
    const debut = url.searchParams.get("debut");
    const fin = url.searchParams.get("fin");
    if (!RE_DATE.test(debut || "") || !RE_DATE.test(fin || "")) return json({ erreur: "Plage de dates invalide." }, 400);
    const partagees = PARTAGEES.filter((v) => droits.voit.has(v));
    const r = await env.DB.prepare(
      `SELECT e.*, a.pseudo AS auteur_pseudo FROM evenements_agenda e LEFT JOIN membres a ON a.id = e.membre_id
        WHERE e.jour >= ?2 AND e.jour <= ?3 AND (
          e.membre_id = ?1
          OR (e.visibilite = 'perso' AND e.cible_discord_id IS NOT NULL AND e.cible_discord_id = ?4)
          OR e.visibilite = ANY(?5::text[])
        )
        ORDER BY e.jour, e.heure_debut`
    ).bind(moi.id, debut, fin, moi.discord_id || "", partagees).all();
    return json({
      evenements: (r.results || []).map((e) => versClient(e, moi, droits)),
      droits: { cree: VISIBILITES.filter((v) => droits.cree.has(v)), perso_autrui: droits.persoAutrui },
    });
  }

  if (m === "POST") {
    const b = await request.json().catch(() => null);
    const erreur = validerEvenement(b);
    if (erreur) return json({ erreur }, 400);
    const visibilite = b.visibilite || "perso";
    if (!droits.cree.has(visibilite)) return json({ erreur: `Votre rôle ne permet pas de créer un événement « ${LIBELLES[visibilite]} ».` }, 403);
    const evenement = {
      titre: texte(b.titre, 80).trim(), jour: b.jour, heure_debut: b.heure_debut, heure_fin: b.heure_fin, notes: texte(b.notes, 500).trim(),
    };

    let cible = { employeId: null, discordId: null, nom: "", salonId: null, messageId: null };
    const cibleId = b.pour_employe_id == null || b.pour_employe_id === "" ? null : Number(b.pour_employe_id);
    if (visibilite === "perso" && cibleId !== null) {
      if (!droits.persoAutrui) return json({ erreur: "Votre rôle ne permet pas de créer un événement pour quelqu'un d'autre." }, 403);
      const fiche = Number.isInteger(cibleId)
        ? await env.DB.prepare("SELECT id, prenom, nom, discord_pseudo, id_employe, discord_id FROM employes WHERE id = ?1").bind(cibleId).first()
        : null;
      if (!fiche) return json({ erreur: "Personne introuvable dans les fiches RH." }, 404);
      const nom = nomComplet(fiche);
      if (!fiche.discord_id) return json({ erreur: `La fiche RH de ${nom} n'a pas d'ID Discord : impossible de retrouver son ticket. Complétez la fiche dans Ressources humaines.` }, 409);
      if (String(fiche.discord_id) !== String(moi.discord_id || "")) {
        const categories = lireIdsDiscord(reglages.agenda_categories_tickets);
        if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
          return json({ erreur: "Envoi dans les tickets non configuré sur le serveur (DISCORD_BOT_TOKEN et DISCORD_GUILD_ID du .env) : l'événement n'a pas été créé." }, 503);
        }
        if (!categories.length) {
          return json({ erreur: "Aucune catégorie de tickets n'est réglée dans Paramètres → Agenda : l'événement n'a pas été créé." }, 503);
        }
        try {
          const ticket = await trouverTicket(env, String(fiche.discord_id), categories, fetchImpl);
          if (!ticket) {
            return json({ erreur: `Aucun ticket ouvert par ${nom} n'a été trouvé (catégories de tickets réglées dans Paramètres). L'événement n'a pas été créé : vérifiez que ${nom} a bien un ticket ouvert.` }, 409);
          }
          cible.salonId = String(ticket.id);
          cible.messageId = await posterEvenement(env, { salonId: cible.salonId, discordId: String(fiche.discord_id), evenement, auteur: moi.pseudo }, fetchImpl);
        } catch (e) {
          if (e instanceof ErreurTicket) return json({ erreur: e.message }, e.status);
          throw e;
        }
      }
      cible = { ...cible, employeId: fiche.id, discordId: String(fiche.discord_id), nom };
    }

    const r = await env.DB.prepare(
      `INSERT INTO evenements_agenda (membre_id, titre, jour, heure_debut, heure_fin, notes, visibilite,
         cible_employe_id, cible_discord_id, cible_nom, discord_salon_id, discord_message_id, cree_le, maj)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'), datetime('now'))`
    ).bind(moi.id, evenement.titre, evenement.jour, evenement.heure_debut, evenement.heure_fin, evenement.notes, visibilite,
      cible.employeId, cible.discordId, cible.nom, cible.salonId, cible.messageId).run();
    return json({ id: r.meta.last_row_id, envoye_discord: !!cible.messageId, ticket: cible.salonId });
  }

  if (m === "PUT" || m === "DELETE") {
    if (!id || !/^\d+$/.test(id)) return json({ erreur: "Identifiant manquant." }, 400);
    const e = await env.DB.prepare("SELECT * FROM evenements_agenda WHERE id = ?1").bind(Number(id)).first();
    if (!e) return json({ erreur: "Introuvable." }, 404);
    if (!versClient(e, moi, droits).modifiable) return json({ erreur: "Vous ne pouvez pas modifier cet événement." }, 403);
    if (m === "DELETE") {
      await env.DB.prepare("DELETE FROM evenements_agenda WHERE id = ?1").bind(e.id).run();
      return json({ ok: true });
    }
    const b = await request.json().catch(() => null);
    const erreur = validerEvenement(b);
    if (erreur) return json({ erreur }, 400);
    // La personne d'un événement « Perso » ne change pas (le message est déjà
    // dans son ticket) ; la visibilité, seulement vers ce qu'on peut créer.
    let visibilite = b.visibilite || e.visibilite;
    if (e.cible_employe_id) visibilite = "perso";
    if (visibilite !== e.visibilite && !droits.cree.has(visibilite)) {
      return json({ erreur: `Votre rôle ne permet pas de créer un événement « ${LIBELLES[visibilite]} ».` }, 403);
    }
    await env.DB.prepare(
      `UPDATE evenements_agenda SET titre = ?2, jour = ?3, heure_debut = ?4, heure_fin = ?5, notes = ?6, visibilite = ?7, maj = datetime('now')
        WHERE id = ?1`
    ).bind(e.id, texte(b.titre, 80).trim(), b.jour, b.heure_debut, b.heure_fin, texte(b.notes, 500).trim(), visibilite).run();
    return json({ ok: true });
  }

  return json({ erreur: "Méthode non gérée." }, 405);
}
