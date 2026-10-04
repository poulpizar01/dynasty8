// ============================================================================
// Dynasty 8 — Synchronisation Google Sheets (recap ventes/locations par membre)
// ----------------------------------------------------------------------------
// Lit périodiquement un onglet précis d'un Google Sheets externe géré par la
// Direction (colonne D = Nom + Prénom, E = grade, L = nb ventes, M = nb
// locations) et range le résultat dans sync_sheet_agents, pour affichage
// dans « Mon profil ». Voir demarrerSyncSheet() dans server.js (VPS) pour la
// synchro automatique en arrière-plan, et syncSheet() dans src/index.js pour
// le bouton « Synchroniser maintenant » et la lecture côté admin.
//
// Accès au Sheet : lecture directe via son export CSV public
// (docs.google.com/.../export?format=csv), SANS compte de service ni clé —
// il suffit que le classeur soit partagé en "Tous les utilisateurs disposant
// du lien - Lecteur" (choix de la Direction : lien en lecture seule
// utilisé directement, pas d'API Google ni d'identifiants côté serveur).
//
// IMPORTANT : les MONTANTS de primes ne sont volontairement PAS lus depuis
// les colonnes N/O du Sheet. Ils sont recalculés sur le site à partir des
// mêmes barèmes que le reste du module Statistiques (stats_baremes_primes,
// réglables dans Comptabilité -> Paramètres -> Paliers) via montantPalier()
// (stats-calc.js), pour n'avoir qu'UN SEUL endroit où changer un montant de
// prime, comme demandé par la Direction.
// ============================================================================

import { normaliserTexte, GRADES_STATS, semaineISO, montantPalier } from "./stats-calc.js";

// Grade écrit dans le Sheet -> grade du site (majuscules/accents ignorés).
const GRADE_PAR_NORMALISE = new Map(GRADES_STATS.map((g) => [normaliserTexte(g), g]));

// Identifiant du classeur et de l'onglet (gid dans l'URL). Volontairement
// ABSENTS du code : le dépôt est public, et ce classeur est partagé « toute
// personne disposant du lien — Lecteur », donc son identifiant suffit à le
// lire. Il vit dans le .env du serveur, comme WEBMAP_ORIGIN.
// Vide = synchronisation désactivée (le site fonctionne, l'onglet le dit).
export class SheetNonConfigure extends Error {
  constructor() {
    super("Synchronisation non configurée sur le serveur : renseignez GOOGLE_SHEET_ID dans le .env.");
    this.name = "SheetNonConfigure";
  }
}

// Renvoie { id, gid } ou null si le réglage est absent ou illisible — jamais
// une valeur devinée.
export function lireConfigSheet(env) {
  const id = String((env && env.GOOGLE_SHEET_ID) || "").trim();
  const gid = String((env && env.GOOGLE_SHEET_GID) || "").trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) return null;
  if (gid && !/^[0-9]+$/.test(gid)) return null;
  return { id, gid: gid || "0" };
}

function urlExportCSV(config) {
  return `https://docs.google.com/spreadsheets/d/${config.id}/export?format=csv&gid=${config.gid}`;
}

// Analyseur CSV minimal mais correct (guillemets, virgules et retours à la
// ligne à l'intérieur d'un champ, guillemets doublés "" -> ") : suffisant
// pour un export Google Sheets, sans dépendance externe.
export function analyserCSV(texte) {
  const lignes = [];
  let ligne = [];
  let champ = "";
  let dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else dansGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === ",") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n") {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else if (c === "\r") {
      // ignoré : les fins de ligne \r\n sont gérées par le \n qui suit
    } else {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

// Sans délai, une synchro bloquée resterait en vol jusqu au prochain
// redémarrage, et les passes suivantes (toutes les 20 min) s empileraient.
const DELAI_SHEET_MS = 20_000;

async function lireCSV(config) {
  const r = await fetch(urlExportCSV(config), { signal: AbortSignal.timeout(DELAI_SHEET_MS) });
  const texte = await r.text();
  // Un classeur non partagé publiquement renvoie la page de connexion Google
  // (HTML, statut 200 après redirection) plutôt qu'une vraie erreur HTTP —
  // on le détecte pour donner un message clair plutôt qu'un CSV illisible.
  if (!r.ok || /^\s*<(!doctype|html)/i.test(texte)) {
    throw new Error(
      'Impossible de lire le Google Sheets. Vérifiez que son partage est réglé sur "Tous les utilisateurs disposant du lien — Lecteur".'
    );
  }
  return analyserCSV(texte);
}

function nombreEntier(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\u00a0\u202f\s]/g, "").replace(",", "."));
  return isFinite(n) ? Math.trunc(n) : 0;
}

