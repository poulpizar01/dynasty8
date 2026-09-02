-- Migration : agenda personnel de chaque membre (onglet « Mon agenda »)
-- Un événement appartient toujours à un seul membre (membre_id) : personne
-- d'autre ne peut le lire ni le modifier (voir la fonction agenda() dans
-- src/index.js, qui filtre systématiquement sur membre_id = session en cours).

CREATE TABLE IF NOT EXISTS evenements_agenda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  jour TEXT NOT NULL,          -- date au format AAAA-MM-JJ
  heure_debut TEXT NOT NULL,   -- heure au format HH:MM (24h)
  heure_fin TEXT NOT NULL,     -- heure au format HH:MM (24h)
  notes TEXT DEFAULT '',
  cree_le TEXT DEFAULT (datetime('now')),
  maj TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agenda_membre_jour ON evenements_agenda(membre_id, jour);
