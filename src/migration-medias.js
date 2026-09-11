// ============================================================================
// Migration des anciennes photos base64 vers storage.fbfa.fr
// ----------------------------------------------------------------------------
// Logique utilisée par scripts/migrer-images-fbfa.js (JAMAIS lancée
// automatiquement). Ne concerne que les valeurs « data:image/…;base64,… »
// stockées en base (biens.images, membres.photo) : les liens externes, les
// URL déjà hébergées et les images statiques de public/img ne sont jamais
// touchés.
//
// Pour chaque image :
//   1. décodage + validation réelle du fichier (JPEG/PNG/WebP) ;
//   2. envoi au stockage sous une clé déterministe
//      {préfixe}/{biens|profils}/migration/{sha256}.{ext} — une reprise après
//      coupure renvoie la même clé (écrasement, pas de doublon) et une image
//      identique présente à plusieurs endroits n'est envoyée qu'une fois ;
//   3. SEULEMENT si l'envoi est confirmé : dans une transaction, relecture de
//      la ligne sous verrou, sauvegarde de l'ancienne valeur dans
//      medias_migration_sauvegarde, remplacement par l'URL, rattachement du
//      média. Si le contenu a changé entre-temps, rien n'est remplacé.
// La date « maj » des annonces n'est pas modifiée (ordre d'affichage public).
//
// Retour arrière (annulerMigration) : remet les valeurs sauvegardées là où
// l'URL migrée est toujours présente ; les copies distantes deviennent
// orphelines et suivent le nettoyage différé habituel.
// ============================================================================

import { createHash } from "node:crypto";
import { analyserImage, decoderDataUrl, estDataUrlImage } from "./images.js";
import { importerImage, synchroniserReferences, USAGES, ErreurMedia } from "./medias.js";
import { ErreurStockage } from "./fbfa-storage.js";

const SQL_MAINTENANT = "to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')";
const ARRETS_STOCKAGE = ["config", "auth", "quota"];