// Colonnes du Sheet en index absolus (A=0, B=1, ... D=3, E=4, ... L=11, M=12).
export function analyserLignesSheet(lignesBrutes) {
  const lignes = [];
  (lignesBrutes || []).forEach((ligne, index) => {
    const nom = String(ligne[3] ?? "").trim(); // colonne D
    if (!nom) return; // ligne vide (pas de nom en colonne D) : ignorée, jamais une anomalie
    // Titres de section du Sheet (« Informations », « Directions »…) et ligne
    // d'en-tête (« Identité RP » / « Grade ») : pas de grade connu en colonne
    // E, donc pas un agent.
    const grade = GRADE_PAR_NORMALISE.get(normaliserTexte(String(ligne[4] ?? "")));
    if (!grade) return;
    lignes.push({
      ligneSheet: index + 2, // +2 : la ligne 1 du fichier CSV = en-têtes
      nom,
      nomNormalise: normaliserTexte(nom),
      grade, // colonne E, écrit comme les grades du site
      nbVentes: nombreEntier(ligne[11]), // colonne L
      nbLocations: nombreEntier(ligne[12]), // colonne M
    });
  });
  return lignes;
}

async function enregistrerEtat(env, etat) {
  await env.DB.prepare(
    `INSERT INTO sync_sheet_etat (id, derniere_sync, statut, erreur, nb_lignes, nb_apparies)
     VALUES (1, ?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (id) DO UPDATE SET derniere_sync = ?1, statut = ?2, erreur = ?3, nb_lignes = ?4, nb_apparies = ?5`
  ).bind(etat.derniere_sync, etat.statut, etat.erreur, etat.nb_lignes, etat.nb_apparies).run();
}

// Synchronisation complète : relit tout le Sheet et REMPLACE entièrement le
// contenu de sync_sheet_agents (table dérivée, jamais éditée à la main).
// Appariement compte <-> ligne du Sheet, dans cet ordre, toujours par
// égalité EXACTE de nom (majuscules/accents ignorés — jamais de « ressemblance »,
// qui reliait autrefois les mauvaises personnes) :
//   1. membres.nom_sheet (forçage manuel depuis Comptes & accès, s'il existe) ;
//   2. le référentiel agents : le compte est relié à son pseudo Discord, la
//      fiche agent relie ce pseudo à l'identité RP, et l'identité RP est le
//      nom écrit dans le Sheet ;
//   3. le pseudo du compte lui-même, s'il est identique au nom du Sheet.
//
// Deux synchros ne tournent jamais en même temps (passe automatique + bouton) :
// la seconde attend la première, sans quoi la création des fiches du
// référentiel pourrait produire des doublons.
let synchroEnCours = null;
export function synchroniserSheet(env) {
  if (!synchroEnCours) {
    synchroEnCours = synchroniserSheetUneFois(env).finally(() => { synchroEnCours = null; });
  }
  return synchroEnCours;
}

// Le Sheet fait foi pour l'équipe : chaque agent qu'il liste a sa fiche dans
// le référentiel de Ventes & statistiques (stats_agents), et le grade de
// cette fiche est celui du Sheet. Une fiche absente est créée sans pseudo
// Discord (à compléter dans « Gérer les agents »). Rien n'est jamais
// supprimé ici : un agent retiré du Sheet garde sa fiche.
// Rapprochement par identité RP, égalité exacte (majuscules/accents ignorés).
export async function alignerReferentiel(env, lignes) {
  const r = await env.DB.prepare("SELECT id, identite_rp, grade, discord_pseudo FROM stats_agents").all();
  const parRp = new Map();
  for (const f of r.results || []) {
    const cle = normaliserTexte(f.identite_rp || "");
    if (!cle) continue;
    const deja = parRp.get(cle);
    // Deux fiches pour la même identité RP : on retient celle qui a un pseudo.
    if (!deja || (!deja.discord_pseudo && f.discord_pseudo)) parRp.set(cle, f);
  }
  let crees = 0;
  let gradesMisAJour = 0;
  for (const l of lignes) {
    const fiche = parRp.get(l.nomNormalise);
    if (!fiche) {
      await env.DB.prepare(
        `INSERT INTO stats_agents (discord_pseudo, discord_pseudo_normalise, identite_rp, grade)
         VALUES ('', NULL, ?1, ?2)`
      ).bind(l.nom, l.grade).run();
      parRp.set(l.nomNormalise, { identite_rp: l.nom, grade: l.grade, discord_pseudo: "" });
      crees++;
    } else if (fiche.grade !== l.grade) {
      await env.DB.prepare("UPDATE stats_agents SET grade = ?2, maj = datetime('now') WHERE id = ?1").bind(fiche.id, l.grade).run();
      fiche.grade = l.grade;
      gradesMisAJour++;
    }
  }
  return { crees, gradesMisAJour };
}

