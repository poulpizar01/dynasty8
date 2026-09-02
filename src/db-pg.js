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

export function creerPool(connectionString) {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString && connectionString.includes("railway.internal")
        ? false // réseau privé Railway : pas besoin de TLS entre services
        : { rejectUnauthorized: false },
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
