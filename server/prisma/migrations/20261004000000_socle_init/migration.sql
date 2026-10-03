-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StatutCompte" AS ENUM ('attente', 'valide', 'refuse');

-- CreateTable
CREATE TABLE "comptes" (
    "id" SERIAL NOT NULL,
    "discord_id" VARCHAR(32) NOT NULL,
    "pseudo" VARCHAR(64) NOT NULL,
    "avatar" VARCHAR(128),
    "nom" VARCHAR(64),
    "grade" VARCHAR(20),
    "statut" "StatutCompte" NOT NULL DEFAULT 'attente',
    "proprietaire" BOOLEAN NOT NULL DEFAULT false,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connecte_le" TIMESTAMPTZ(6),
    "valide_le" TIMESTAMPTZ(6),
    "valide_par" INTEGER,

    CONSTRAINT "comptes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "cle" VARCHAR(20) NOT NULL,
    "libelle" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "couleur" VARCHAR(7),
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role_discord_id" VARCHAR(32),

    CONSTRAINT "grades_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "reglages" (
    "cle" VARCHAR(40) NOT NULL,
    "valeur" TEXT NOT NULL,

    CONSTRAINT "reglages_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "webhooks_recus" (
    "id" SERIAL NOT NULL,
    "empreinte" CHAR(64) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "contenu" JSONB NOT NULL,
    "recu_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "webhooks_recus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "comptes_discord_id_key" ON "comptes"("discord_id");

-- CreateIndex
CREATE INDEX "comptes_grade_idx" ON "comptes"("grade");

-- CreateIndex
CREATE UNIQUE INDEX "grades_role_discord_id_key" ON "grades"("role_discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_recus_empreinte_key" ON "webhooks_recus"("empreinte");

-- CreateIndex
CREATE INDEX "webhooks_recus_recu_le_idx" ON "webhooks_recus"("recu_le");

-- CreateIndex
CREATE INDEX "idx_session_expire" ON "session"("expire");

-- AddForeignKey
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_grade_fkey" FOREIGN KEY ("grade") REFERENCES "grades"("cle") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

