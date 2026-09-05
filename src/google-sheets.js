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

import { normaliserTexte } from "./stats-calc.js";

// Identifiant du classeur et de l'onglet (gid dans l'URL) — voir la demande
// initiale de la Direction. Fixes en dur : ce module ne sert QUE ce Sheet-là.
const SPREADSHEET_ID = "10pHrJVYfdhIeWkdMsm5RRtDMW04vlDs9GEJ9h81x1iw";
const GID_ONGLET = "1211846791";

function urlExportCSV() {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GID_ONGLET}`;
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

async function lireCSV() {
  const r = await fetch(urlExportCSV());
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
    lignes.push({
      ligneSheet: index + 2, // +2 : la ligne 1 du fichier CSV = en-têtes
      nom,
      nomNormalise: normaliserTexte(nom),
      grade: String(ligne[4] ?? "").trim(), // colonne E
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
// contenu de sync_sheet_agents (table dérivée, jamais éditée à la main —
// sans risque de la vider/recréer à chaque synchro). L'appariement compte
// <-> ligne est recalculé à chaque fois à partir de membres.nom_sheet
// (réglé à la main par la Direction, prioritaire) puis, à défaut, du pseudo
// du compte (dépannage, pour ne pas laisser tout le monde "non apparié"
// tant que nom_sheet n'a pas encore été rempli).
export async function synchroniserSheet(env) {
  const brut = await lireCSV();
  const lignes = analyserLignesSheet(brut.slice(1)); // ligne 1 = en-têtes

  const comptesR = await env.DB.prepare(
    "SELECT id, pseudo, nom_sheet FROM membres WHERE statut != 'desactive'"
  ).all();
  const comptes = comptesR.results || [];
  const parNomSheet = new Map();
  const parPseudo = new Map();
  comptes.forEach((c) => {
    if (c.nom_sheet) parNomSheet.set(normaliserTexte(c.nom_sheet), c.id);
    if (c.pseudo) parPseudo.set(normaliserTexte(c.pseudo), c.id);
  });
  const trouverMembreId = (nomNormalise) => {
    if (parNomSheet.has(nomNormalise)) return parNomSheet.get(nomNormalise);
    if (parPseudo.has(nomNormalise)) return parPseudo.get(nomNormalise);
    return null;
  };

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
  return etat;
}

// Même chose, mais n'expose jamais l'exception à l'appelant (utilisé pour la
// synchro automatique en arrière-plan, qui ne doit jamais faire planter le
// serveur) : l'erreur est journalisée et enregistrée dans sync_sheet_etat,
// consultable dans Paramètres.
export async function synchroniserSheetSansErreur(env) {
  try {
    return await synchroniserSheet(env);
  } catch (e) {
    const etat = {
      derniere_sync: new Date().toISOString(),
      statut: "erreur",
      erreur: String((e && e.message) || e),
      nb_lignes: 0,
      nb_apparies: 0,
    };
    try {
      await enregistrerEtat(env, etat);
    } catch (e2) {
      console.error("[sync-sheet] Échec de l'enregistrement de l'état d'erreur :", e2);
    }
    console.error("[sync-sheet] Échec de synchronisation :", e);
    return etat;
  }
}
