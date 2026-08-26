-- Schéma de la base de données Dynasty 8
-- (mêmes conventions que prisme-espace / roxwood-network : session par code d'accès)

CREATE TABLE IF NOT EXISTS membres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT 'Agent',       -- 'Direction' ou 'Agent'
  code_hash TEXT NOT NULL,
  code_indice TEXT NOT NULL,                  -- 4 derniers caractères du code, pour l'affichage
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL,
  derniere_visite TEXT
);

CREATE TABLE IF NOT EXISTS tentatives (
  ip TEXT PRIMARY KEY,
  nombre INTEGER NOT NULL,
  depuis INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS biens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categorie TEXT NOT NULL,          -- 'habitation' | 'garage'
  sous_categorie TEXT,              -- pour 'habitation' uniquement, ex: 'Eclipse Tower', 'Villa'...
  titre TEXT NOT NULL,
  zone TEXT,                        -- conservé pour compatibilité, plus utilisé par le formulaire
  prix INTEGER NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'vente', -- 'vente' | 'location'
  places INTEGER,                   -- nb de chambres / véhicules selon la catégorie
  description TEXT,
  images TEXT NOT NULL DEFAULT '[]', -- tableau JSON d'URLs d'images
  coup_de_coeur INTEGER NOT NULL DEFAULT 0,
  disponible INTEGER NOT NULL DEFAULT 1,
  auteur TEXT,
  cree_le TEXT NOT NULL,
  maj TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_biens_categorie ON biens(categorie);
CREATE INDEX IF NOT EXISTS idx_biens_disponible ON biens(disponible);
