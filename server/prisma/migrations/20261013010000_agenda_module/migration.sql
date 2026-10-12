CREATE TABLE "agenda_types" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(40) NOT NULL,
    "couleur" VARCHAR(7) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "agenda_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agenda_types_nom_key" ON "agenda_types"("nom");

CREATE TABLE "evenements_agenda" (
    "id" SERIAL NOT NULL,
    "compte_id" INTEGER,
    "auteur_nom" VARCHAR(64) NOT NULL DEFAULT '',
    "titre" VARCHAR(80) NOT NULL,
    "jour" DATE NOT NULL,
    "heure_debut" VARCHAR(5) NOT NULL,
    "heure_fin" VARCHAR(5) NOT NULL,
    "notes" VARCHAR(500) NOT NULL DEFAULT '',
    "type_id" INTEGER,
    "destination" VARCHAR(10) NOT NULL DEFAULT 'perso',
    "destination_grade" VARCHAR(20),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evenements_agenda_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evenements_agenda_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "agenda_types"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "evenements_agenda_compte_id_jour_idx" ON "evenements_agenda"("compte_id", "jour");
CREATE INDEX "evenements_agenda_destination_jour_idx" ON "evenements_agenda"("destination", "jour");

CREATE TABLE "agenda_droits_grades" (
    "grade" VARCHAR(20) NOT NULL,
    "consulter" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creer" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modifier" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consulter_tous" BOOLEAN NOT NULL DEFAULT false,
    "gerer_tous" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "agenda_droits_grades_pkey" PRIMARY KEY ("grade")
);
