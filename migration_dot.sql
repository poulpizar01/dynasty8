-- Comptabilité -> DOT (§6.3 : la déclaration d'impôts hebdomadaire versée à la
-- "DOT", l'organisme fiscal du serveur RP). Barème officiel (paliers de
-- bénéfice -> taux d'imposition, + plafonds de salaire/prime autorisés par
-- palier) : identique pour toutes les entreprises du serveur, retrouvé sur le
-- document de référence partagé par la DOT — ce n'est PAS une décision propre
-- à Dynasty 8, donc rempli une fois ici plutôt que rendu éditable depuis
-- l'écran admin (si la DOT change son barème, on le mettra à jour à la main).
CREATE TABLE IF NOT EXISTS dot_bareme_imposition (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seuil_min INTEGER NOT NULL,
  seuil_max INTEGER NOT NULL,
  taux REAL NOT NULL,              -- ex 0.07 = 7%
  salaire_max_employe INTEGER NOT NULL,
  salaire_max_patron INTEGER NOT NULL,
  prime_max_employe INTEGER NOT NULL,
  prime_max_patron INTEGER NOT NULL
);
INSERT INTO dot_bareme_imposition (seuil_min, seuil_max, taux, salaire_max_employe, salaire_max_patron, prime_max_employe, prime_max_patron) VALUES
  (100, 9999, 0.07, 5000, 8000, 2500, 4000),
  (10000, 29999, 0.09, 10000, 15000, 5000, 7500),
  (30000, 49999, 0.16, 20000, 25000, 10000, 12500),
  (50000, 99999, 0.21, 35000, 40000, 17500, 20000),
  (100000, 249999, 0.23, 55000, 60000, 27500, 30000),
  (250000, 449999, 0.26, 65000, 70000, 32500, 35000),
  (450000, 599999, 0.29, 75000, 80000, 37500, 40000),
  (600000, 899999, 0.32, 85000, 90000, 42500, 45000),
  (900000, 1499999, 0.36, 95000, 100000, 47500, 50000),
  (1500000, 1799999, 0.38, 105000, 110000, 52500, 55000),
  (1800000, 2499999, 0.44, 115000, 125000, 57500, 62500),
  (2500000, 4999999, 0.47, 145000, 150000, 72500, 75000),
  (5000000, 99000000, 0.49, 155000, 170000, 77500, 85000);

-- Journal des dépenses déductibles et des retraits (les deux tableaux
-- "Dépense déductible" / "Tableau des retraits" du document DOT) — saisis à
-- la main par la Direction au fil de l'eau, une ligne à la fois.
CREATE TABLE IF NOT EXISTS compta_dot_ecritures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('depense', 'retrait')),
  date_ecriture TEXT NOT NULL DEFAULT '',  -- JJ/MM/AAAA, saisie libre (comme sur le document DOT)
  justificatif TEXT NOT NULL DEFAULT '',
  montant INTEGER NOT NULL DEFAULT 0,
  cree_par INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compta_dot_ecritures_type ON compta_dot_ecritures(type);
