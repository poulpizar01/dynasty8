-- Nouvelle catégorie "Comptabilité" (réservée à la Direction) : chaque import
-- collé dans un panneau (ex : l'onglet "Tablettes") est conservé, en gardant
-- tout l'historique (rien n'est jamais écrasé) ; seul le plus récent par
-- "type" est affiché dans l'espace agent. "colonnes" et "lignes" sont des
-- tableaux JSON (texte), pour rester flexible sur la forme des données.
CREATE TABLE IF NOT EXISTS comptabilite_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'tablettes',
  colonnes TEXT NOT NULL,
  lignes TEXT NOT NULL,
  importe_par INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  importe_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compta_imports_type_date ON comptabilite_imports(type, importe_le DESC);
