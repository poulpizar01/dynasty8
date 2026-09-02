-- Schéma de la base de données Dynasty 8
-- (mêmes conventions que prisme-espace / roxwood-network : session par code d'accès)

CREATE TABLE IF NOT EXISTS membres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL,                       -- "identifiant" affiché partout sur le site — renommable par la Direction
  grade TEXT NOT NULL DEFAULT '',             -- un des 10 grades RP (voir GRADES dans layout.js / index.js) — détermine les droits d'accès
  code_hash TEXT NOT NULL,                    -- hérité de l'ancien système par code ; toujours rempli (valeur aléatoire) mais plus utilisé pour se connecter
  code_indice TEXT NOT NULL,                  -- hérité de l'ancien système par code ; plus utilisé
  actif INTEGER NOT NULL DEFAULT 1,           -- interrupteur : la Direction peut suspendre un compte sans le supprimer
  cree_le TEXT NOT NULL,
  derniere_visite TEXT,
  poste TEXT,                                 -- intitulé public affiché sur /equipe.html (ex: "Agent — Habitation")
  specialite TEXT,                            -- ex: "Villas & Maisons" — auto-édité par le membre
  bio TEXT,                                   -- biographie affichée sur la fiche « voir le profil »
  photo TEXT,                                 -- photo de profil (JPEG en base64, comme les photos de biens)
  linkedin TEXT,                              -- inutilisé (conservé pour compatibilité)
  discord_id TEXT,                            -- identifiant Discord permanent, lié à vie à la première connexion
  discord_pseudo TEXT,                        -- pseudo Discord exact — sert à la pré-autorisation ("Créer le compte")
  discord_avatar TEXT,                        -- adresse de la photo de profil Discord — mise à jour à chaque connexion
  statut TEXT NOT NULL DEFAULT 'attente'      -- 'attente' | 'invite' | 'valide' | 'desactive' — voir src/index.js
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_membres_discord_id ON membres(discord_id);

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
  vip TEXT NOT NULL DEFAULT '',      -- '' | 'vip' — statut VIP PLUS (informatif, boutique FlashbackFA)
  standing INTEGER NOT NULL DEFAULT 0, -- bien d'exception mis en avant sur /exclusifs.html
  auteur TEXT,
  cree_le TEXT NOT NULL,
  maj TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_biens_categorie ON biens(categorie);
CREATE INDEX IF NOT EXISTS idx_biens_disponible ON biens(disponible);

-- Agenda personnel (onglet « Mon agenda » de l'espace agents). Chaque événement
-- appartient à un seul membre ; personne d'autre ne peut le voir ni le modifier.
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

-- Messagerie interne (widget façon MSN) — conversations privées à deux uniquement.
CREATE TABLE IF NOT EXISTS messages_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expediteur_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'texte',   -- 'texte' | 'clin_oeil'
  contenu TEXT NOT NULL DEFAULT '',
  lu INTEGER NOT NULL DEFAULT 0,
  envoye_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_exp ON messages_chat(expediteur_id, destinataire_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_dest ON messages_chat(destinataire_id, expediteur_id);

CREATE TABLE IF NOT EXISTS presence (
  membre_id INTEGER PRIMARY KEY REFERENCES membres(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'disponible',  -- 'disponible' | 'absent' | 'occupe' | 'invisible'
  vu_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS frappe_chat (
  expediteur_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  destinataire_id INTEGER NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  jusqu_a TEXT NOT NULL,
  PRIMARY KEY (expediteur_id, destinataire_id)
);

-- Comptabilité (réservée à la Direction) : chaque import collé (ex: onglet
-- "Tablettes") est conservé, seul le plus récent par "type" est affiché.
CREATE TABLE IF NOT EXISTS comptabilite_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'tablettes',
  colonnes TEXT NOT NULL,   -- tableau JSON des titres de colonnes
  lignes TEXT NOT NULL,     -- tableau JSON de lignes (chacune : tableau de cellules)
  importe_par INTEGER REFERENCES membres(id) ON DELETE SET NULL,
  importe_le TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_compta_imports_type_date ON comptabilite_imports(type, importe_le DESC);
