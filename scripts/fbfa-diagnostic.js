// ============================================================================
// Diagnostic du stockage FBFA — SCRIPT MANUEL, LECTURE SEULE
// ----------------------------------------------------------------------------
// Sert à confirmer, avec le vrai jeton, les deux points que la documentation
// du service ne précise toujours pas, avant de s'en servir dans le site :
//   - le format exact de GET /api/usage (champs de quota et d'usage) ;
//   - si les éléments de GET /api/objects contiennent la CLÉ de l'objet
//     (seuls id et url sont documentés ; la clé est nécessaire pour retrouver
//     ou supprimer d'anciens fichiers).
// Les champs de GET /api/object/{clé} sont désormais documentés
// ({ id, url, size, mimeType }) : c'est sur « id » que repose le garde-fou
// avant suppression (src/medias.js).
// Aucune écriture, aucune suppression. Le jeton n'est jamais affiché.
//
//   node scripts/fbfa-diagnostic.js [--prefix dynasty8/] [--cle dynasty8/biens/…/x.jpg]
// ============================================================================

import { lireConfigMedias, creerClientDepuisConfig } from "../src/medias.js";

const args = process.argv.slice(2);
function option(nom) {
  const i = args.indexOf(nom);
  return i !== -1 ? args[i + 1] : undefined;
}

function decrire(valeur) {
  if (Array.isArray(valeur)) return `tableau(${valeur.length})`;
  if (valeur === null) return "null";
  return typeof valeur;
}

async function etape(nom, fn) {
  try {
    const resultat = await fn();
    console.log(`\n== ${nom} : OK`);
    console.log(JSON.stringify(resultat, null, 2));
  } catch (e) {
    console.log(`\n== ${nom} : ÉCHEC ${e.code || ""} ${e.status ? "HTTP " + e.status : ""} ${e.codeDistant || ""}`.trimEnd());
  }
}

async function main() {
  const config = lireConfigMedias(process.env);
  if (!config.token) throw new Error("FBFA_STORAGE_TOKEN n'est pas défini.");
  const client = creerClientDepuisConfig(config);
  console.log(`Service : ${client.origine} (jeton : défini)`);

  await etape("GET /api/usage (réponse brute)", () => client.usage());

  await etape("GET /api/objects (structure)", async () => {
    const liste = await client.lister({ prefix: option("--prefix") || `${config.prefixe}/`, limit: 3 });
    const premier = liste.items[0];
    return {
      nombre: liste.items.length,
      nextCursor: liste.nextCursor ? "présent" : "absent",
      champs_du_premier_element: premier && typeof premier === "object"
        ? Object.fromEntries(Object.entries(premier).map(([k, v]) => [k, decrire(v)]))
        : null,
      premier_element: premier ?? null,
    };
  });

  const cle = option("--cle");
  if (cle) await etape(`GET /api/object/${cle}`, () => client.metadonnees(cle));
}

main().catch((e) => {
  console.error("ÉCHEC :", (e && e.message) || e);
  process.exitCode = 1;
});
