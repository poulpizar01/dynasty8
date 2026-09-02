-- Catégorie "Statistiques" (§1 à §10 du cahier des charges) : lit le Google
-- Sheet "Logs Vente" en lecture seule, calcule et affiche — le Sheet reste la
-- source de vérité, ces tables ne sont qu'une couche de cache et de paramétrage.

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

-- Petits réglages généraux (§5.7 : formateur_compte_dans_quota : booléen ;
-- + le TTL du cache, ajustable sans redéploiement).
CREATE TABLE IF NOT EXISTS stats_config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
INSERT INTO stats_config (cle, valeur) VALUES
  ('formateur_compte_dans_quota', '0'),
  ('cache_ttl_secondes', '180');

-- §2 : cache côté serveur du dernier snapshot lu depuis Google Sheets, avec
-- "succes" qui indique si la DERNIÈRE tentative a réussi (permet d'afficher le
-- bandeau "synchronisation indisponible" même en servant un ancien snapshot).
CREATE TABLE IF NOT EXISTS stats_cache (
  cle TEXT PRIMARY KEY, -- 'logs_vente' pour l'instant, un seul onglet lu
  donnees TEXT NOT NULL, -- JSON : { lignes: [...], anomalies: [...] } déjà normalisé et typé
  nb_lignes INTEGER NOT NULL DEFAULT 0,
  recupere_le TEXT NOT NULL DEFAULT (datetime('now')),
  succes INTEGER NOT NULL DEFAULT 1,
  derniere_erreur TEXT
);

-- §6.3 : journal de synchronisation (dernière lecture, nombre de lignes,
-- anomalies détectées, déclenché automatiquement ou via le bouton Rafraîchir).
CREATE TABLE IF NOT EXISTS stats_journal_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lance_le TEXT NOT NULL DEFAULT (datetime('now')),
  succes INTEGER NOT NULL,
  nb_lignes INTEGER,
  nb_anomalies INTEGER,
  erreur TEXT,
  declenche_par INTEGER REFERENCES membres(id) ON DELETE SET NULL -- NULL = rafraîchissement automatique (cache expiré)
);
CREATE INDEX IF NOT EXISTS idx_stats_journal_sync_date ON stats_journal_sync(lance_le DESC);
