// ============================================================================
// Adaptateur PostgreSQL "compatible D1"
// ----------------------------------------------------------------------------
// Tout le reste du code (src/index.js) a été écrit pour l'API Cloudflare D1 :
//   env.DB.prepare(sql).bind(...valeurs).first() / .all() / .run()
// Plutôt que de réécrire des centaines de requêtes SQL à la main (risque
// d'erreur sur des calculs qui touchent à de l'argent réel), cet adaptateur
// reproduit exactement la même API par-dessus PostgreSQL (via le paquet "pg"),
// et traduit au passage les quelques différences de syntaxe SQLite -> Postgres
// (placeholders ?1/?2, datetime('now'), génération de valeur aléatoire).
// ============================================================================

import pg from "pg";

const { Pool } = pg;

let pool = null;

// Décide si la connexion PostgreSQL doit passer par TLS.
// - PGSSL=disable (ou false/off) force l'absence de TLS, quelle que soit
//   l'adresse : utile pour un PostgreSQL voisin dans le même docker-compose
//   (VPS), qui n'a aucun certificat configuré.
// - PGSSL=require (ou true/on) force le TLS (certificat non vérifié, comme
//   avant), quelle que soit l'adresse.
// - Sans réglage explicite : détection automatique. Un hôte "interne" (le
//   réseau privé Railway railway.internal, un conteneur voisin nommé
//   "postgres" en docker-compose, ou localhost/127.0.0.1 en local) n'a pas
//   besoin de TLS ; toute autre adresse (base distante, "vraie" URL
//   publique) le garde activé.
export function calculerSSL(connectionString) {
  const force = (process.env.PGSSL || "").trim().toLowerCase();
  if (["disable", "false", "off"].includes(force)) return false;
  if (["require", "true", "on"].includes(force)) return { rejectUnauthorized: false };

  if (!connectionString) return { rejectUnauthorized: false };
  const hoteInterne = /@(?:[^/]*\.railway\.internal|postgres|localhost|127\.0\.0\.1)(?::|\/)/i.test(connectionString);
  return hoteInterne ? false : { rejectUnauthorized: false };
}

export function creerPool(connectionString) {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: calculerSSL(connectionString),
    });

    // Sans ce filet, une connexion inactive du pool qui se coupe (coupure
    // réseau ponctuelle, maintenance de la base...) fait planter tout le
    // processus Node (erreur "error" non écoutée sur le pool). Ici, on se
    // contente de journaliser (sans jamais inclure connectionString, qui
    // contient le mot de passe) : le pool retire lui-même la connexion
    // cassée et en ouvrira une nouvelle au prochain besoin — aucune
    // reconnexion manuelle ni boucle à gérer ici, et les erreurs de requête
    // (mauvais SQL, contrainte violée...) ne passent jamais par cet
    // événement : elles restent rejetées sur leur propre promesse, gérées
    // par l'appelant comme avant.
    pool.on("error", (err) => {
      console.error("Connexion PostgreSQL inactive perdue (pool) :", err.message);
    });
  }
  return pool;
}

// Traduit une requête écrite en syntaxe SQLite/D1 vers PostgreSQL.
function traduireSQL(sqlBrut) {
  let sql = sqlBrut;

  // datetime('now')  ->  horodatage texte au même format que produisait SQLite
  // datetime('now', '+4 seconds' | '-25 seconds')  ->  idem avec décalage
  sql = sql.replace(
    /datetime\(\s*'now'\s*(?:,\s*'([+-]\d+)\s+(\w+)')?\s*\)/gi,
    (match, offset, unite) => {
      if (!offset) return `to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`;
      const signe = offset.startsWith("-") ? "-" : "+";
      const nombre = offset.replace(/^[+-]/, "");
      return `to_char(now() at time zone 'utc' ${signe} interval '${nombre} ${unite}', 'YYYY-MM-DD HH24:MI:SS')`;
    }
  );

  // lower(hex(randomblob(N))) -> chaîne hexadécimale aléatoire équivalente
  // (utilisé uniquement pour remplir un champ hérité non utilisé pour l'authentification réelle)
  sql = sql.replace(
    /lower\(\s*hex\(\s*randomblob\(\s*\d+\s*\)\s*\)\s*\)/gi,
    `(md5(random()::text) || md5(clock_timestamp()::text))`
  );

  // "colonne COLLATE NOCASE" (tri insensible à la casse, syntaxe SQLite) -> lower(colonne)
  sql = sql.replace(/(\S+)\s+COLLATE\s+NOCASE/gi, "lower($1)");

  // Placeholders positionnels ?1, ?2... -> $1, $2... (syntaxe Postgres)
  sql = sql.replace(/\?(\d+)/g, "$$$1");

  return sql;
}

export { traduireSQL };

function estInsert(sql) {
  return /^\s*insert\s/i.test(sql);
}

// Ajoute "RETURNING id" à une requête INSERT qui n'en a pas déjà, pour pouvoir
// reproduire meta.last_row_id comme le fait D1 après une insertion.
function avecRetourId(sql) {
  if (!estInsert(sql)) return sql;
  if (/returning/i.test(sql)) return sql;
  return sql.replace(/;?\s*$/, " RETURNING id");
}

class Instruction {
  constructor(sqlBrut) {
    this.sqlBrut = sqlBrut;
    this.valeurs = [];
  }

  bind(...valeurs) {
    this.valeurs = valeurs;
    return this;
  }

  async first() {
    const sql = traduireSQL(this.sqlBrut);
    const r = await creerPool().query(sql, this.valeurs);
    return r.rows[0] || null;
  }

  async all() {
    const sql = traduireSQL(this.sqlBrut);
    const r = await creerPool().query(sql, this.valeurs);
    return { results: r.rows, success: true };
  }

  async run() {
    const sql = traduireSQL(avecRetourId(this.sqlBrut));
    const r = await creerPool().query(sql, this.valeurs);
    const dernierId = estInsert(this.sqlBrut) && r.rows[0] ? r.rows[0].id : undefined;
    return { success: true, meta: { last_row_id: dernierId, changes: r.rowCount } };
  }
}

export function creerAdaptateurDB() {
  return {
    prepare(sql) {
      return new Instruction(sql);
    },
  };
}
