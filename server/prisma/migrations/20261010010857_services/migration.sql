-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "service_id" VARCHAR(64) NOT NULL,
    "employe_nom" VARCHAR(120) NOT NULL DEFAULT '',
    "discord_id" VARCHAR(22),
    "employe_id" INTEGER,
    "mode" VARCHAR(60) NOT NULL DEFAULT '',
    "debut" TIMESTAMPTZ(6) NOT NULL,
    "fin" TIMESTAMPTZ(6),
    "cause_fin" VARCHAR(120) NOT NULL DEFAULT '',
    "fin_source" VARCHAR(8) NOT NULL DEFAULT '',
    "message_debut" VARCHAR(22),
    "message_fin" VARCHAR(22),
    "anomalie" VARCHAR(20) NOT NULL DEFAULT '',
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services_etat" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "salon_id" VARCHAR(22),
    "dernier_message_id" VARCHAR(22),
    "derniere_lecture" TIMESTAMPTZ(6),
    "statut" VARCHAR(10) NOT NULL DEFAULT '',
    "erreur" VARCHAR(300) NOT NULL DEFAULT '',
    "nb_lus" INTEGER NOT NULL DEFAULT 0,
    "nb_reconnus" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "services_etat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_service_id_key" ON "services"("service_id");

-- CreateIndex
CREATE INDEX "services_fin_debut_idx" ON "services"("fin", "debut");

-- CreateIndex
CREATE INDEX "services_employe_id_idx" ON "services"("employe_id");

-- CreateIndex
CREATE INDEX "services_anomalie_maj_le_idx" ON "services"("anomalie", "maj_le");
