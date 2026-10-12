-- Une seule permission couvre la création, la modification et la suppression des événements d'équipe.
UPDATE "agenda_droits_grades"
SET "modifier_tous" = "consulter_tous" AND ("modifier_tous" OR "creer_tous");

ALTER TABLE "agenda_droits_grades" DROP COLUMN "creer_tous";
