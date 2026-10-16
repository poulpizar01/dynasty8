-- Colonnes de l'ancienne lecture du salon Discord des services, jamais écrites depuis que les prises et fins de service
-- arrivent du bot par webhook (monitoring.duty).
ALTER TABLE "services" DROP COLUMN "message_debut",
DROP COLUMN "message_fin",
DROP COLUMN "mode";

ALTER TABLE "services_etat" DROP COLUMN "dernier_message_id",
DROP COLUMN "erreur",
DROP COLUMN "nb_lus",
DROP COLUMN "salon_id",
DROP COLUMN "statut";