function lireImages(texte) {
  try {
    const arr = JSON.parse(texte || "[]");
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
}

// Décrit une valeur base64 (sans jamais recopier son contenu dans le rapport).
function examinerValeur(valeur) {
  const decode = decoderDataUrl(valeur);
  if (!decode) return { valide: false, raison: "data URL illisible", taille: valeur.length };
  const analyse = analyserImage(decode.octets);
  const empreinte = createHash("sha256").update(decode.octets).digest("hex");
  if (!analyse.ok) return { valide: false, raison: analyse.raison, taille: decode.octets.length, empreinte };
  return {
    valide: true,
    octets: decode.octets,
    mimeDeclare: decode.mimeDeclare,
    mime: analyse.mime,
    extension: analyse.extension,
    largeur: analyse.largeur,
    hauteur: analyse.hauteur,
    taille: decode.octets.length,
    empreinte,
  };
}

// Toutes les valeurs base64 à migrer, ligne par ligne (une valeur identique
// répétée dans une même annonce ne compte qu'une fois, avec ses positions).
async function* inventaire(db, { tables, limite }) {
  let vus = 0;
  if (tables.includes("biens")) {
    const ids = await db.prepare("SELECT id FROM biens WHERE strpos(images, 'data:image/') > 0 ORDER BY id").all();
    for (const { id } of ids.results || []) {
      const ligne = await db.prepare("SELECT id, images FROM biens WHERE id = ?1").bind(id).first();
      const images = ligne && lireImages(ligne.images);
      if (!images) continue;
      const parValeur = new Map();
      images.forEach((v, i) => {
        if (!estDataUrlImage(v)) return;
        if (!parValeur.has(v)) parValeur.set(v, []);
        parValeur.get(v).push(i);
      });
      for (const [valeur, positions] of parValeur) {
        if (limite && vus >= limite) return;
        vus++;
        yield { table: "biens", ligneId: id, positions, valeur };
      }
    }
  }
  if (tables.includes("membres")) {
    const ids = await db.prepare("SELECT id FROM membres WHERE photo LIKE 'data:image/%' ORDER BY id").all();
    for (const { id } of ids.results || []) {
      if (limite && vus >= limite) return;
      const ligne = await db.prepare("SELECT id, photo FROM membres WHERE id = ?1").bind(id).first();
      if (!ligne || !estDataUrlImage(ligne.photo)) continue;
      vus++;
      yield { table: "membres", ligneId: id, positions: [null], valeur: ligne.photo };
    }
  }
}

function cleMigration(prefixe, table, empreinte, extension) {
  const usage = table === "biens" ? "bien" : "profil";
  return { usage, cle: `${prefixe}/${USAGES[usage]}/migration/${empreinte}.${extension}` };
}

// Obtient l'URL distante d'une image : réutilise un média déjà envoyé sous
// la même clé, sinon (ré)envoie le fichier.
async function obtenirMedia(db, client, config, element, examen) {
  const { usage, cle } = cleMigration(config.prefixe, element.table, examen.empreinte, examen.extension);
  const existant = await db.prepare("SELECT id, url, statut FROM medias WHERE cle = ?1").bind(cle).first();
  if (existant && existant.url && ["temporaire", "attache", "a_supprimer"].includes(existant.statut)) {
    return { mediaId: existant.id, url: existant.url, reutilise: true };
  }
  if (existant && ["suppression", "conflit"].includes(existant.statut)) {
    throw new ErreurMedia(409, `clé ${cle} indisponible (statut ${existant.statut})`, "cle_indisponible");
  }
  if (existant) {
    // envoi incertain, refus ou ancienne suppression : la ligne est recréée
    // juste avant le nouvel envoi (même clé : l'objet distant est écrasé).
    await db.prepare("DELETE FROM medias WHERE id = ?1 AND statut IN ('envoi', 'echec', 'supprime')").bind(existant.id).run();
  }
  const r = await importerImage({
    db, client, config, octets: examen.octets, mimeDeclare: null, usage, auteurId: null, origine: "migration", cle,
  });
  return { mediaId: r.mediaId, url: r.url, reutilise: false };
}

// Remplace la valeur base64 par l'URL, sous verrou, uniquement si elle est
// toujours présente. Renvoie le nombre de positions remplacées.
async function remplacerValeur(db, element, examen, media, delaiSecondes) {
  return db.transaction(async (tx) => {
    if (element.table === "biens") {
      const ligne = await tx.prepare("SELECT id, images FROM biens WHERE id = ?1 FOR UPDATE").bind(element.ligneId).first();
      const images = ligne && lireImages(ligne.images);
      if (!images) return 0;
      const positions = [];
      images.forEach((v, i) => { if (v === element.valeur) positions.push(i); });
      if (!positions.length) return 0;
      for (const i of positions) {
        await tx.prepare(
          `INSERT INTO medias_migration_sauvegarde (table_cible, ligne_id, position, ancienne_valeur, empreinte, nouvelle_url, media_id)
           VALUES ('biens', ?1, ?2, ?3, ?4, ?5, ?6)`
        ).bind(ligne.id, i, element.valeur, examen.empreinte, media.url, media.mediaId).run();
        images[i] = media.url;
      }
      await tx.prepare("UPDATE biens SET images = ?2 WHERE id = ?1").bind(ligne.id, JSON.stringify(images)).run();
      await synchroniserReferences(tx, { type: "bien", id: ligne.id }, images, { delaiSecondes });
      return positions.length;
    }
    const ligne = await tx.prepare("SELECT id, photo FROM membres WHERE id = ?1 FOR UPDATE").bind(element.ligneId).first();
    if (!ligne || ligne.photo !== element.valeur) return 0;
    await tx.prepare(
      `INSERT INTO medias_migration_sauvegarde (table_cible, ligne_id, position, ancienne_valeur, empreinte, nouvelle_url, media_id)
       VALUES ('membres', ?1, NULL, ?2, ?3, ?4, ?5)`
    ).bind(ligne.id, element.valeur, examen.empreinte, media.url, media.mediaId).run();
    await tx.prepare("UPDATE membres SET photo = ?2 WHERE id = ?1").bind(ligne.id, media.url).run();
    await synchroniserReferences(tx, { type: "membre", id: ligne.id }, [media.url], { delaiSecondes });
    return 1;
  });
}

function nouveauRapport(mode, action) {
  return {
    action,
    mode,
    debut: new Date().toISOString(),
    fin: null,
    interrompu: null,
    totaux: {
      elements: 0, a_migrer: 0, migres: 0, reutilises: 0, invalides: 0, conflits: 0, erreurs: 0,
      octets_a_migrer: 0, octets_migres: 0, empreintes_uniques: 0,
    },
    elements: [],
  };
}

export async function migrerImagesBase64({ db, client, config, mode = "simulation", tables = ["biens", "membres"], limite = 0 }) {
  const rapport = nouveauRapport(mode, "migration");
  const empreintes = new Set();
  const delaiSecondes = config.delaiNettoyageHeures * 3600;

  for await (const element of inventaire(db, { tables, limite })) {
    const examen = examinerValeur(element.valeur);
    const ligne = {
      table: element.table,
      ligne_id: element.ligneId,
      positions: element.positions,
      taille: examen.taille,
      mime: examen.mime || null,
      dimensions: examen.valide ? `${examen.largeur}x${examen.hauteur}` : null,
      empreinte: examen.empreinte || null,
      resultat: null,
    };
    rapport.elements.push(ligne);
    rapport.totaux.elements++;

    if (!examen.valide) {
      ligne.resultat = "invalide";
      ligne.raison = examen.raison;
      rapport.totaux.invalides++;
      continue;
    }
    empreintes.add(examen.empreinte);
    rapport.totaux.a_migrer++;
    rapport.totaux.octets_a_migrer += examen.taille;

    if (mode !== "actif") {
      ligne.resultat = "a_migrer";
      continue;
    }

    let media;
    try {
      media = await obtenirMedia(db, client, config, element, examen);
    } catch (e) {
      ligne.resultat = "erreur";
      ligne.erreur = e instanceof ErreurStockage ? `${e.code}${e.status ? " HTTP " + e.status : ""}` : String((e && e.message) || e).slice(0, 200);
      rapport.totaux.erreurs++;
      if (e instanceof ErreurStockage && ARRETS_STOCKAGE.includes(e.code)) {
        rapport.interrompu = e.code;
        break;
      }
      continue;
    }

    try {
      const remplaces = await remplacerValeur(db, element, examen, media, delaiSecondes);
      if (!remplaces) {
        // Contenu modifié pendant la migration : rien n'est remplacé. Le
        // fichier envoyé reste temporaire (nettoyage différé habituel).
        ligne.resultat = "conflit";
        rapport.totaux.conflits++;
        continue;
      }
      ligne.resultat = media.reutilise ? "reutilise" : "migre";
      ligne.url = media.url;
      ligne.media_id = media.mediaId;
      rapport.totaux[media.reutilise ? "reutilises" : "migres"]++;
      rapport.totaux.octets_migres += examen.taille;
    } catch (e) {
      ligne.resultat = "erreur";
      ligne.erreur = String((e && e.message) || e).slice(0, 200);
      rapport.totaux.erreurs++;
    }
  }
  rapport.totaux.empreintes_uniques = empreintes.size;
  rapport.fin = new Date().toISOString();
  return rapport;
}

export async function annulerMigration({ db, config, mode = "simulation", limite = 0 }) {
  const rapport = nouveauRapport(mode, "annulation");
  rapport.totaux = { groupes: 0, restaures: 0, deja_modifies: 0, lignes_absentes: 0 };
  const delaiSecondes = config.delaiNettoyageHeures * 3600;

  const r = await db.prepare(
    "SELECT id, table_cible, ligne_id, position, nouvelle_url FROM medias_migration_sauvegarde WHERE annule_le IS NULL ORDER BY table_cible, ligne_id, id"
  ).all();
  const groupes = new Map();
  for (const s of r.results || []) {
    const cle = `${s.table_cible}:${s.ligne_id}`;
    if (!groupes.has(cle)) groupes.set(cle, { table: s.table_cible, ligneId: s.ligne_id, sauvegardes: [] });
    groupes.get(cle).sauvegardes.push(s);
  }

  for (const groupe of groupes.values()) {
    if (limite && rapport.totaux.groupes >= limite) break;
    rapport.totaux.groupes++;
    const ligne = { table: groupe.table, ligne_id: groupe.ligneId, sauvegardes: groupe.sauvegardes.map((s) => s.id), restaures: 0, deja_modifies: 0, resultat: null };
    rapport.elements.push(ligne);

    await db.transaction(async (tx) => {
      const idsRestaures = [];
      if (groupe.table === "biens") {
        const cible = await tx.prepare("SELECT id, images FROM biens WHERE id = ?1 FOR UPDATE").bind(groupe.ligneId).first();
        const images = cible && lireImages(cible.images);
        if (!images) { ligne.resultat = "ligne_absente"; rapport.totaux.lignes_absentes++; return; }
        for (const s of groupe.sauvegardes) {
          let i = s.position != null && images[s.position] === s.nouvelle_url ? s.position : images.indexOf(s.nouvelle_url);
          if (i === -1) { ligne.deja_modifies++; continue; }
          const ancienne = await tx.prepare("SELECT ancienne_valeur FROM medias_migration_sauvegarde WHERE id = ?1").bind(s.id).first();
          images[i] = ancienne.ancienne_valeur;
          idsRestaures.push(s.id);
        }
        if (mode === "actif" && idsRestaures.length) {
          await tx.prepare("UPDATE biens SET images = ?2 WHERE id = ?1").bind(cible.id, JSON.stringify(images)).run();
          await synchroniserReferences(tx, { type: "bien", id: cible.id }, images, { delaiSecondes });
        }
      } else {
        const cible = await tx.prepare("SELECT id, photo FROM membres WHERE id = ?1 FOR UPDATE").bind(groupe.ligneId).first();
        if (!cible) { ligne.resultat = "ligne_absente"; rapport.totaux.lignes_absentes++; return; }
        const s = groupe.sauvegardes[groupe.sauvegardes.length - 1];
        if (cible.photo !== s.nouvelle_url) {
          ligne.deja_modifies = groupe.sauvegardes.length;
        } else {
          const ancienne = await tx.prepare("SELECT ancienne_valeur FROM medias_migration_sauvegarde WHERE id = ?1").bind(s.id).first();
          idsRestaures.push(...groupe.sauvegardes.map((x) => x.id));
          if (mode === "actif") {
            await tx.prepare("UPDATE membres SET photo = ?2 WHERE id = ?1").bind(cible.id, ancienne.ancienne_valeur).run();
            await synchroniserReferences(tx, { type: "membre", id: cible.id }, [ancienne.ancienne_valeur], { delaiSecondes });
          }
        }
      }
      if (mode === "actif" && idsRestaures.length) {
        await tx.prepare(`UPDATE medias_migration_sauvegarde SET annule_le = ${SQL_MAINTENANT} WHERE id = ANY(?1::int[])`).bind(idsRestaures).run();
      }
      ligne.restaures = idsRestaures.length;
      ligne.resultat = mode === "actif" ? "restaure" : "a_restaurer";
      rapport.totaux.restaures += idsRestaures.length;
      rapport.totaux.deja_modifies += ligne.deja_modifies;
    });
  }
  rapport.fin = new Date().toISOString();
  return rapport;
}
