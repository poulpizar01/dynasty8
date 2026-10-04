// ============================================================================
// Dynasty 8 — Ressources humaines : la fiche employé, source de vérité
// ----------------------------------------------------------------------------
// Table employes (voir schema.postgres.sql). Les autres modules ne gardent que
// la clé de la fiche (employe_id) et lisent ici l'identité de l'employé :
//   - ventes (stats_logs_ventes.employe_id, rattachées dès leur arrivée) ;
//   - DOT et statistiques (calculs par employé, identité lue dans RH) ;
//   - tableur de la Direction (sync_sheet_agents / archives .employe_id).
// Une fiche n'est jamais supprimée : un départ la passe « inactif », et son
// historique (ventes, DOT, archives) reste rattaché.
//
// Permissions (vérifiées ici, côté serveur — l'interface ne fait que suivre) :
//   voir, creer, modifier, desactiver, reactiver, sensible (téléphone, RIB).
// Réglables par grade dans l'onglet RH (table rh_permissions). Patron,
// Co Patron et Développeur web les ont toujours toutes, et sont les seuls à
// pouvoir les régler : personne ne peut s'enlever l'accès par erreur.
// ============================================================================

import { createHash, timingSafeEqual } from "node:crypto";
import { normaliserPseudo, normaliserTexte } from "./stats-calc.js";

export const PERMISSIONS_RH = ["voir", "creer", "modifier", "desactiver", "reactiver", "sensible"];
export const GRADES_ADMIN_RH = ["Patron", "Co Patron", "Développeur web"];

// Les grades de l'agence, dans l'ordre d'affichage (mêmes noms que les comptes du site).
export const GRADES_EMPLOYES = [
  "Patron", "Co Patron", "Manager", "DRH", "Secrétaire de Direction", "Développeur web",
  "Référent Immobilier", "Agent Expert", "Agent", "Agent Novice", "Stagiaire",
];

