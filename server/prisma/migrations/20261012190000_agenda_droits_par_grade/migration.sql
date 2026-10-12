-- Agenda : la visibilité par rôles Discord (Perso / Patrons / Direction / Tous) devient un destinataire (une personne,
-- tout le monde, ou un grade et ceux au-dessus) ; types d'événements (classement) ; plafonds par grade.
ALTER TABLE "evenements_agenda"
ADD COLUMN     "destination" VARCHAR(10) NOT NULL DEFAULT 'perso',
ADD COLUMN     "destination_grade" VARCHAR(20),
ADD COLUMN     "prevenu" VARCHAR(10) NOT NULL DEFAULT '',
ADD COLUMN     "type_id" INTEGER;

-- reprise : « Tous » → tout le monde ; « Patrons » et « Direction » → le grade le plus haut (personne ne voit plus
-- qu'avant ; la Direction rouvrira à qui il faut) ; un événement déjà posté dans un ticket l'a été par là
UPDATE "evenements_agenda" SET "destination" = 'tous' WHERE "visibilite" = 'tous';
UPDATE "evenements_agenda" SET "destination" = 'grade',
  "destination_grade" = (SELECT "cle" FROM "grades" ORDER BY "position", "libelle" LIMIT 1)
  WHERE "visibilite" IN ('patrons', 'direction');
UPDATE "evenements_agenda" SET "prevenu" = 'ticket' WHERE "discord_message_id" IS NOT NULL;

DROP INDEX "evenements_agenda_visibilite_jour_idx";
ALTER TABLE "evenements_agenda" DROP COLUMN "visibilite";

-- CreateTable
CREATE TABLE "agenda_types" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(40) NOT NULL,
    "couleur" VARCHAR(7) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agenda_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_droits_grades" (
    "grade" VARCHAR(20) NOT NULL,
    "consulter" VARCHAR(20) NOT NULL DEFAULT '',
    "creer" VARCHAR(20) NOT NULL DEFAULT '',
    "modifier" VARCHAR(20) NOT NULL DEFAULT '',

    CONSTRAINT "agenda_droits_grades_pkey" PRIMARY KEY ("grade")
);

-- CreateIndex
CREATE UNIQUE INDEX "agenda_types_nom_key" ON "agenda_types"("nom");

-- CreateIndex
CREATE INDEX "evenements_agenda_destination_jour_idx" ON "evenements_agenda"("destination", "jour");

-- AddForeignKey
ALTER TABLE "evenements_agenda" ADD CONSTRAINT "evenements_agenda_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "agenda_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
