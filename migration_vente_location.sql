-- Migration : permet à un bien d'être proposé à la vente ET à la location en même temps.
-- Avant : un bien avait un seul "transaction_type" ('vente' OU 'location').
-- Après : deux cases indépendantes dispo_vente / dispo_location, chacune avec son propre prix.
-- Cette migration ne touche à rien d'existant : elle ajoute des colonnes et reprend
-- automatiquement les données actuelles (aucune annonce n'est perdue ou modifiée en apparence).

ALTER TABLE biens ADD COLUMN prix_location INTEGER;
ALTER TABLE biens ADD COLUMN dispo_vente INTEGER NOT NULL DEFAULT 1;
ALTER TABLE biens ADD COLUMN dispo_location INTEGER NOT NULL DEFAULT 0;

UPDATE biens SET dispo_vente = 1, dispo_location = 0
  WHERE transaction_type = 'vente';

UPDATE biens SET dispo_vente = 0, dispo_location = 1, prix_location = prix
  WHERE transaction_type = 'location';