function json(donnees, status = 200) {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ---- permissions -------------------------------------------------------------

// Permissions RH du compte connecté (un Set), plus « parametrer » pour les
// grades qui règlent la matrice.
export async function permissionsRh(env, s) {
  if (!s) return new Set();
  if (GRADES_ADMIN_RH.includes(s.grade)) return new Set([...PERMISSIONS_RH, "parametrer"]);
  const r = await env.DB.prepare("SELECT permission FROM rh_permissions WHERE grade = ?1").bind(s.grade || "").all();
  return new Set((r.results || []).map((p) => p.permission));
}

// ---- lecture d'une fiche ------------------------------------------------------

export function nomComplet(e) {
  const nom = `${e.prenom || ""} ${e.nom || ""}`.trim();
  return nom || e.discord_pseudo || e.id_employe;
}

// Fiche telle qu'envoyée au navigateur : téléphone et RIB n'y figurent QUE pour
// un compte qui a la permission « sensible » — jamais masqués côté interface
// seulement.
export function fichePublique(e, perms) {
  const fiche = {
    id: e.id,
    idEmploye: e.id_employe,
    idProvisoire: !!e.id_provisoire,
    prenom: e.prenom,
    nom: e.nom,
    nomComplet: nomComplet(e),
    discordId: e.discord_id || "",
    discordPseudo: e.discord_pseudo || "",
    grade: e.grade,
    statut: e.statut,
    dateArrivee: e.date_arrivee || "",
    dateDepart: e.date_depart || "",
    aCompleter: !e.prenom || !e.nom || !!e.id_provisoire,
  };
  if (perms.has("sensible")) {
    fiche.telephone = e.telephone || "";
    fiche.rib = e.rib || "";
  }
  return fiche;
}

// ---- validation ---------------------------------------------------------------

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
function dateValide(v) {
  if (!RE_DATE.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const texte = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

// Champs envoyés par le formulaire -> valeurs propres, ou une erreur.
// `existante` : la fiche actuelle (modification) ; absente à la création.
function lireChamps(b, existante) {
  const c = {};
  const pris = (cle) => b[cle] !== undefined;
  if (!existante || pris("idEmploye")) {
    c.id_employe = texte(b.idEmploye, 40);
    if (!c.id_employe) return { erreur: "L'ID employé est obligatoire." };
    if (!/^[\p{L}\p{N}_.\- ]+$/u.test(c.id_employe)) return { erreur: "L'ID employé ne peut contenir que des lettres, chiffres, espaces, points, tirets et soulignés." };
  }
  for (const [cle, colonne, nomChamp] of [["prenom", "prenom", "Le prénom"], ["nom", "nom", "Le nom"]]) {
    if (!existante || pris(cle)) {
      c[colonne] = texte(b[cle], 60);
      if (!c[colonne]) return { erreur: `${nomChamp} est obligatoire.` };
    }
  }
  if (!existante || pris("grade")) {
    c.grade = texte(b.grade, 60);
    if (!GRADES_EMPLOYES.includes(c.grade)) return { erreur: "Grade invalide." };
  }
  if (pris("telephone")) c.telephone = texte(b.telephone, 30);
  if (pris("rib")) c.rib = texte(b.rib, 60);
  if (pris("discordId")) {
    const id = texte(b.discordId, 30);
    if (id && !/^\d{15,22}$/.test(id)) return { erreur: "L'ID Discord est un nombre de 15 à 22 chiffres (clic droit sur le profil → Copier l'identifiant)." };
    c.discord_id = id || null;
  }
  if (pris("discordPseudo")) {
    c.discord_pseudo = texte(b.discordPseudo, 100);
    c.discord_pseudo_normalise = c.discord_pseudo ? normaliserPseudo(c.discord_pseudo) : null;
  }
  for (const [cle, colonne, nomChamp] of [["dateArrivee", "date_arrivee", "La date d'arrivée"], ["dateDepart", "date_depart", "La date de départ"]]) {
    if (pris(cle)) {
      const v = texte(b[cle], 10);
      if (v && !dateValide(v)) return { erreur: `${nomChamp} doit être une date valide (AAAA-MM-JJ).` };
      c[colonne] = v;
    }
  }
  if (!existante && !c.date_arrivee) return { erreur: "La date d'arrivée est obligatoire." };
  if (pris("statut")) {
    if (!["actif", "inactif"].includes(b.statut)) return { erreur: "Statut invalide." };
    c.statut = b.statut;
  }
  const arrivee = c.date_arrivee ?? (existante && existante.date_arrivee);
  const depart = c.date_depart ?? (existante && existante.date_depart);
  if (arrivee && depart && depart < arrivee) return { erreur: "La date de départ ne peut pas précéder la date d'arrivée." };
  return { champs: c };
}

// Unicité : ID employé (sans tenir compte des majuscules), ID Discord, pseudo.
async function conflit(env, c, idExclu) {
  const verifs = [
    [c.id_employe, "SELECT id FROM employes WHERE lower(id_employe) = lower(?1) AND id != ?2", "Cet ID employé est déjà attribué."],
    [c.discord_id, "SELECT id FROM employes WHERE discord_id = ?1 AND id != ?2", "Cet ID Discord est déjà sur une autre fiche."],
    [c.discord_pseudo_normalise, "SELECT id FROM employes WHERE discord_pseudo_normalise = ?1 AND id != ?2", "Ce pseudo Discord est déjà sur une autre fiche."],
  ];
  for (const [valeur, sql, message] of verifs) {
    if (!valeur) continue;
    if (await env.DB.prepare(sql).bind(valeur, idExclu || 0).first()) return message;
  }
  return null;
}

// ---- rattachement des données des autres modules ------------------------------

// Employé désigné par une vente : l'ID Discord fait foi s'il est fourni (un
// pseudo peut changer), sinon le pseudo enregistré sur la fiche. Jamais le nom.
export async function trouverEmploye(env, { discordId, pseudo }) {
  const id = String(discordId == null ? "" : discordId).trim();
  if (id) {
    const e = await env.DB.prepare("SELECT * FROM employes WHERE discord_id = ?1").bind(id).first();
    if (e) return e;
  }
  const p = normaliserPseudo(pseudo);
  if (!p) return null;
  return env.DB.prepare("SELECT * FROM employes WHERE discord_pseudo_normalise = ?1").bind(p).first();
}

// Une fiche vient de recevoir (ou de changer) son pseudo Discord : ses ventes
// encore sans employé lui sont rattachées tout de suite. Une vente déjà
// rattachée ne change jamais d'employé.
async function rattacherVentes(env, e) {
  if (!e.discord_pseudo_normalise) return;
  await env.DB.prepare(
    "UPDATE stats_logs_ventes SET employe_id = ?1 WHERE employe_id IS NULL AND lower(btrim(identite)) = ?2"
  ).bind(e.id, e.discord_pseudo_normalise).run();
  await env.DB.prepare(
    "UPDATE stats_logs_ventes SET formateur_employe_id = ?1 WHERE formateur_employe_id IS NULL AND lower(btrim(formateur)) = ?2"
  ).bind(e.id, e.discord_pseudo_normalise).run();
}

// ---- routes /api/rh/* ---------------------------------------------------------

// Ordre d'affichage : actifs d'abord, puis par grade, puis par nom.
function ordreEmployes(a, b) {
  const rang = (g) => { const i = GRADES_EMPLOYES.indexOf(g); return i === -1 ? GRADES_EMPLOYES.length : i; };
  return (a.statut === b.statut ? 0 : a.statut === "actif" ? -1 : 1)
    || rang(a.grade) - rang(b.grade)
    || a.nomComplet.localeCompare(b.nomComplet, "fr");
}

async function lister(env, perms) {
  const r = await env.DB.prepare("SELECT * FROM employes").all();
  const employes = (r.results || []).map((e) => fichePublique(e, perms)).sort(ordreEmployes);
  const actifs = employes.filter((e) => e.statut === "actif");
  const parGrade = {};
  for (const e of actifs) parGrade[e.grade] = (parGrade[e.grade] || 0) + 1;
  return {
    employes,
    effectif: {
      actifs: actifs.length,
      inactifs: employes.length - actifs.length,
      parGrade: GRADES_EMPLOYES.filter((g) => parGrade[g]).map((g) => ({ grade: g, nombre: parGrade[g] })),
    },
  };
}

// Fiche détaillée : identité + ce que les autres modules ont rattaché à
// l'employé (lecture seule, données propres à chaque module).
async function detail(env, id, perms) {
  const e = await env.DB.prepare("SELECT * FROM employes WHERE id = ?1").bind(id).first();
  if (!e) return null;
  const [ventes, tableur, archives, compte] = await Promise.all([
    env.DB.prepare(
      `SELECT count(*) AS lignes, min(semaine) AS premiere, max(cree_le) AS derniere
         FROM stats_logs_ventes WHERE employe_id = ?1`
    ).bind(id).first(),
    env.DB.prepare("SELECT nb_ventes, nb_locations FROM sync_sheet_agents WHERE employe_id = ?1").bind(id).first(),
    env.DB.prepare("SELECT count(*) AS semaines FROM tableur_archives_lignes WHERE employe_id = ?1").bind(id).first(),
    e.discord_id
      ? env.DB.prepare("SELECT pseudo, grade, statut FROM membres WHERE discord_id = ?1").bind(e.discord_id).first()
      : null,
  ]);
  return {
    ...fichePublique(e, perms),
    historique: {
      ventesEnregistrees: Number(ventes && ventes.lignes) || 0,
      derniereVente: (ventes && ventes.derniere) || null,
      tableurSemaineEnCours: tableur ? { ventes: tableur.nb_ventes, locations: tableur.nb_locations } : null,
      semainesArchivees: Number(archives && archives.semaines) || 0,
    },
    compteDuSite: compte || null,
  };
}

async function creer(env, b) {
  if (!b || typeof b !== "object") return json({ erreur: "Requête illisible." }, 400);
  const { champs, erreur } = lireChamps(b, null);
  if (erreur) return json({ erreur }, 400);
  champs.statut = champs.statut || "actif";
  const doublon = await conflit(env, champs, 0);
  if (doublon) return json({ erreur: doublon }, 409);
  const colonnes = Object.keys(champs);
  const r = await env.DB.prepare(
    `INSERT INTO employes (${colonnes.join(", ")}) VALUES (${colonnes.map((_, i) => `?${i + 1}`).join(", ")}) RETURNING *`
  ).bind(...colonnes.map((k) => champs[k])).first();
  await rattacherVentes(env, r);
  return json({ id: r.id }, 201);
}

async function modifier(env, request, id, perms) {
  const existante = await env.DB.prepare("SELECT * FROM employes WHERE id = ?1").bind(id).first();
  if (!existante) return json({ erreur: "Employé introuvable." }, 404);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return json({ erreur: "Requête illisible." }, 400);
  // Données sensibles : modifiables seulement avec la permission qui permet de les voir.
  if ((b.telephone !== undefined || b.rib !== undefined) && !perms.has("sensible")) {
    return json({ erreur: "Vous n'avez pas accès au téléphone ni au RIB." }, 403);
  }
  // Changer le statut passe par les permissions de désactivation / réactivation.
  if (b.statut !== undefined && b.statut !== existante.statut) {
    const requise = b.statut === "inactif" ? "desactiver" : "reactiver";
    if (!perms.has(requise)) return json({ erreur: "Vous n'avez pas le droit de changer le statut de cet employé." }, 403);
  }
  const { champs, erreur } = lireChamps(b, existante);
  if (erreur) return json({ erreur }, 400);
  if (champs.id_employe && champs.id_employe !== existante.id_employe) champs.id_provisoire = 0;
  const doublon = await conflit(env, champs, id);
  if (doublon) return json({ erreur: doublon }, 409);
  const colonnes = Object.keys(champs);
  if (!colonnes.length) return json({ erreur: "Rien à modifier." }, 400);
  const maj = await env.DB.prepare(
    `UPDATE employes SET ${colonnes.map((k, i) => `${k} = ?${i + 2}`).join(", ")}, maj = datetime('now')
      WHERE id = ?1 RETURNING *`
  ).bind(id, ...colonnes.map((k) => champs[k])).first();
  await rattacherVentes(env, maj);
  return json({ ok: true });
}

// Départ : statut inactif + date de départ (aujourd'hui si elle n'est pas
// donnée). Réactivation : statut actif, date de départ effacée. Rien d'autre
// ne change : l'historique reste rattaché à la fiche.
async function changerStatut(env, request, id, statut) {
  const e = await env.DB.prepare("SELECT id, statut, date_arrivee FROM employes WHERE id = ?1").bind(id).first();
  if (!e) return json({ erreur: "Employé introuvable." }, 404);
  if (e.statut === statut) return json({ ok: true, inchange: true });
  let dateDepart = "";
  if (statut === "inactif") {
    const b = await request.json().catch(() => ({}));
    dateDepart = texte(b && b.dateDepart, 10) || new Date().toISOString().slice(0, 10);
    if (!dateValide(dateDepart)) return json({ erreur: "La date de départ doit être une date valide (AAAA-MM-JJ)." }, 400);
    if (e.date_arrivee && dateDepart < e.date_arrivee) return json({ erreur: "La date de départ ne peut pas précéder la date d'arrivée." }, 400);
  }
  await env.DB.prepare("UPDATE employes SET statut = ?2, date_depart = ?3, maj = datetime('now') WHERE id = ?1")
    .bind(id, statut, dateDepart).run();
  return json({ ok: true });
}

async function lirePermissions(env) {
  const r = await env.DB.prepare("SELECT grade, permission FROM rh_permissions").all();
  const parGrade = {};
  for (const { grade, permission } of r.results || []) (parGrade[grade] ||= []).push(permission);
  return {
    permissions: PERMISSIONS_RH,
    gradesAdmin: GRADES_ADMIN_RH,
    grades: GRADES_EMPLOYES.filter((g) => !GRADES_ADMIN_RH.includes(g)).map((g) => ({ grade: g, permissions: parGrade[g] || [] })),
  };
}

// Remplace la matrice d'un grade. Les grades administrateurs ne se règlent pas.
async function reglerPermissions(env, request) {
  const b = await request.json().catch(() => null);
  const grade = b && String(b.grade || "");
  if (!GRADES_EMPLOYES.includes(grade) || GRADES_ADMIN_RH.includes(grade)) return json({ erreur: "Grade non réglable." }, 400);
  const voulues = Array.isArray(b.permissions) ? b.permissions.filter((p) => PERMISSIONS_RH.includes(p)) : null;
  if (!voulues) return json({ erreur: "Liste de permissions invalide." }, 400);
  // Toute permission suppose de pouvoir consulter les fiches.
  if (voulues.length && !voulues.includes("voir")) voulues.push("voir");
  await env.DB.transaction(async (tx) => {
    await tx.prepare("DELETE FROM rh_permissions WHERE grade = ?1").bind(grade).run();
    // RETURNING explicite : rh_permissions n'a pas de colonne « id », que
    // l'adaptateur demanderait sinon.
    for (const p of voulues) {
      await tx.prepare("INSERT INTO rh_permissions (grade, permission) VALUES (?1, ?2) RETURNING grade").bind(grade, p).run();
    }
  });
  return json({ ok: true, permissions: voulues });
}

// Ce qui, dans les autres modules, n'est rattaché à aucune fiche : vendeurs
// des ventes reçues sans employé connu, lignes du tableur sans fiche. RH
// décide alors de créer la fiche (ou de compléter le pseudo d'une fiche).
async function aRattacher(env) {
  const [ventes, tableur] = await Promise.all([
    env.DB.prepare(
      `SELECT min(btrim(identite)) AS pseudo, count(*) AS ventes, max(semaine) AS derniere_semaine
         FROM stats_logs_ventes WHERE employe_id IS NULL AND btrim(identite) <> ''
        GROUP BY lower(btrim(identite)) ORDER BY count(*) DESC`
    ).all(),
    env.DB.prepare(
      "SELECT nom_sheet, grade_sheet, nb_ventes, nb_locations FROM sync_sheet_agents WHERE employe_id IS NULL ORDER BY ligne_sheet"
    ).all(),
  ]);
  return {
    vendeurs: (ventes.results || []).map((v) => ({ pseudo: v.pseudo, ventes: Number(v.ventes), derniereSemaine: v.derniere_semaine })),
    tableur: (tableur.results || []).map((l) => ({ nom: l.nom_sheet, grade: l.grade_sheet, ventes: l.nb_ventes, locations: l.nb_locations })),
  };
}

// ---- arrivées envoyées par le bot Discord (tickets de recrutement) -----------
// Le bot lit un ticket de recrutement et POSTE l'arrivée sur
// /api/rh/bot/arrivees, avec la clé RH_BOT_SECRET (variable d'environnement,
// distincte de celle du bot de ventes : elle laisse entrer téléphone et RIB).
// La fiche est créée tout de suite, active. Règles :
//   - un ticket = une fiche : un renvoi du même ticketId ne crée rien de plus ;
//   - un compte Discord qui a déjà une fiche n'en reçoit pas une deuxième, et
//     sa fiche n'est pas modifiée (RH fait foi) ; une fiche inactive n'est pas
//     réactivée d'office, la décision reste à RH ;
//   - sans ID employé dans le ticket, la fiche reçoit un ID provisoire
//     « PROV-B… », à remplacer dans RH ;
//   - sans grade dans le ticket, le grade d'arrivée réglé dans RH ; jamais un
//     grade de direction (Patron, Co Patron, Développeur web).
// Chaque ticket reçu est consigné (rh_arrivees_bot), sans téléphone ni RIB.

const REGLAGES_RH = { bot_grade_arrivee: "", bot_serveur_discord: "" };

async function lireReglages(env) {
  const r = await env.DB.prepare("SELECT cle, valeur FROM rh_reglages").all();
  const reglages = { ...REGLAGES_RH };
  for (const { cle, valeur } of r.results || []) if (cle in reglages) reglages[cle] = valeur;
  return reglages;
}

// Comparaison à temps constant (empreintes de même longueur).
function cleBotValide(request, env) {
  const correspond = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!env.RH_BOT_SECRET || !correspond) return false;
  const empreinte = (v) => createHash("sha256").update(String(v)).digest();
  return timingSafeEqual(empreinte(correspond[1]), empreinte(env.RH_BOT_SECRET));
}

function aujourdhuiParis() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const RE_ID_DISCORD = /^\d{15,22}$/;

async function reponseArrivee(env, ligne, status, deja) {
  const e = ligne.employe_id
    ? await env.DB.prepare("SELECT id_employe, id_provisoire, statut FROM employes WHERE id = ?1").bind(ligne.employe_id).first()
    : null;
  const corps = { ok: ligne.resultat !== "refusee", resultat: ligne.resultat, deja: !!deja };
  if (ligne.motif) corps[ligne.resultat === "refusee" ? "erreur" : "motif"] = ligne.motif;
  if (e) Object.assign(corps, { employeId: ligne.employe_id, idEmploye: e.id_employe, idProvisoire: !!e.id_provisoire, statut: e.statut });
  return json(corps, status);
}

export async function recevoirArriveeBot(request, env) {
  if (request.method !== "POST") return json({ erreur: "Méthode non autorisée." }, 405);
  if (!env.RH_BOT_SECRET) return json({ erreur: "Réception des arrivées non configurée (RH_BOT_SECRET)." }, 503);
  if (!cleBotValide(request, env)) return json({ erreur: "Clé du bot invalide." }, 401);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ erreur: "Requête illisible (objet JSON attendu)." }, 400);
  const ticketId = texte(b.ticketId, 100);
  if (!ticketId) return json({ erreur: "ticketId est obligatoire : un identifiant unique et stable par ticket." }, 400);

  const deja = await env.DB.prepare("SELECT * FROM rh_arrivees_bot WHERE ticket_id = ?1").bind(ticketId).first();
  if (deja && deja.resultat !== "refusee") return reponseArrivee(env, deja, 200, true);

  const serveur = texte(b.serveurDiscord, 30);
  const discordId = texte(b.discordId, 30);
  const consigner = async (resultat, motif, employeId, status) => {
    // Un ticket refusé peut être renvoyé corrigé ; un ticket abouti reste tel
    // quel (deux envois simultanés : le second lit le résultat du premier).
    await env.DB.prepare(
      `INSERT INTO rh_arrivees_bot (ticket_id, serveur_discord, discord_id, nom_recu, resultat, motif, employe_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (ticket_id) DO UPDATE SET serveur_discord = excluded.serveur_discord, discord_id = excluded.discord_id,
         nom_recu = excluded.nom_recu, resultat = excluded.resultat, motif = excluded.motif, employe_id = excluded.employe_id,
         recu_le = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
       WHERE rh_arrivees_bot.resultat = 'refusee'
       RETURNING id`
    ).bind(ticketId, serveur, discordId, `${texte(b.prenom, 60)} ${texte(b.nom, 60)}`.trim(), resultat, motif, employeId).run();
    const ligne = await env.DB.prepare("SELECT * FROM rh_arrivees_bot WHERE ticket_id = ?1").bind(ticketId).first();
    const memeResultat = ligne.resultat === resultat && Number(ligne.employe_id || 0) === Number(employeId || 0);
    return reponseArrivee(env, ligne, memeResultat ? status : 200, !memeResultat);
  };

  const reglages = await lireReglages(env);
  if (reglages.bot_serveur_discord && serveur !== reglages.bot_serveur_discord) {
    return consigner("refusee", "Ce serveur Discord n'est pas celui réglé dans Ressources humaines.", null, 403);
  }
  if (!RE_ID_DISCORD.test(discordId)) {
    return consigner("refusee", "discordId est obligatoire : l'ID Discord (15 à 22 chiffres) de la personne recrutée.", null, 400);
  }
  const existante = await env.DB.prepare("SELECT id, statut FROM employes WHERE discord_id = ?1").bind(discordId).first();
  if (existante) {
    const motif = existante.statut === "inactif"
      ? "Ce compte Discord a déjà une fiche, inactive : à réactiver dans Ressources humaines."
      : "Ce compte Discord a déjà une fiche.";
    return consigner("existante", motif, existante.id, 200);
  }
  const grade = texte(b.grade, 60) || reglages.bot_grade_arrivee;
  if (!grade) return consigner("refusee", "Aucun grade reçu, et aucun grade d'arrivée réglé dans Ressources humaines.", null, 400);
  if (GRADES_ADMIN_RH.includes(grade)) return consigner("refusee", "Ce grade ne peut pas être attribué par le bot.", null, 400);

  const corps = {
    idEmploye: b.idEmploye, prenom: b.prenom, nom: b.nom, grade,
    discordId, discordPseudo: b.discordPseudo, telephone: b.telephone, rib: b.rib,
    dateArrivee: texte(b.dateArrivee, 10) || aujourdhuiParis(),
  };
  for (const cle of ["discordPseudo", "telephone", "rib"]) if (corps[cle] === undefined) delete corps[cle];
  // Pas d'ID employé dans le ticket : ID provisoire tiré du numéro de la fiche.
  let numero = null;
  if (!texte(b.idEmploye, 40)) {
    numero = Number((await env.DB.prepare("SELECT nextval(pg_get_serial_sequence('employes', 'id')) AS n").first()).n);
    corps.idEmploye = `PROV-B${String(numero).padStart(4, "0")}`;
  }
  const { champs, erreur } = lireChamps(corps, null);
  if (erreur) return consigner("refusee", erreur, null, 400);
  champs.statut = "actif";
  if (numero !== null) { champs.id = numero; champs.id_provisoire = 1; }
  const doublon = await conflit(env, champs, 0);
  if (doublon) return consigner("refusee", doublon, null, 409);
  const colonnes = Object.keys(champs);
  let fiche;
  try {
    fiche = await env.DB.prepare(
      `INSERT INTO employes (${colonnes.join(", ")}) VALUES (${colonnes.map((_, i) => `?${i + 1}`).join(", ")}) RETURNING *`
    ).bind(...colonnes.map((k) => champs[k])).first();
  } catch (e) {
    // Deux envois simultanés pour le même compte : le second trouve la fiche du premier.
    if (e && e.code === "23505") {
      const autre = await env.DB.prepare("SELECT id FROM employes WHERE discord_id = ?1").bind(discordId).first();
      if (autre) return consigner("existante", "Ce compte Discord a déjà une fiche.", autre.id, 200);
      return consigner("refusee", "Cet ID employé ou ce pseudo Discord est déjà sur une autre fiche.", null, 409);
    }
    throw e;
  }
  await rattacherVentes(env, fiche);
  return consigner("creee", "", fiche.id, 201);
}

