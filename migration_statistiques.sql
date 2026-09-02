-- Statistiques (§1-§10 : saisie des ventes/locations directement sur le site,
-- calcul des primes/commissions). Contrairement à une première version de ce
-- module, les ventes ne sont PAS lues depuis un Google Sheet externe : elles
-- sont enregistrées directement dans cette base (table stats_logs_ventes),
-- via un formulaire sur le site — la base D1 est la source de vérité.

-- §4 : référentiel des agents. C'est un référentiel DISTINCT des comptes de
-- connexion au site (table "membres") : un agent RP identifié par son pseudo
-- Discord n'a pas forcément de compte sur le site, et vice-versa.
CREATE TABLE IF NOT EXISTS stats_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_pseudo TEXT NOT NULL,
  discord_pseudo_normalise TEXT NOT NULL, -- trim + minuscules, calculé à l'écriture — clé de jointure avec les logs
  identite_rp TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL, -- Patron, Co Patron, Manager, Référent Immobilier, Agent Expert, Agent, Agent Novice, Stagiaire
  actif INTEGER NOT NULL DEFAULT 1,
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  maj TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stats_agents_pseudo_normalise ON stats_agents(discord_pseudo_normalise);

-- §5.4 : barèmes de primes (Ventes et Locations), paliers ajoutables/supprimables
-- sans redéploiement depuis l'écran admin.
CREATE TABLE IF NOT EXISTS stats_baremes_primes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('vente', 'location')),
  seuil INTEGER NOT NULL,
  montant INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stats_baremes_type ON stats_baremes_primes(type, seuil);

INSERT INTO stats_baremes_primes (type, seuil, montant) VALUES
  ('vente', 20, 10000), ('vente', 40, 15000), ('vente', 60, 20000), ('vente', 80, 25000), ('vente', 100, 30000),
  ('location', 20, 10000), ('location', 40, 30000), ('location', 60, 50000), ('location', 80, 60000), ('location', 100, 70000);

-- §5.5 / §5.8 : taux de commission par grade (initialisé à 48% partout, cf.
-- fiche) et salaire fixe hebdomadaire optionnel (NULL par défaut — Patron/Co
-- Patron touchent alors les primes normales du barème tant qu'il n'est pas
-- renseigné dans l'écran Paramètres, décision explicitement laissée à plus
-- tard par la Direction).
CREATE TABLE IF NOT EXISTS stats_taux_commission (
  grade TEXT PRIMARY KEY,
  taux REAL NOT NULL DEFAULT 0.48,
  salaire_fixe INTEGER
);
INSERT INTO stats_taux_commission (grade, taux, salaire_fixe) VALUES
  ('Patron', 0.48, NULL), ('Co Patron', 0.48, NULL), ('Manager', 0.48, NULL),
  ('Référent Immobilier', 0.48, NULL), ('Agent Expert', 0.48, NULL), ('Agent', 0.48, NULL),
  ('Agent Novice', 0.48, NULL), ('Stagiaire', 0.48, NULL);

-- Petit réglage général (§5.7 : formateur_compte_dans_quota : booléen).
CREATE TABLE IF NOT EXISTS stats_config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
INSERT INTO stats_config (cle, valeur) VALUES
  ('formateur_compte_dans_quota', '0');

-- §3 : le "Logs Vente" lui-même — une ligne par vente/location, saisie via un
-- formulaire sur le site (panneau Statistiques). Mêmes colonnes A à P que le
-- cahier des charges d'origine, pour rester compatible avec le moteur de
-- calcul (src/stats-calc.js, classifierLignes) sans le modifier : la colonne
-- P (semaine) reste saisie manuellement et fait toujours autorité, jamais
-- recalculée depuis la date (colonne B).
CREATE TABLE IF NOT EXISTS stats_logs_ventes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_vente TEXT NOT NULL DEFAULT '',
  date_vente TEXT NOT NULL DEFAULT '',        -- JJ/MM/AAAA
  identite TEXT NOT NULL DEFAULT '',           -- agent vendeur (colonne C)
  formateur TEXT NOT NULL DEFAULT '',
  identite_client TEXT NOT NULL DEFAULT '',
  numero_tel TEXT NOT NULL DEFAULT '',
  interieur TEXT NOT NULL DEFAULT '',
  garage TEXT NOT NULL DEFAULT '',
  garage_indispo TEXT NOT NULL DEFAULT '',
  garage_refus TEXT NOT NULL DEFAULT '',
  entreprise_identite TEXT NOT NULL DEFAULT '',
  id_entreprise TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',               -- "Vente" ou "Location"
  loc INTEGER,                                 -- durée/quantité si Location
  achat INTEGER NOT NULL DEFAULT 0,             -- montant de la facture
  semaine TEXT NOT NULL DEFAULT '',             -- ex "S36-26" — fait autorité
  cree_par INTEGER REFERENCES membres(id) ON DELETE SET NULL, -- NULL = import de l'historique
  cree_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stats_logs_ventes_semaine ON stats_logs_ventes(semaine);
CREATE INDEX IF NOT EXISTS idx_stats_logs_ventes_identite ON stats_logs_ventes(identite);
