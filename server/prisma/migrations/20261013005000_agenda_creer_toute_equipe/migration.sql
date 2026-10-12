-- Rend explicite le droit de créer un événement partagé avec toute l'équipe.
ALTER TABLE "agenda_droits_grades"
  ADD COLUMN "creer_tous" BOOLEAN NOT NULL DEFAULT false;

-- Avant cette migration, tout droit de création par grade autorisait aussi cette destination.
UPDATE "agenda_droits_grades"
SET "creer_tous" = CARDINALITY("creer") > 0;
