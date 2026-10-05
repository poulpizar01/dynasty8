-- CreateTable
CREATE TABLE "biens" (
    "id" SERIAL NOT NULL,
    "categorie" VARCHAR(20) NOT NULL,
    "sous_categorie" VARCHAR(40),
    "titre" VARCHAR(120) NOT NULL,
    "zone" VARCHAR(80),
    "prix" INTEGER NOT NULL DEFAULT 0,
    "prix_location" INTEGER,
    "dispo_vente" BOOLEAN NOT NULL DEFAULT true,
    "dispo_location" BOOLEAN NOT NULL DEFAULT false,
    "places" INTEGER,
    "description" VARCHAR(4000),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coup_de_coeur" BOOLEAN NOT NULL DEFAULT false,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "vendu" BOOLEAN NOT NULL DEFAULT false,
    "vendu_le" TIMESTAMPTZ(6),
    "meuble" BOOLEAN NOT NULL DEFAULT true,
    "coherence" VARCHAR(20),
    "coffre_kg" INTEGER,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "standing" BOOLEAN NOT NULL DEFAULT false,
    "auteur" VARCHAR(64),
    "compte_id" INTEGER,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profils" (
    "compte_id" INTEGER NOT NULL,
    "poste" VARCHAR(60),
    "specialite" VARCHAR(80),
    "bio" VARCHAR(1000),
    "photo" VARCHAR(512),

    CONSTRAINT "profils_pkey" PRIMARY KEY ("compte_id")
);

-- CreateIndex
CREATE INDEX "biens_categorie_idx" ON "biens"("categorie");

-- CreateIndex
CREATE INDEX "biens_disponible_idx" ON "biens"("disponible");

-- CreateIndex
CREATE INDEX "biens_compte_id_idx" ON "biens"("compte_id");
