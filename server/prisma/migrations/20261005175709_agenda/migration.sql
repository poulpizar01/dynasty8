-- CreateTable
CREATE TABLE "evenements_agenda" (
    "id" SERIAL NOT NULL,
    "compte_id" INTEGER NOT NULL,
    "titre" VARCHAR(80) NOT NULL,
    "jour" DATE NOT NULL,
    "heure_debut" VARCHAR(5) NOT NULL,
    "heure_fin" VARCHAR(5) NOT NULL,
    "notes" VARCHAR(500) NOT NULL DEFAULT '',
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenements_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evenements_agenda_compte_id_jour_idx" ON "evenements_agenda"("compte_id", "jour");