// Écran RH : dernières arrivées reçues du bot, réglages, état de la clé.
async function arriveesBot(env) {
  const [lignes, reglages] = await Promise.all([
    env.DB.prepare(
      `SELECT a.ticket_id, a.discord_id, a.nom_recu, a.resultat, a.motif, a.recu_le, a.employe_id,
              e.id_employe, e.id_provisoire, e.prenom, e.nom, e.discord_pseudo, e.statut
         FROM rh_arrivees_bot a LEFT JOIN employes e ON e.id = a.employe_id
        ORDER BY a.id DESC LIMIT 50`
    ).all(),
    lireReglages(env),
  ]);
  return {
    configure: !!env.RH_BOT_SECRET,
    reglages: { gradeArrivee: reglages.bot_grade_arrivee, serveurDiscord: reglages.bot_serveur_discord },
    grades: GRADES_EMPLOYES.filter((g) => !GRADES_ADMIN_RH.includes(g)),
    arrivees: (lignes.results || []).map((l) => ({
      ticketId: l.ticket_id, discordId: l.discord_id, nomRecu: l.nom_recu, resultat: l.resultat, motif: l.motif, recuLe: l.recu_le,
      employe: l.employe_id
        ? { id: l.employe_id, idEmploye: l.id_employe, idProvisoire: !!l.id_provisoire, nomComplet: nomComplet(l), statut: l.statut }
        : null,
    })),
  };
}

