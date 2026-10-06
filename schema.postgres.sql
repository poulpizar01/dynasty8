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

-- Héritage de l ancien système de code d accès (avant la connexion Discord) :
-- plus aucune ligne de code ne lit ni n écrit cette table. Conservée pour ne
-- pas perdre de données par surprise ; la limite de débit actuelle vit en
-- mémoire du processus (src/limite-debit.js).
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
-- Fiches créées automatiquement depuis le tableur de la Direction (voir
-- alignerReferentiel, src/google-sheets.js) : leur pseudo Discord n'est pas
-- connu, il est à compléter dans « Gérer les agents ». NULL plutôt que '' :
-- l'index unique ci-dessus accepte plusieurs NULL, pas plusieurs ''.
ALTER TABLE stats_agents ALTER COLUMN discord_pseudo_normalise DROP NOT NULL;

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

-- ---- Déconnexion réellement effective (sept. 2026) ----------------------
-- Le cookie de session est signé et vaut 12 h : jusqu'ici, « Se déconnecter »
-- ne faisait que l'effacer du navigateur. Un cookie copié avant restait donc
-- valable. Cette colonne note l'instant à partir duquel les sessions émises
-- AVANT ne sont plus acceptées (déconnexion, suspension d'un compte par la
-- Direction). Vide = aucune invalidation, comportement d'origine.
ALTER TABLE membres ADD COLUMN IF NOT EXISTS sessions_invalides_avant TEXT;

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

-- ---- Archives hebdomadaires du tableur (oct. 2026) -------------------------
-- Chaque dimanche à 23:59, heure de Paris, les « Chiffres du tableur » de la
-- semaine écoulée sont figés ici, sous le code de semaine du site (S41-26).
-- Les primes sont enregistrées telles qu'elles étaient ce jour-là : un
-- changement de barème ultérieur ne réécrit pas le passé. Voir
-- archiverSemaineSiDue (src/google-sheets.js).
CREATE TABLE IF NOT EXISTS tableur_archives (
  id SERIAL PRIMARY KEY,
  semaine TEXT NOT NULL UNIQUE,      -- code de semaine du site, ex. S41-26
  archive_le TEXT NOT NULL,          -- instant de l'archivage (ISO 8601, UTC)
  donnees_du TEXT NOT NULL,          -- dernière lecture du tableur figée ici
  en_retard INTEGER NOT NULL DEFAULT 0 -- 1 = archivée après coup (serveur arrêté dimanche soir)
);
CREATE TABLE IF NOT EXISTS tableur_archives_lignes (
  id SERIAL PRIMARY KEY,
  archive_id INTEGER NOT NULL REFERENCES tableur_archives(id) ON DELETE CASCADE,
  ligne_sheet INTEGER,
  nom TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  ventes INTEGER NOT NULL DEFAULT 0,
  locations INTEGER NOT NULL DEFAULT 0,
  prime_vente INTEGER NOT NULL DEFAULT 0,
  prime_locations INTEGER NOT NULL DEFAULT 0,
  fiche_pseudo TEXT,                 -- NULL : aucune fiche ; '' : fiche sans pseudo Discord
  compte TEXT                        -- compte du site relié, s'il y en a un
);
CREATE INDEX IF NOT EXISTS idx_tableur_archives_lignes_archive ON tableur_archives_lignes(archive_id);

