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
  prix INTEGER NOT NULL DEFAULT 0,           -- prix de vente (utilisé si dispo_vente = 1)
  prix_location INTEGER,                     -- prix de location par semaine (utilisé si dispo_location = 1)
  dispo_vente INTEGER NOT NULL DEFAULT 1,    -- le bien est-il proposé à la vente ?
  dispo_location INTEGER NOT NULL DEFAULT 0, -- le bien est-il proposé à la location ? (les deux peuvent être actifs en même temps)
  transaction_type TEXT NOT NULL DEFAULT 'vente', -- conservé pour compatibilité, plus utilisé par l'affichage (voir dispo_vente / dispo_location)
  places INTEGER,                   -- nb de chambres / véhicules selon la catégorie
  description TEXT,
  images TEXT NOT NULL DEFAULT '[]', -- tableau JSON d'URLs d'images
  coup_de_coeur INTEGER NOT NULL DEFAULT 0,
  disponible INTEGER NOT NULL DEFAULT 1,
  vendu INTEGER NOT NULL DEFAULT 0,
  vendu_le TEXT,
  meuble INTEGER NOT NULL DEFAULT 1, -- pertinent uniquement pour la catégorie 'habitation'
  coherence TEXT,                    -- 'Habitation' | 'Garage' | 'Cayo Perico' | 'Roxwood'
  coffre_kg INTEGER,
  vip TEXT NOT NULL DEFAULT '',      -- '' | 'vip' | 'vip+' (informatif, boutique FlashbackFA)
  standing INTEGER NOT NULL DEFAULT 0, -- bien d'exception mis en avant sur /exclusifs.html
  auteur TEXT,
  cree_le TEXT NOT NULL,
  maj TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_biens_categorie ON biens(categorie);
CREATE INDEX IF NOT EXISTS idx_biens_disponible ON biens(disponible);
