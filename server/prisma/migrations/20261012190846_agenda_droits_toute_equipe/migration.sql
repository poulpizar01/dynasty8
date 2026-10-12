-- AlterTable
ALTER TABLE "agenda_droits_grades" ADD COLUMN     "consulter_tous" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "modifier_tous" BOOLEAN NOT NULL DEFAULT true;

-- Reproduit l'ancien accès en modification aux événements d'équipe, avant que ce droit soit réglable séparément.
UPDATE "agenda_droits_grades" SET "modifier_tous" = ("modifier" <> '');
