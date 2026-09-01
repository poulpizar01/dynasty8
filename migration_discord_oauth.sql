-- Migration : passage de la connexion par code (DYN-XXXX-XXXX-XXXX) à la
-- connexion par Discord (OAuth). Voir src/index.js pour la nouvelle logique.
--
-- Ce que ça change pour les comptes existants : conformément au choix du
-- client ("on repart de zéro"), les 11 comptes actuels sont désactivés
-- (leurs anciens codes ne fonctionneront plus jamais) et masqués du nouvel
-- écran "Comptes & accès". Leurs données ne sont pas supprimées.

ALTER TABLE membres ADD COLUMN discord_id TEXT;       -- identifiant Discord permanent (numérique), lié à vie une fois connecté
ALTER TABLE membres ADD COLUMN discord_pseudo TEXT;    -- pseudo Discord exact (utilisé pour la pré-autorisation "Créer le compte")
ALTER TABLE membres ADD COLUMN statut TEXT NOT NULL DEFAULT 'valide';
-- statut possibles :
--   'attente'   -> quelqu'un s'est connecté via Discord mais personne ne l'attendait : en attente de validation par la Direction
--   'invite'    -> la Direction a pré-autorisé ce pseudo Discord via "Créer le compte", mais la personne ne s'est pas encore connectée
--   'valide'    -> compte pleinement actif (utilisé avec la colonne "actif" comme interrupteur supplémentaire)
--   'desactive' -> ancien compte (code d'accès), conservé mais invisible et inutilisable

CREATE UNIQUE INDEX IF NOT EXISTS idx_membres_discord_id ON membres(discord_id);

-- Coupe tous les anciens codes d'accès : on remplace code_hash par une valeur
-- aléatoire qu'aucun code saisi ne pourra jamais reproduire (la colonne doit
-- rester non-vide, on ne peut donc pas la mettre à NULL).
UPDATE membres SET code_hash = lower(hex(randomblob(32))), statut = 'desactive', actif = 0;
