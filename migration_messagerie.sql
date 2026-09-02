-- Migration : messagerie interne temps réel (widget façon MSN, style Dynasty 8)
-- Conversations privées à deux (pas de groupes) — voir la fonction chat() dans
-- src/index.js, qui filtre toujours sur l'identité de la session en cours.

CREATE TABLE IF NOT EXISTS messages_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expediteur_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'texte',   -- 'texte' | 'clin_oeil' (le clin d'œil façon MSN, sans texte)
  contenu TEXT NOT NULL DEFAULT '',
  lu INTEGER NOT NULL DEFAULT 0,
  envoye_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_exp ON messages_chat(expediteur_id, destinataire_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_dest ON messages_chat(destinataire_id, expediteur_id);

-- Présence de chaque membre : statut choisi (disponible/absent/occupé/invisible)
-- + dernier signe de vie (mis à jour à chaque appel des routes /api/chat/*),
-- ce qui permet de savoir si quelqu'un est réellement en train de regarder la
-- messagerie en ce moment ou si son navigateur est simplement resté ouvert.
CREATE TABLE IF NOT EXISTS presence (
  membre_id INTEGER PRIMARY KEY REFERENCES membres(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'disponible',
  vu_le TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indicateur « X est en train d'écrire... » : une ligne = quelqu'un tape un
-- message à quelqu'un d'autre, valable quelques secondes seulement.
CREATE TABLE IF NOT EXISTS frappe_chat (
  expediteur_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  jusqu_a TEXT NOT NULL,
  PRIMARY KEY (expediteur_id, destinataire_id)
);
