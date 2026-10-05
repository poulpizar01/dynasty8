-- CreateTable
CREATE TABLE "annonces" (
    "id" SERIAL NOT NULL,
    "compte_id" INTEGER,
    "titre" VARCHAR(120) NOT NULL,
    "texte" VARCHAR(4000) NOT NULL,
    "epingle" BOOLEAN NOT NULL DEFAULT false,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annonces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annonces_cree_le_idx" ON "annonces"("cree_le" DESC);

-- CreateIndex
CREATE INDEX "annonces_compte_id_idx" ON "annonces"("compte_id");