async function reglerBot(env, request) {
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return json({ erreur: "Requête illisible." }, 400);
  const grade = texte(b.gradeArrivee, 60);
  const serveur = texte(b.serveurDiscord, 30);
  if (grade && (!GRADES_EMPLOYES.includes(grade) || GRADES_ADMIN_RH.includes(grade))) return json({ erreur: "Grade d'arrivée invalide." }, 400);
  if (serveur && !RE_ID_DISCORD.test(serveur)) return json({ erreur: "L'ID du serveur Discord est un nombre de 15 à 22 chiffres." }, 400);
  await env.DB.transaction(async (tx) => {
    for (const [cle, valeur] of [["bot_grade_arrivee", grade], ["bot_serveur_discord", serveur]]) {
      // RETURNING explicite : rh_reglages n'a pas de colonne « id ».
      await tx.prepare(
        "INSERT INTO rh_reglages (cle, valeur) VALUES (?1, ?2) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur RETURNING cle"
      ).bind(cle, valeur).run();
    }
  });
  return json({ ok: true });
}

// Point d'entrée : /api/rh/... (session déjà vérifiée par l'appelant).
export async function routeRh(request, url, env, s) {
  const perms = await permissionsRh(env, s);
  if (!perms.has("voir")) return json({ erreur: "Accès RH non autorisé." }, 403);
  const route = url.pathname.slice("/api/rh".length);
  const m = request.method;

  if (route === "/employes" && m === "GET") return json({ ...(await lister(env, perms)), droits: [...perms] });
  if (route === "/employes" && m === "POST") {
    if (!perms.has("creer")) return json({ erreur: "Vous n'avez pas le droit d'ajouter un employé." }, 403);
    const b = await request.json().catch(() => null);
    // Téléphone et RIB à la création : ignorés sans la permission « sensible ».
    if (b && typeof b === "object" && !perms.has("sensible")) { delete b.telephone; delete b.rib; }
    return creer(env, b);
  }
  if (route === "/a-rattacher" && m === "GET") return json(await aRattacher(env));
  if (route === "/bot" && m === "GET") return json(await arriveesBot(env));
  if (route === "/bot/reglages" && m === "PUT") {
    if (!perms.has("parametrer")) return json({ erreur: "Réservé au Patron, au Co Patron et au Développeur web." }, 403);
    return reglerBot(env, request);
  }
  if (route === "/permissions" && m === "GET") {
    if (!perms.has("parametrer")) return json({ erreur: "Réservé au Patron, au Co Patron et au Développeur web." }, 403);
    return json(await lirePermissions(env));
  }
  if (route === "/permissions" && m === "PUT") {
    if (!perms.has("parametrer")) return json({ erreur: "Réservé au Patron, au Co Patron et au Développeur web." }, 403);
    return reglerPermissions(env, request);
  }

  const mFiche = route.match(/^\/employes\/(\d+)(\/desactiver|\/reactiver)?$/);
  if (mFiche) {
    const id = Number(mFiche[1]);
    if (!mFiche[2] && m === "GET") {
      const fiche = await detail(env, id, perms);
      return fiche ? json(fiche) : json({ erreur: "Employé introuvable." }, 404);
    }
    if (!mFiche[2] && m === "PATCH") {
      if (!perms.has("modifier")) return json({ erreur: "Vous n'avez pas le droit de modifier un employé." }, 403);
      return modifier(env, request, id, perms);
    }
    if (mFiche[2] === "/desactiver" && m === "POST") {
      if (!perms.has("desactiver")) return json({ erreur: "Vous n'avez pas le droit de désactiver un employé." }, 403);
      return changerStatut(env, request, id, "inactif");
    }
    if (mFiche[2] === "/reactiver" && m === "POST") {
      if (!perms.has("reactiver")) return json({ erreur: "Vous n'avez pas le droit de réactiver un employé." }, 403);
      return changerStatut(env, request, id, "actif");
    }
  }
  return json({ erreur: "Adresse inconnue." }, 404);
}

// Pour les écrans des autres modules : l'identité d'un ensemble d'employés,
// lue dans RH (jamais recopiée ailleurs).
export async function identitesEmployes(env) {
  const r = await env.DB.prepare(
    "SELECT id, id_employe, prenom, nom, discord_pseudo, discord_id, grade, statut FROM employes"
  ).all();
  return new Map((r.results || []).map((e) => [e.id, e]));
}

// Résolution d'un nom écrit (tableur, relevé Tablettes) vers une fiche : ces
// sources n'ont pas d'ID employé, seulement un nom. La correspondance est faite
// UNE fois, à la lecture, par égalité exacte (majuscules/accents ignorés) sur
// « Prénom Nom » ; c'est ensuite la clé de la fiche qui est enregistrée.
export function indexParNom(employes) {
  const parNom = new Map();
  for (const e of employes) {
    const cle = normaliserTexte(`${e.prenom || ""} ${e.nom || ""}`);
    if (!cle.trim()) continue;
    // Deux fiches au même nom : ambigu, aucune des deux n'est retenue.
    parNom.set(cle, parNom.has(cle) ? null : e);
  }
  return parNom;
}
