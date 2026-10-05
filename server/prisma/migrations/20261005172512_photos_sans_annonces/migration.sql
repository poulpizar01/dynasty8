/*
  Warnings:

  - You are about to drop the `annonces` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "annonces";

-- CreateTable
CREATE TABLE "photos" (
    "id" SERIAL NOT NULL,
    "usage" VARCHAR(10) NOT NULL,
    "cle" VARCHAR(200) NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "cle_mini" VARCHAR(200) NOT NULL,
    "url_mini" VARCHAR(512) NOT NULL,
    "statut" VARCHAR(12) NOT NULL DEFAULT 'temporaire',
    "bien_id" INTEGER,
    "compte_id" INTEGER,
    "erreur" VARCHAR(300),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_url_key" ON "photos"("url");

-- CreateIndex
CREATE INDEX "photos_statut_maj_le_idx" ON "photos"("statut", "maj_le");

-- CreateIndex
CREATE INDEX "photos_bien_id_idx" ON "photos"("bien_id");