async function synchroniserSheetUneFois(env) {
  const config = lireConfigSheet(env);
  if (!config) throw new SheetNonConfigure();
  // Une semaine terminée et pas encore archivée (serveur arrêté dimanche soir,
  // par exemple) est figée AVANT que la nouvelle lecture n'écrase ses chiffres.
  // Pas dans la minute de 23:59 elle-même : c'est la tâche d'archivage qui s'en
  // charge alors, juste après une lecture fraîche.
  await archiverSemaineSiDue(env, { grace: 60_000 });
  const brut = await lireCSV(config);
  const lignes = analyserLignesSheet(brut.slice(1)); // ligne 1 = en-têtes
  const referentiel = await alignerReferentiel(env, lignes);
  if (referentiel.crees || referentiel.gradesMisAJour) {
    console.log(`[sync-sheet] Référentiel : ${referentiel.crees} fiche(s) créée(s), ${referentiel.gradesMisAJour} grade(s) mis à jour.`);
  }

  const [comptesR, fichesR] = await Promise.all([
    env.DB.prepare("SELECT id, pseudo, discord_pseudo, nom_sheet FROM membres WHERE statut != 'desactive'").all(),
    env.DB.prepare("SELECT discord_pseudo_normalise, identite_rp FROM stats_agents").all(),
  ]);
  const comptes = comptesR.results || [];
  const parNomSheet = new Map();      // 1. forçage manuel
  const parIdentiteRp = new Map();    // 2. via le référentiel agents
  const parPseudo = new Map();        // 3. pseudo du compte
  const compteParDiscord = new Map();
  comptes.forEach((c) => {
    if (c.nom_sheet) parNomSheet.set(normaliserTexte(c.nom_sheet), c.id);
    if (c.discord_pseudo) compteParDiscord.set(normaliserTexte(c.discord_pseudo), c.id);
    if (c.pseudo) parPseudo.set(normaliserTexte(c.pseudo), c.id);
  });
  (fichesR.results || []).forEach((f) => {
    const idCompte = compteParDiscord.get(f.discord_pseudo_normalise || "");
    const rp = normaliserTexte(f.identite_rp || "");
    if (idCompte && rp && !parIdentiteRp.has(rp)) parIdentiteRp.set(rp, idCompte);
  });
  const trouverMembreId = (nomNormalise) =>
    parNomSheet.get(nomNormalise) ?? parIdentiteRp.get(nomNormalise) ?? parPseudo.get(nomNormalise) ?? null;

  await env.DB.prepare("DELETE FROM sync_sheet_agents").run();
  await Promise.all(
    lignes.map((l) =>
      env.DB.prepare(
        `INSERT INTO sync_sheet_agents (nom_sheet, nom_normalise, grade_sheet, nb_ventes, nb_locations, membre_id, ligne_sheet)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(l.nom, l.nomNormalise, l.grade, l.nbVentes, l.nbLocations, trouverMembreId(l.nomNormalise), l.ligneSheet).run()
    )
  );

  const nbApparies = lignes.filter((l) => trouverMembreId(l.nomNormalise) != null).length;
  const etat = {
    derniere_sync: new Date().toISOString(),
    statut: "ok",
    erreur: "",
    nb_lignes: lignes.length,
    nb_apparies: nbApparies,
  };
  await enregistrerEtat(env, etat);
  return { ...etat, referentiel };
}

// Même chose, mais n'expose jamais l'exception à l'appelant (utilisé pour la
// synchro automatique en arrière-plan, qui ne doit jamais faire planter le
// serveur) : l'erreur est journalisée et enregistrée dans sync_sheet_etat,
// consultable dans Paramètres.
export async function synchroniserSheetSansErreur(env) {
  try {
    return await synchroniserSheet(env);
  } catch (e) {
    // Réglage absent : ce n'est pas une panne, on ne remplit pas les journaux
    // toutes les 20 minutes pour autant. L'onglet affiche l'explication.
    const nonConfigure = e instanceof SheetNonConfigure;
    const etat = {
      derniere_sync: new Date().toISOString(),
      statut: nonConfigure ? "desactive" : "erreur",
      erreur: String((e && e.message) || e),
      nb_lignes: 0,
      nb_apparies: 0,
    };
    try {
      await enregistrerEtat(env, etat);
    } catch (e2) {
      console.error("[sync-sheet] Échec de l'enregistrement de l'état d'erreur :", e2);
    }
    if (!nonConfigure) console.error("[sync-sheet] Échec de synchronisation :", e);
    return etat;
  }
}

// ============================================================================
// « Chiffres du tableur » : vue actuelle et archives hebdomadaires
// ============================================================================

// Chiffres du tableur tels qu'affichés dans Ventes & statistiques : chaque
// ligne lue, avec ses primes (barèmes du site, comme « Mon profil » et la
// DOT), la fiche du référentiel qui lui correspond (par identité RP) et le
// compte du site relié. Sert à l'écran ET à l'archive : une semaine archivée
// est exactement ce que l'écran montrait.
export async function lireTableurActuel(env) {
  const [lignesR, fichesR, baremesR] = await Promise.all([
    env.DB.prepare(
      `SELECT ssa.ligne_sheet, ssa.nom_sheet, ssa.nom_normalise, ssa.grade_sheet, ssa.nb_ventes, ssa.nb_locations, ssa.maj, m.pseudo AS compte
         FROM sync_sheet_agents ssa LEFT JOIN membres m ON m.id = ssa.membre_id
        ORDER BY ssa.ligne_sheet`
    ).all(),
    env.DB.prepare("SELECT id, discord_pseudo, identite_rp FROM stats_agents").all(),
    env.DB.prepare("SELECT * FROM stats_baremes_primes").all(),
  ]);
  const baremes = baremesR.results || [];
  const baremeVentes = baremes.filter((b) => b.type === "vente");
  const baremeLocations = baremes.filter((b) => b.type === "location");
  const fichesParRp = new Map();
  for (const f of fichesR.results || []) {
    const cle = normaliserTexte(f.identite_rp || "");
    const deja = fichesParRp.get(cle);
    if (cle && (!deja || (!deja.discord_pseudo && f.discord_pseudo))) fichesParRp.set(cle, f);
  }
  let lueLe = null;
  const lignes = (lignesR.results || []).map((l) => {
    if (l.maj && (!lueLe || l.maj > lueLe)) lueLe = l.maj;
    const primeVente = montantPalier(baremeVentes, l.nb_ventes);
    const primeLocations = montantPalier(baremeLocations, l.nb_locations);
    const fiche = fichesParRp.get(l.nom_normalise) || null;
    return {
      ligneSheet: l.ligne_sheet,
      nom: l.nom_sheet,
      grade: l.grade_sheet,
      ventes: l.nb_ventes,
      locations: l.nb_locations,
      primeVente,
      primeLocations,
      primeTotale: primeVente + primeLocations,
      fiche: fiche ? { id: fiche.id, discordPseudo: fiche.discord_pseudo || "" } : null,
      compte: l.compte || null,
    };
  });
  // maj est écrit par PostgreSQL en UTC, au format « AAAA-MM-JJ HH:MM:SS ».
  return { lignes, lueLe: lueLe ? new Date(lueLe.replace(" ", "T") + "Z") : null };
}

// ---- Heure de Paris, sans bibliothèque --------------------------------------
// Europe/Paris : UTC+2 l'été, UTC+1 l'hiver. Les semaines du site vont du lundi
// 00:00 au dimanche 23:59, heure de Paris ; l'archive se fait à 23:59.

const FORMAT_PARIS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", hourCycle: "h23", weekday: "short",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
const JOURS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function partiesParis(date) {
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(date).map((x) => [x.type, x.value]));
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour, minute: +p.minute, jourSemaine: JOURS[p.weekday] };
}

// Instant correspondant à une date et une heure de Paris.
function instantParis(annee, mois, jour, heure, minute) {
  const commeSiUtc = Date.UTC(annee, mois - 1, jour, heure, minute);
  const p = partiesParis(new Date(commeSiUtc));
  const decalage = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute) - commeSiUtc;
  return new Date(commeSiUtc - decalage);
}

// Semaine (lundi -> dimanche, heure de Paris) qui contient cet instant :
// { code: "S41-26", debut: lundi 00:00, fin: dimanche 23:59 }.
export function semaineParis(date) {
  const p = partiesParis(date);
  const jourCivil = new Date(Date.UTC(p.annee, p.mois - 1, p.jour));
  const { numero, anneeIso } = semaineISO(jourCivil);
  const decaler = (jours) => {
    const d = new Date(jourCivil);
    d.setUTCDate(d.getUTCDate() + jours);
    return d;
  };
  const lundi = decaler(1 - p.jourSemaine);
  const dimanche = decaler(7 - p.jourSemaine);
  return {
    code: `S${numero}-${String(anneeIso).slice(-2)}`,
    debut: instantParis(lundi.getUTCFullYear(), lundi.getUTCMonth() + 1, lundi.getUTCDate(), 0, 0),
    fin: instantParis(dimanche.getUTCFullYear(), dimanche.getUTCMonth() + 1, dimanche.getUTCDate(), 23, 59),
  };
}

// Dernière semaine dont l'heure d'archivage est passée : la semaine en cours
// à partir du dimanche 23:59, sinon la précédente.
export function semaineArchivable(maintenant) {
  const enCours = semaineParis(maintenant);
  if (maintenant >= enCours.fin) return enCours;
  return semaineParis(new Date(enCours.debut.getTime() - 60_000));
}

// Fige les chiffres du tableur de la semaine écoulée, une seule fois par
// semaine. Ne fige QUE des chiffres lus pendant cette semaine-là : si la
// dernière lecture date d'une autre semaine (premier démarrage en milieu de
// semaine, synchro désactivée…), rien n'est archivé plutôt que d'enregistrer
// les chiffres d'une semaine sous le numéro d'une autre.
// `grace` : délai minimal après dimanche 23:59 avant d'agir (voir l'appel
// dans synchroniserSheetUneFois).
export async function archiverSemaineSiDue(env, { maintenant = new Date(), grace = 0 } = {}) {
  const semaine = semaineArchivable(maintenant);
  if (maintenant - semaine.fin < grace) return { archivee: false, semaine: semaine.code, raison: "pas encore" };
  const deja = await env.DB.prepare("SELECT id FROM tableur_archives WHERE semaine = ?1").bind(semaine.code).first();
  if (deja) return { archivee: false, semaine: semaine.code, raison: "déjà archivée" };

  const { lignes, lueLe } = await lireTableurActuel(env);
  if (!lignes.length || !lueLe) return { archivee: false, semaine: semaine.code, raison: "tableur jamais lu" };
  if (semaineParis(lueLe).code !== semaine.code) {
    return { archivee: false, semaine: semaine.code, raison: "chiffres d'une autre semaine" };
  }

  const enRetard = maintenant - semaine.fin > 5 * 60_000 ? 1 : 0;
  const cree = await env.DB.transaction(async (tx) => {
    const archive = await tx.prepare(
      `INSERT INTO tableur_archives (semaine, archive_le, donnees_du, en_retard)
       VALUES (?1, ?2, ?3, ?4) ON CONFLICT (semaine) DO NOTHING RETURNING id`
    ).bind(semaine.code, maintenant.toISOString(), lueLe.toISOString(), enRetard).first();
    if (!archive) return false; // archivée entre-temps par une autre passe
    for (const l of lignes) {
      await tx.prepare(
        `INSERT INTO tableur_archives_lignes
           (archive_id, ligne_sheet, nom, grade, ventes, locations, prime_vente, prime_locations, fiche_pseudo, compte)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      ).bind(archive.id, l.ligneSheet, l.nom, l.grade || "", l.ventes, l.locations, l.primeVente, l.primeLocations,
        l.fiche ? l.fiche.discordPseudo : null, l.compte).run();
    }
    return true;
  });
  if (cree) console.log(`[archive-tableur] Semaine ${semaine.code} archivée (${lignes.length} agent(s))${enRetard ? " — en retard" : ""}.`);
  return { archivee: cree, semaine: semaine.code };
}

// Archive d'une semaine, au même format que lireTableurActuel ; null si absente.
export async function lireArchiveTableur(env, code) {
  const archive = await env.DB.prepare("SELECT * FROM tableur_archives WHERE semaine = ?1").bind(code).first();
  if (!archive) return null;
  const r = await env.DB.prepare(
    "SELECT * FROM tableur_archives_lignes WHERE archive_id = ?1 ORDER BY ligne_sheet, id"
  ).bind(archive.id).all();
  return {
    semaine: archive.semaine,
    archiveLe: archive.archive_le,
    donneesDu: archive.donnees_du,
    enRetard: !!archive.en_retard,
    lignes: (r.results || []).map((l) => ({
      ligneSheet: l.ligne_sheet,
      nom: l.nom,
      grade: l.grade,
      ventes: l.ventes,
      locations: l.locations,
      primeVente: l.prime_vente,
      primeLocations: l.prime_locations,
      primeTotale: l.prime_vente + l.prime_locations,
      fiche: l.fiche_pseudo == null ? null : { discordPseudo: l.fiche_pseudo },
      compte: l.compte,
    })),
  };
}
