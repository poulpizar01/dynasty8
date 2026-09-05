-- Schéma de la base de données Dynasty 8 — version PostgreSQL (Railway)
-- Convertie depuis schema.sql (SQLite / Cloudflare D1). Différences de traduction :
--   INTEGER PRIMARY KEY AUTOINCREMENT  ->  SERIAL PRIMARY KEY (auto-incrémenté par Postgres)
--   datetime('now')                    ->  to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')
--                                          (même format texte que produisait SQLite, pour ne rien
--                                           changer côté code JavaScript qui lit ces colonnes)
--   Les colonnes 0/1 (booléens "à la SQLite") restent en INTEGER, volontairement,
--   pour ne pas devoir toucher au code JS qui les compare à 0/1.

-- Sert uniquement à noter "telle réparation ponctuelle a déjà été appliquée",
-- pour ne jamais la rejouer deux fois par erreur (ex : import unique des
-- données réelles depuis Cloudflare).
CREATE TABLE IF NOT EXISTS migrations_appliquees (
  nom TEXT PRIMARY KEY,
  applique_le TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membres (
  id SERIAL PRIMARY KEY,
  pseudo TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  code_hash TEXT NOT NULL,
  code_indice TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL,
  derniere_visite TEXT,
  poste TEXT,
  specialite TEXT,
  bio TEXT,
  photo TEXT,
  linkedin TEXT,
  discord_id TEXT,
  discord_pseudo TEXT,
  discord_avatar TEXT,
  statut TEXT NOT NULL DEFAULT 'attente'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membres_discord_id ON membres(discord_id);

CREATE TABLE IF NOT EXISTS tentatives (
  ip TEXT PRIMARY KEY,
  nombre INTEGER NOT NULL,
  depuis INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS biens (
  id SERIAL PRIMARY KEY,
  categorie TEXT NOT NULL,
  sous_categorie TEXT,
  titre TEXT NOT NULL,
  zone TEXT,
  prix INTEGER NOT NULL DEFAULT 0,
  prix_location INTEGER,
  dispo_vente INTEGER NOT NULL DEFAULT 1,
  dispo_location INTEGER NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'vente',
  places INTEGER,
  description TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  coup_de_coeur INTEGER NOT NULL DEFAULT 0,
  disponible INTEGER NOT NULL DEFAULT 1,
  vendu INTEGER NOT NULL DEFAULT 0,
  vendu_le TEXT,
  meuble INTEGER NOT NULL DEFAULT 1,
  coherence TEXT,
  coffre_kg INTEGER,
  vip TEXT NOT NULL DEFAULT '',
  standing INTEGER NOT NULL DEFAULT 0,
  auteur TEXT,
  cree_le TEXT NOT NULL,
  maj TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_biens_categorie ON biens(categorie);
CREATE INDEX IF NOT EXISTS idx_biens_disponible ON biens(disponible);

CREATE TABLE IF NOT EXISTS evenements_agenda (
  id SERIAL PRIMARY KEY,
  membre_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  jour TEXT NOT NULL,
  heure_debut TEXT NOT NULL,
  heure_fin TEXT NOT NULL,
  notes TEXT DEFAULT '',
  cree_le TEXT DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  maj TEXT DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX IF NOT EXISTS idx_agenda_membre_jour ON evenements_agenda(membre_id, jour);

CREATE TABLE IF NOT EXISTS messages_chat (
  id SERIAL PRIMARY KEY,
  expediteur_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'texte',
  contenu TEXT NOT NULL DEFAULT '',
  lu INTEGER NOT NULL DEFAULT 0,
  envoye_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_exp ON messages_chat(expediteur_id, destinataire_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_dest ON messages_chat(destinataire_id, expediteur_id);

CREATE TABLE IF NOT EXISTS presence (
  membre_id INTEGER PRIMARY KEY REFERENCES membres(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'disponible',
  vu_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS frappe_chat (
  expediteur_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  jusqu_a TEXT NOT NULL,
  PRIMARY KEY (expediteur_id, destinataire_id)
);

CREATE TABLE IF NOT EXISTS comptabilite_imports (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'tablettes',
  colonnes TEXT NOT NULL,
  lignes TEXT NOT NULL,
  importe_par INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  importe_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_compta_imports_type_date ON comptabilite_imports(type, importe_le DESC);

CREATE TABLE IF NOT EXISTS stats_agents (
  id SERIAL PRIMARY KEY,
  discord_pseudo TEXT NOT NULL,
  discord_pseudo_normalise TEXT NOT NULL,
  identite_rp TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  maj TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_agents_pseudo_normalise ON stats_agents(discord_pseudo_normalise);

CREATE TABLE IF NOT EXISTS stats_baremes_primes (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('vente', 'location')),
  seuil INTEGER NOT NULL,
  montant INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stats_baremes_type ON stats_baremes_primes(type, seuil);

INSERT INTO stats_baremes_primes (type, seuil, montant)
SELECT * FROM (VALUES
  ('vente', 20, 10000), ('vente', 40, 15000), ('vente', 60, 20000), ('vente', 80, 25000), ('vente', 100, 30000),
  ('location', 20, 10000), ('location', 40, 30000), ('location', 60, 50000), ('location', 80, 60000), ('location', 100, 70000)
) AS v(type, seuil, montant)
WHERE NOT EXISTS (SELECT 1 FROM stats_baremes_primes);

CREATE TABLE IF NOT EXISTS stats_taux_commission (
  grade TEXT PRIMARY KEY,
  taux REAL NOT NULL DEFAULT 0.48,
  salaire_fixe INTEGER,
  salaire_actif INTEGER NOT NULL DEFAULT 0,
  prime_vente_active INTEGER NOT NULL DEFAULT 1,
  prime_location_active INTEGER NOT NULL DEFAULT 1
);
INSERT INTO stats_taux_commission (grade, taux, salaire_fixe, salaire_actif, prime_vente_active, prime_location_active)
SELECT * FROM (VALUES
  ('Patron', 0.48, NULL::INTEGER, 0, 1, 1), ('Co Patron', 0.48, NULL::INTEGER, 0, 1, 1), ('Manager', 0.48, NULL::INTEGER, 0, 1, 1),
  ('Référent Immobilier', 0.48, NULL::INTEGER, 0, 1, 1), ('Agent Expert', 0.48, NULL::INTEGER, 0, 1, 1), ('Agent', 0.48, NULL::INTEGER, 0, 1, 1),
  ('Agent Novice', 0.48, NULL::INTEGER, 0, 1, 1), ('Stagiaire', 0.48, NULL::INTEGER, 0, 0, 0)
) AS v(grade, taux, salaire_fixe, salaire_actif, prime_vente_active, prime_location_active)
ON CONFLICT (grade) DO NOTHING;

CREATE TABLE IF NOT EXISTS stats_config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
INSERT INTO stats_config (cle, valeur) VALUES ('formateur_compte_dans_quota', '0')
ON CONFLICT (cle) DO NOTHING;

CREATE TABLE IF NOT EXISTS stats_logs_ventes (
  id SERIAL PRIMARY KEY,
  numero_vente TEXT NOT NULL DEFAULT '',
  date_vente TEXT NOT NULL DEFAULT '',
  identite TEXT NOT NULL DEFAULT '',
  formateur TEXT NOT NULL DEFAULT '',
  identite_client TEXT NOT NULL DEFAULT '',
  numero_tel TEXT NOT NULL DEFAULT '',
  interieur TEXT NOT NULL DEFAULT '',
  garage TEXT NOT NULL DEFAULT '',
  garage_indispo TEXT NOT NULL DEFAULT '',
  garage_refus TEXT NOT NULL DEFAULT '',
  entreprise_identite TEXT NOT NULL DEFAULT '',
  id_entreprise TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  loc INTEGER,
  achat INTEGER NOT NULL DEFAULT 0,
  semaine TEXT NOT NULL DEFAULT '',
  cree_par INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  event_id TEXT,
  cree_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_stats_logs_ventes_semaine ON stats_logs_ventes(semaine);
CREATE INDEX IF NOT EXISTS idx_stats_logs_ventes_identite ON stats_logs_ventes(identite);
-- Ajoute la colonne si la table existait déjà avant ce champ (site déjà en
-- service) : sans danger, ne touche à aucune ligne existante. Doit passer
-- AVANT l'index ci-dessous, sinon celui-ci échoue sur une base où la table
-- existait déjà sans cette colonne.
ALTER TABLE stats_logs_ventes ADD COLUMN IF NOT EXISTS event_id TEXT;
-- Empêche le bot d'enregistrer deux fois la même vente s'il renvoie sa requête
-- après une coupure réseau. Partiel (WHERE event_id IS NOT NULL) pour ne jamais
-- gêner les lignes anciennes/saisies à la main, qui n'ont pas d'event_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_logs_ventes_event_id ON stats_logs_ventes(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS dot_bareme_imposition (
  id SERIAL PRIMARY KEY,
  seuil_min INTEGER NOT NULL,
  seuil_max INTEGER NOT NULL,
  taux REAL NOT NULL,
  salaire_max_employe INTEGER NOT NULL,
  salaire_max_patron INTEGER NOT NULL,
  prime_max_employe INTEGER NOT NULL,
  prime_max_patron INTEGER NOT NULL
);
INSERT INTO dot_bareme_imposition (seuil_min, seuil_max, taux, salaire_max_employe, salaire_max_patron, prime_max_employe, prime_max_patron)
SELECT * FROM (VALUES
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
  (5000000, 99000000, 0.49, 155000, 170000, 77500, 85000)
) AS v(seuil_min, seuil_max, taux, salaire_max_employe, salaire_max_patron, prime_max_employe, prime_max_patron)
WHERE NOT EXISTS (SELECT 1 FROM dot_bareme_imposition);

CREATE TABLE IF NOT EXISTS compta_dot_ecritures (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('depense', 'retrait')),
  date_ecriture TEXT NOT NULL DEFAULT '',
  justificatif TEXT NOT NULL DEFAULT '',
  montant INTEGER NOT NULL DEFAULT 0,
  cree_par INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  cree_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_compta_dot_ecritures_type ON compta_dot_ecritures(type);

-- Marquage réversible des ventes EXACT dupliquées (voir rapport local
-- doublons-ventes-detail-2026-09-03.md, hors dépôt). Ne touche jamais
-- stats_logs_ventes : marquer = insérer une ligne ici, annuler = la
-- supprimer. Exclue des calculs agrégés (paie, récap, statistiques) mais
-- reste sans effet sur l'historique brut/audit (Statistiques -> Ventes).
CREATE TABLE IF NOT EXISTS stats_ventes_doublons_marques (
  id SERIAL PRIMARY KEY,
  ligne_doublon_id INTEGER NOT NULL UNIQUE REFERENCES stats_logs_ventes(id) ON DELETE RESTRICT,
  ligne_originale_id INTEGER NOT NULL REFERENCES stats_logs_ventes(id) ON DELETE RESTRICT,
  classification TEXT NOT NULL,
  justification TEXT NOT NULL,
  marque_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  marque_par TEXT NOT NULL,
  CHECK (ligne_doublon_id <> ligne_originale_id)
);
CREATE INDEX IF NOT EXISTS idx_doublons_marques_originale ON stats_ventes_doublons_marques(ligne_originale_id);



-- ---- Retrait de l'intégration bot Discord "Roxwood Network" (sept. 2026) --
-- Plus utilisée (confirmé) : ni le journal d'événements, ni l'agrégation de
-- CA, ni le webhook "custom" (qui ne servait plus à enregistrer de ventes
-- réelles). DROP idempotent : sans effet si déjà exécuté une fois.
DROP TABLE IF EXISTS roxwood_transactions CASCADE;
DROP TABLE IF EXISTS roxwood_evenements CASCADE;
DROP TABLE IF EXISTS roxwood_config CASCADE;

-- ---- Synchronisation Google Sheets (recap primes par membre, "Mon profil") -
-- Lit un onglet précis d'un Google Sheets externe via son export CSV public
-- (partagé "Tous les utilisateurs disposant du lien - Lecteur"), sans API ni
-- identifiants Google côté serveur — voir src/google-sheets.js. Colonne D =
-- nom complet, E = grade, L = nb ventes, M = nb locations. Les MONTANTS de
-- primes ne sont volontairement PAS lus depuis le Sheet (colonnes N/O) : ils
-- sont recalculés à partir des mêmes barèmes que le reste du module
-- Statistiques (stats_baremes_primes), pour n'avoir qu'un seul endroit où
-- régler un montant de prime.
ALTER TABLE membres ADD COLUMN IF NOT EXISTS nom_sheet TEXT;

CREATE TABLE IF NOT EXISTS sync_sheet_agents (
  id SERIAL PRIMARY KEY,
  nom_sheet TEXT NOT NULL,
  nom_normalise TEXT NOT NULL,
  grade_sheet TEXT NOT NULL DEFAULT '',
  nb_ventes INTEGER NOT NULL DEFAULT 0,
  nb_locations INTEGER NOT NULL DEFAULT 0,
  membre_id INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  ligne_sheet INTEGER,
  maj TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_sync_sheet_agents_membre ON sync_sheet_agents(membre_id);

-- Une seule ligne (id verrouillé à 1) : état de la dernière synchronisation,
-- affiché dans Paramètres (date, succès/erreur, nb de lignes lues/appariées).
CREATE TABLE IF NOT EXISTS sync_sheet_etat (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  derniere_sync TEXT,
  statut TEXT NOT NULL DEFAULT '',
  erreur TEXT NOT NULL DEFAULT '',
  nb_lignes INTEGER NOT NULL DEFAULT 0,
  nb_apparies INTEGER NOT NULL DEFAULT 0
);
