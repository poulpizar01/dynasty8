// ============================================================================
// Marquage réversible des ventes EXACT dupliquées — SCRIPT MANUEL SÉPARÉ
// ----------------------------------------------------------------------------
// Ne JAMAIS appeler ce script depuis server.js, une migration ou le schéma :
// il ne s'exécute que si un humain le lance explicitement, et n'écrit rien
// tant que --apply n'est pas passé en argument.
//
// Usage :
//   node scripts/marquer-doublons-exacts.js            (simulation, aucune écriture)
//   node scripts/marquer-doublons-exacts.js --apply     (marquage réel, transaction unique)
//
// Ce script ne touche jamais stats_logs_ventes (aucune ligne supprimée ni
// modifiée) : il se contente d'insérer des lignes dans la table séparée
// stats_ventes_doublons_marques. Retirer une ligne de cette table (à la main
// ou via un futur écran d'administration) annule le marquage instantanément.
// ============================================================================

import pg from "pg";

const APPLIQUER = process.argv.includes("--apply");

const COLONNES = [
  "numero_vente", "date_vente", "identite", "formateur", "identite_client", "numero_tel",
  "interieur", "garage", "garage_indispo", "garage_refus", "entreprise_identite", "id_entreprise",
  "type", "loc", "achat", "semaine",
];

// Comparaison "NULL-safe" : deux valeurs absentes (null/undefined) sont
// considérées égales entre elles, comme le ferait IS NOT DISTINCT FROM en SQL.
function egal(a, b) {
  return (a ?? null) === (b ?? null);
}

function lignesIdentiques(a, b) {
  return COLONNES.every((c) => egal(a[c], b[c]));
}

async function calculerGroupesExacts(client) {
  const { rows } = await client.query(
    `SELECT id, ${COLONNES.join(", ")} FROM stats_logs_ventes
      WHERE numero_vente IS NOT NULL AND numero_vente <> ''
      ORDER BY numero_vente, id`
  );

  const parNumero = new Map();
  for (const r of rows) {
    if (!parNumero.has(r.numero_vente)) parNumero.set(r.numero_vente, []);
    parNumero.get(r.numero_vente).push(r);
  }

  const paires = []; // { ligneOriginaleId, ligneDoublonId }
  let nbGroupes = 0;

  for (const [, lignesDuNumero] of parNumero) {
    if (lignesDuNumero.length < 2) continue;
    // Regroupe par signature complète (16 colonnes, comparaison NULL-safe).
    const clusters = [];
    for (const ligne of lignesDuNumero) {
      const cluster = clusters.find((c) => lignesIdentiques(c[0], ligne));
      if (cluster) cluster.push(ligne);
      else clusters.push([ligne]);
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const tri = cluster.slice().sort((a, b) => a.id - b.id);
      const originale = tri[0];
      nbGroupes++;
      for (const doublon of tri.slice(1)) {
        paires.push({ ligneOriginaleId: originale.id, ligneDoublonId: doublon.id });
      }
    }
  }

  return { paires, nbGroupes };
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Recalcule les groupes EXACT à partir de l'état RÉEL et ACTUEL de la
    // base (jamais d'une liste figée) — si les données ont changé depuis le
    // rapport, ce calcul le reflète immédiatement.
    const { paires, nbGroupes } = await calculerGroupesExacts(client);

    if (nbGroupes !== 118 || paires.length !== 129) {
      throw new Error(
        `Écart avec le rapport validé : ${nbGroupes} groupes / ${paires.length} doublons ` +
        `trouvés (attendu : 118 groupes / 129 doublons). Les données ont dû changer depuis ` +
        `l'analyse — arrêt sans rien marquer, à ré-examiner avant de relancer.`
      );
    }

    // Aucune chaîne ni cycle : un id ne doit jamais être à la fois une
    // "originale" pour un groupe et un "doublon" pour un autre.
    const originales = new Set(paires.map((p) => p.ligneOriginaleId));
    const doublons = new Set(paires.map((p) => p.ligneDoublonId));
    for (const id of doublons) {
      if (originales.has(id)) {
        throw new Error(`Chaîne détectée : la ligne ${id} est à la fois une originale et un doublon — arrêt sans rien marquer.`);
      }
    }
    if (doublons.size !== paires.length) {
      throw new Error("Une même ligne apparaît comme doublon dans plusieurs paires — arrêt sans rien marquer.");
    }

    // Re-vérification individuelle : chaque paire existe encore et reste
    // identique sur les 16 colonnes (protège contre un changement survenu
    // pendant l'exécution du script elle-même, dans la même transaction).
    for (const { ligneOriginaleId, ligneDoublonId } of paires) {
      const { rows } = await client.query(
        `SELECT id, ${COLONNES.join(", ")} FROM stats_logs_ventes WHERE id = ANY($1::int[])`,
        [[ligneOriginaleId, ligneDoublonId]]
      );
      if (rows.length !== 2) {
        throw new Error(`Paire ${ligneOriginaleId}/${ligneDoublonId} : une des deux lignes n'existe plus — arrêt sans rien marquer.`);
      }
      const [a, b] = rows;
      if (!lignesIdentiques(a, b)) {
        throw new Error(`Paire ${ligneOriginaleId}/${ligneDoublonId} : les 16 colonnes ne correspondent plus — arrêt sans rien marquer.`);
      }
    }

    console.log(`Vérifié : ${nbGroupes} groupes, ${paires.length} doublons EXACT, aucune chaîne, toutes les paires ré-identiques.`);

    if (!APPLIQUER) {
      console.log("Simulation uniquement (pas d'argument --apply) : aucune écriture effectuée.");
      await client.query("ROLLBACK");
      return;
    }

    let inserees = 0;
    for (const { ligneOriginaleId, ligneDoublonId } of paires) {
      const r = await client.query(
        `INSERT INTO stats_ventes_doublons_marques
           (ligne_doublon_id, ligne_originale_id, classification, justification, marque_par)
         VALUES ($1, $2, 'EXACT', $3, 'script:marquer-doublons-exacts.js')
         ON CONFLICT (ligne_doublon_id) DO NOTHING`,
        [ligneDoublonId, ligneOriginaleId, `Copie exacte de la ligne ${ligneOriginaleId} sur les 16 colonnes comparées (numero_vente, date_vente, identite, formateur, identite_client, numero_tel, interieur, garage, garage_indispo, garage_refus, entreprise_identite, id_entreprise, type, loc, achat, semaine).`]
      );
      inserees += r.rowCount;
    }

    await client.query("COMMIT");
    console.log(`Terminé : ${inserees} nouveau(x) marquage(s) inséré(s), ${paires.length - inserees} déjà marqué(s) (idempotent).`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ANNULÉ (transaction entière annulée) :", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