-- ---- Médias hébergés sur storage.fbfa.fr (sept. 2026) ---------------------
-- Suivi de chaque fichier envoyé au stockage externe par ce site (photos
-- d'annonces et de profils) — voir src/medias.js pour le cycle de vie.
-- N'enregistre QUE les fichiers envoyés via ce mécanisme : une URL collée à
-- la main, une ancienne photo base64 ou une photo envoyée avant ce suivi ne
-- figure jamais ici, et ne peut donc jamais être supprimée par le nettoyage.
--
-- statut :
--   envoi        ligne créée juste AVANT l'envoi : l'objet distant existe peut-être
--   echec        envoi refusé par le service (rien n'a été stocké)
--   temporaire   envoyé, pas encore rattaché à un contenu enregistré
--   attache      référencé par au moins une annonce ou un profil
--   a_supprimer  plus aucune référence : suppression distante prévue à suppression_prevue_le
--   suppression  suppression distante en cours (plus aucun rattachement possible)
--   supprime     objet supprimé du stockage (ligne gardée pour l'historique)
--   conflit      l'objet distant ne correspond plus à cette ligne : jamais supprimé automatiquement
CREATE TABLE IF NOT EXISTS medias (
  id SERIAL PRIMARY KEY,
  cle TEXT NOT NULL,
  fbfa_id TEXT,
  url TEXT,
  taille INTEGER,
  mime TEXT,
  usage TEXT NOT NULL CHECK (usage IN ('bien', 'profil')),
  origine TEXT NOT NULL DEFAULT 'import' CHECK (origine IN ('import', 'migration')),
  statut TEXT NOT NULL DEFAULT 'envoi'
    CHECK (statut IN ('envoi', 'echec', 'temporaire', 'attache', 'a_supprimer', 'suppression', 'supprime', 'conflit')),
  auteur_id INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  empreinte TEXT,
  cree_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  maj TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  envoye_le TEXT,
  attache_le TEXT,
  suppression_prevue_le TEXT,
  supprime_le TEXT,
  tentatives_suppression INTEGER NOT NULL DEFAULT 0,
  derniere_erreur TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_medias_cle ON medias(cle);
CREATE UNIQUE INDEX IF NOT EXISTS idx_medias_url ON medias(url) WHERE url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medias_statut ON medias(statut, suppression_prevue_le);
CREATE INDEX IF NOT EXISTS idx_medias_auteur ON medias(auteur_id, statut);

-- Rattachement d'un média à une annonce OU à un profil. Un même média peut
-- avoir plusieurs lignes (même URL dans deux annonces, ou annonce + profil) :
-- il ne devient supprimable qu'une fois la DERNIÈRE ligne retirée.
CREATE TABLE IF NOT EXISTS medias_references (
  id SERIAL PRIMARY KEY,
  media_id INTEGER NOT NULL REFERENCES medias(id) ON DELETE CASCADE,
  bien_id INTEGER REFERENCES biens(id) ON DELETE CASCADE,
  membre_id INTEGER REFERENCES membres(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  cree_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  CHECK ((bien_id IS NULL) <> (membre_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_medias_ref_bien ON medias_references(media_id, bien_id) WHERE bien_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_medias_ref_membre ON medias_references(media_id, membre_id) WHERE membre_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medias_ref_bien_seul ON medias_references(bien_id);
CREATE INDEX IF NOT EXISTS idx_medias_ref_membre_seul ON medias_references(membre_id);

-- Sauvegarde des anciennes images base64 remplacées par une migration vers
-- storage.fbfa.fr, pour un retour arrière exact sans dépendre d'un dump.
-- Plus utilisée par le code depuis le retrait de l'outil de migration ;
-- conservée car elle peut contenir des données. Aucune clé étrangère vers
-- biens / membres : la sauvegarde survit à la suppression d'une annonce.
CREATE TABLE IF NOT EXISTS medias_migration_sauvegarde (
  id SERIAL PRIMARY KEY,
  table_cible TEXT NOT NULL CHECK (table_cible IN ('biens', 'membres')),
  ligne_id INTEGER NOT NULL,
  position INTEGER,
  ancienne_valeur TEXT NOT NULL,
  empreinte TEXT NOT NULL,
  nouvelle_url TEXT NOT NULL,
  media_id INTEGER REFERENCES medias(id) ON DELETE SET NULL,
  migre_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  annule_le TEXT
);
CREATE INDEX IF NOT EXISTS idx_medias_migration_cible ON medias_migration_sauvegarde(table_cible, ligne_id);

-- ---- Bot « Roxwood Network Entreprise » (sept. 2026) -----------------------
-- Journal des événements que poussait le bot Discord. L'onglet et la route
-- de réception ont été retirés (oct. 2026) ; la table reste en place pour ne
-- perdre aucune donnée déjà reçue, mais plus rien ne la lit ni ne l'écrit.
CREATE TABLE IF NOT EXISTS bot_roxwood_evenements (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,            -- serveur Discord d'origine
  type_evenement TEXT NOT NULL,      -- ex : recruitment.updated, monitoring.duty...
  cle_objet TEXT,                    -- ticketId / requestId / orderId : dernier état connu par objet
  charge JSONB NOT NULL,             -- le "payload" du bot, tel quel
  empreinte TEXT NOT NULL UNIQUE,    -- sha256 du corps brut : un renvoi identique ne crée pas de doublon
  envoye_le TEXT,                    -- "sentAt" du bot (ISO 8601)
  recu_le TEXT NOT NULL              -- horodatage de réception côté site
);
CREATE INDEX IF NOT EXISTS idx_bot_roxwood_type ON bot_roxwood_evenements(type_evenement, id DESC);
CREATE INDEX IF NOT EXISTS idx_bot_roxwood_objet ON bot_roxwood_evenements(type_evenement, cle_objet, id DESC);

-- ============================================================================
-- RH : la fiche employé, source de vérité (oct. 2026) — voir src/rh.js
-- ----------------------------------------------------------------------------
-- Une seule fiche par employé. Les autres modules (ventes, DOT, tableur,
-- statistiques) ne gardent que la clé de la fiche (employe_id) et lisent ici
-- le nom, le grade, le statut… : une modification RH s'y répercute partout,
-- sans copie à tenir à jour.
--   id         : clé interne, celle de toutes les liaisons entre tables ;
--   id_employe : identifiant métier saisi par RH (ex. D8-0042), unique.
-- Jamais supprimée : un départ = statut « inactif », historique conservé.
-- ============================================================================
CREATE TABLE IF NOT EXISTS employes (
  id SERIAL PRIMARY KEY,
  id_employe TEXT NOT NULL,
  id_provisoire INTEGER NOT NULL DEFAULT 0,   -- 1 = attribué à la reprise de l'existant, à remplacer
  prenom TEXT NOT NULL DEFAULT '',
  nom TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',         -- donnée sensible (permission « sensible »)
  rib TEXT NOT NULL DEFAULT '',               -- donnée sensible (permission « sensible »)
  discord_id TEXT,                            -- identifiant Discord numérique
  discord_pseudo TEXT NOT NULL DEFAULT '',    -- pseudo envoyé par le bot avec les ventes
  discord_pseudo_normalise TEXT,
  grade TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
  date_arrivee TEXT NOT NULL DEFAULT '',      -- AAAA-MM-JJ
  date_depart TEXT NOT NULL DEFAULT '',       -- AAAA-MM-JJ, vide tant qu'il est là
  reprise_agent_id INTEGER,                   -- fiche stats_agents d'origine (reprise oct. 2026)
  cree_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  maj TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_id_employe ON employes(lower(id_employe));
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_discord_id ON employes(discord_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_pseudo ON employes(discord_pseudo_normalise);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_reprise ON employes(reprise_agent_id);
CREATE INDEX IF NOT EXISTS idx_employes_statut_grade ON employes(statut, grade);

-- Reprise de l'existant, UNE SEULE FOIS (repère rh_reprise_faite) : ensuite,
-- seul RH crée des fiches. Les ID employé ainsi attribués (PROV-…) sont
-- provisoires, à remplacer depuis la fiche.
--  1. les fiches agents (stats_agents) : identité RP coupée en prénom / nom ;
INSERT INTO employes (id_employe, id_provisoire, prenom, nom, discord_pseudo, discord_pseudo_normalise, grade, statut, reprise_agent_id)
SELECT 'PROV-' || lpad(a.id::text, 4, '0'), 1,
       split_part(btrim(a.identite_rp), ' ', 1),
       btrim(substr(btrim(a.identite_rp), length(split_part(btrim(a.identite_rp), ' ', 1)) + 1)),
       a.discord_pseudo, NULLIF(a.discord_pseudo_normalise, ''),
       a.grade, CASE WHEN a.actif = 1 THEN 'actif' ELSE 'inactif' END, a.id
  FROM stats_agents a
 WHERE NOT EXISTS (SELECT 1 FROM employes e WHERE e.reprise_agent_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM stats_config c WHERE c.cle = 'rh_reprise_faite');
--  2. les vendeurs de l'historique sans fiche (anciens employés) : fiches
--     « inactif », pour que leurs ventes restent rattachées à quelqu'un.
INSERT INTO employes (id_employe, id_provisoire, discord_pseudo, discord_pseudo_normalise, grade, statut)
SELECT 'PROV-V' || lpad((row_number() OVER (ORDER BY v.normalise))::text, 4, '0'), 1, v.pseudo, v.normalise, 'Agent', 'inactif'
  FROM (SELECT min(btrim(identite)) AS pseudo, lower(btrim(identite)) AS normalise
          FROM stats_logs_ventes WHERE btrim(identite) <> '' GROUP BY lower(btrim(identite))) v
 WHERE NOT EXISTS (SELECT 1 FROM employes e WHERE e.discord_pseudo_normalise = v.normalise)
   AND NOT EXISTS (SELECT 1 FROM stats_config c WHERE c.cle = 'rh_reprise_faite');
INSERT INTO stats_config (cle, valeur) VALUES ('rh_reprise_faite', to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
ON CONFLICT (cle) DO NOTHING;

-- Liaisons par clé de fiche : chaque module garde ses propres données et ne
-- pointe que vers l'employé.
ALTER TABLE stats_logs_ventes ADD COLUMN IF NOT EXISTS employe_id INTEGER REFERENCES employes(id) ON DELETE SET NULL;
ALTER TABLE stats_logs_ventes ADD COLUMN IF NOT EXISTS formateur_employe_id INTEGER REFERENCES employes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stats_logs_ventes_employe ON stats_logs_ventes(employe_id);
ALTER TABLE sync_sheet_agents ADD COLUMN IF NOT EXISTS employe_id INTEGER REFERENCES employes(id) ON DELETE SET NULL;
ALTER TABLE tableur_archives_lignes ADD COLUMN IF NOT EXISTS employe_id INTEGER REFERENCES employes(id) ON DELETE SET NULL;
-- Ventes encore sans employé : rattachées par le pseudo Discord de la fiche
-- (rejouable, ne touche que les ventes non rattachées). Les nouvelles ventes
-- sont rattachées dès leur arrivée (voir statsEnregistrerVente).
UPDATE stats_logs_ventes v SET employe_id = e.id FROM employes e
 WHERE v.employe_id IS NULL AND btrim(v.identite) <> '' AND e.discord_pseudo_normalise = lower(btrim(v.identite));
UPDATE stats_logs_ventes v SET formateur_employe_id = e.id FROM employes e
 WHERE v.formateur_employe_id IS NULL AND btrim(v.formateur) <> '' AND e.discord_pseudo_normalise = lower(btrim(v.formateur));

-- Permissions RH, paramétrables par grade depuis l'onglet RH. Patron,
-- Co Patron et Développeur web les ont toujours toutes (et sont seuls à
-- pouvoir les régler) : personne ne peut s'enlever l'accès par erreur.
-- Valeurs de départ posées une seule fois (repère rh_permissions_initialisees),
-- pour qu'un droit retiré ne revienne pas à la migration suivante.
CREATE TABLE IF NOT EXISTS rh_permissions (
  grade TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('voir', 'creer', 'modifier', 'desactiver', 'reactiver', 'sensible')),
  PRIMARY KEY (grade, permission)
);
INSERT INTO rh_permissions (grade, permission)
SELECT d.grade, d.permission
  FROM (VALUES ('DRH', 'voir'), ('DRH', 'creer'), ('DRH', 'modifier'), ('DRH', 'desactiver'), ('DRH', 'reactiver'), ('DRH', 'sensible'),
               ('Manager', 'voir'), ('Manager', 'creer'), ('Manager', 'modifier'), ('Manager', 'desactiver'), ('Manager', 'reactiver'),
               ('Secrétaire de Direction', 'voir'), ('Secrétaire de Direction', 'creer'), ('Secrétaire de Direction', 'modifier'))
       AS d(grade, permission)
 WHERE NOT EXISTS (SELECT 1 FROM stats_config c WHERE c.cle = 'rh_permissions_initialisees')
ON CONFLICT DO NOTHING;
INSERT INTO stats_config (cle, valeur) VALUES ('rh_permissions_initialisees', '1') ON CONFLICT (cle) DO NOTHING;

-- Réglages du site modifiables dans l'onglet Paramètres (Patron, Co Patron,
-- Développeur web) : tous les liens — WebMap, document des cohérences,
-- Google Sheets de la synchronisation, registre, Discord, boutique... Aucune
-- adresse n'est écrite dans le code (voir src/reglages.js). Pour la WebMap,
-- les cohérences et le Google Sheets, une valeur vide laisse servir la
-- variable du .env.
CREATE TABLE IF NOT EXISTS reglages_site (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL DEFAULT '',
  maj TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  maj_par TEXT NOT NULL DEFAULT ''
);
-- Valeurs de départ : les liens qui étaient écrits dans les pages avant ce
-- réglage. Posées une seule fois — une ligne existante (même vidée dans
-- l'onglet Paramètres) n'est jamais réécrite.
INSERT INTO reglages_site (cle, valeur) VALUES
  ('discord_agence', 'https://discord.com/invite/zCsPrrR3uw'),
  ('boutique_vip', 'https://boutique.flashbackfa.fr/category/2099202'),
  ('discord_partenaire_deco', 'https://discord.gg/e8Ah54yvuw'),
  ('prestataire_site', 'https://roxwood-network.fbfa.fr/'),
  ('prestataire_discord', 'https://discord.com/invite/dDAFWxeU8'),
  ('registre_url', 'https://intra.dynasty8.fbfa.fr/login')
ON CONFLICT (cle) DO NOTHING;

-- Réglages RH modifiables depuis l'espace agents (Patron, Co Patron,
-- Développeur web) : rien de propre à l'agence n'est écrit dans le code.
--   bot_grade_arrivee    grade donné aux candidatures acceptées par le bot
--   bot_serveur_discord  ID du serveur Discord dont le bot peut envoyer des
--                        candidatures (vide = pas de contrôle)
--   question_*           libellé de la question du formulaire du bot qui
--                        donne chaque champ de la fiche (voir src/rh.js)
CREATE TABLE IF NOT EXISTS rh_reglages (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL DEFAULT ''
);

-- Candidatures acceptées reçues du bot Discord (webhook recruitment.updated,
-- POST /api/rh/bot/candidatures, voir src/rh.js). Une ligne par ticket : un
-- renvoi du même ticket ne crée jamais une deuxième fiche. « charge » garde
-- les réponses du formulaire d'un ticket à traiter (réglage manquant...),
-- 30 jours au plus, et est effacée dès que la fiche est créée.
CREATE TABLE IF NOT EXISTS rh_arrivees_bot (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL UNIQUE,
  serveur_discord TEXT NOT NULL DEFAULT '',
  discord_id TEXT NOT NULL DEFAULT '',
  nom_recu TEXT NOT NULL DEFAULT '',
  resultat TEXT NOT NULL,
  motif TEXT NOT NULL DEFAULT '',
  employe_id INTEGER REFERENCES employes(id) ON DELETE SET NULL,
  recu_le TEXT NOT NULL DEFAULT (to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX IF NOT EXISTS idx_rh_arrivees_bot_recu ON rh_arrivees_bot(id DESC);
ALTER TABLE rh_arrivees_bot ADD COLUMN IF NOT EXISTS charge TEXT;
ALTER TABLE rh_arrivees_bot ADD COLUMN IF NOT EXISTS accepte_le TEXT NOT NULL DEFAULT '';
-- États d'un ticket : creee, existante (le compte avait déjà une fiche),
-- refusee (« à traiter » : réglage manquant...), attente (embauche constatée
-- en jeu, à approuver), ecartee. La première version de la table n'en
-- connaissait que trois : sa contrainte est remplacée par celle-ci.
ALTER TABLE rh_arrivees_bot DROP CONSTRAINT IF EXISTS rh_arrivees_bot_resultat_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_arrivees_bot_resultat_valide') THEN
    ALTER TABLE rh_arrivees_bot ADD CONSTRAINT rh_arrivees_bot_resultat_valide
      CHECK (resultat IN ('creee', 'existante', 'refusee', 'attente', 'ecartee'));
  END IF;
END $$;

-- ============================================================================
-- Compte applicatif restreint — À GARDER EN DERNIER DANS CE FICHIER
-- ----------------------------------------------------------------------------
-- Le site tourne avec un compte qui peut lire et écrire les données, mais
-- jamais créer ni supprimer de table. Ce bloc le crée (ou met à jour son mot
-- de passe) et lui accorde ses droits, avec le compte administrateur.
--
-- En production, il est exécuté par le service « migration » du compose :
-- psql (image postgres) lit ce fichier, et reçoit le nom et le mot de passe
-- du compte par PGOPTIONS, sous forme de réglages de session :
--   -c dynasty8.compte_app=…  -c dynasty8.mdp_app=…  -c dynasty8.exiger_compte_app=on
-- Le mot de passe n'apparaît donc jamais dans le texte d'une instruction (ni
-- dans les journaux de PostgreSQL).
--
-- Sans ces réglages — serveur local qui applique lui-même ce fichier
-- (DB_SCHEMA_AUTO=1), tests — le bloc ne fait rien.
-- ============================================================================
DO $$
DECLARE
  compte text := nullif(current_setting('dynasty8.compte_app', true), '');
  mdp    text := nullif(current_setting('dynasty8.mdp_app', true), '');
  exige  boolean := coalesce(current_setting('dynasty8.exiger_compte_app', true), '') = 'on';
BEGIN
  IF compte IS NULL THEN
    IF exige THEN
      RAISE EXCEPTION 'APP_DB_USER n''est pas défini : le site doit tourner avec un compte PostgreSQL restreint (voir .env.example).';
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = compte) THEN
    IF mdp IS NULL THEN
      RAISE EXCEPTION 'APP_DB_PASSWORD est obligatoire pour créer le compte applicatif « % ».', compte;
    END IF;
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', compte, mdp);
  ELSIF mdp IS NOT NULL THEN
    EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L', compte, mdp);
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), compte);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', compte);
  -- Jamais de droit de création : c'est tout l'intérêt de ce compte.
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', compte);
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', compte);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', compte);
  -- Tables et séquences ajoutées plus tard par l'administrateur : droits d'office.
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', current_user, compte);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', current_user, compte);

  -- Contrôle final : si le compte peut encore créer des tables, la migration
  -- échoue, et le site (qui en dépend) ne démarre pas.
  IF has_schema_privilege(compte, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'le compte applicatif « % » peut encore créer des tables : droits à revoir.', compte;
  END IF;
END $$;
