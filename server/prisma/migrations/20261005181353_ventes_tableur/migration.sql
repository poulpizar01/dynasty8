-- CreateTable
CREATE TABLE "ventes" (
    "id" SERIAL NOT NULL,
    "numero_vente" VARCHAR(200) NOT NULL DEFAULT '',
    "date_vente" VARCHAR(10) NOT NULL DEFAULT '',
    "identite" VARCHAR(200) NOT NULL DEFAULT '',
    "formateur" VARCHAR(200) NOT NULL DEFAULT '',
    "identite_client" VARCHAR(200) NOT NULL DEFAULT '',
    "numero_tel" VARCHAR(200) NOT NULL DEFAULT '',
    "interieur" VARCHAR(200) NOT NULL DEFAULT '',
    "garage" VARCHAR(200) NOT NULL DEFAULT '',
    "garage_indispo" VARCHAR(200) NOT NULL DEFAULT '',
    "garage_refus" VARCHAR(200) NOT NULL DEFAULT '',
    "entreprise_identite" VARCHAR(200) NOT NULL DEFAULT '',
    "id_entreprise" VARCHAR(200) NOT NULL DEFAULT '',
    "type" VARCHAR(10) NOT NULL DEFAULT '',
    "loc" INTEGER,
    "achat" INTEGER NOT NULL DEFAULT 0,
    "semaine" VARCHAR(8) NOT NULL DEFAULT '',
    "compte_id" INTEGER,
    "event_id" VARCHAR(200),
    "employe_id" INTEGER,
    "formateur_employe_id" INTEGER,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventes_doublons" (
    "id" SERIAL NOT NULL,
    "ligne_doublon_id" INTEGER NOT NULL,
    "ligne_originale_id" INTEGER NOT NULL,
    "classification" VARCHAR(100) NOT NULL,
    "justification" TEXT NOT NULL,
    "marque_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marque_par" VARCHAR(100) NOT NULL,

    CONSTRAINT "ventes_doublons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baremes_primes" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "seuil" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,

    CONSTRAINT "baremes_primes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remunerations_grades" (
    "grade" VARCHAR(20) NOT NULL,
    "taux" DOUBLE PRECISION NOT NULL DEFAULT 0.48,
    "salaire_fixe" INTEGER,
    "salaire_actif" BOOLEAN NOT NULL DEFAULT false,
    "prime_vente_active" BOOLEAN NOT NULL DEFAULT true,
    "prime_location_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "remunerations_grades_pkey" PRIMARY KEY ("grade")
);

-- CreateTable
CREATE TABLE "tableur_lignes" (
    "id" SERIAL NOT NULL,
    "ligne_sheet" INTEGER,
    "nom_sheet" VARCHAR(200) NOT NULL,
    "nom_normalise" VARCHAR(200) NOT NULL,
    "grade_sheet" VARCHAR(40) NOT NULL DEFAULT '',
    "nb_ventes" INTEGER NOT NULL DEFAULT 0,
    "nb_locations" INTEGER NOT NULL DEFAULT 0,
    "employe_id" INTEGER,
    "compte_id" INTEGER,
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tableur_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tableur_etat" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "derniere_sync" TIMESTAMPTZ(6),
    "statut" VARCHAR(10) NOT NULL DEFAULT '',
    "erreur" VARCHAR(500) NOT NULL DEFAULT '',
    "nb_lignes" INTEGER NOT NULL DEFAULT 0,
    "nb_apparies" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tableur_etat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tableur_archives" (
    "id" SERIAL NOT NULL,
    "semaine" VARCHAR(8) NOT NULL,
    "archive_le" TIMESTAMPTZ(6) NOT NULL,
    "donnees_du" TIMESTAMPTZ(6) NOT NULL,
    "en_retard" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tableur_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tableur_archives_lignes" (
    "id" SERIAL NOT NULL,
    "archive_id" INTEGER NOT NULL,
    "ligne_sheet" INTEGER,
    "nom" VARCHAR(200) NOT NULL,
    "grade" VARCHAR(40) NOT NULL DEFAULT '',
    "ventes" INTEGER NOT NULL DEFAULT 0,
    "locations" INTEGER NOT NULL DEFAULT 0,
    "prime_vente" INTEGER NOT NULL DEFAULT 0,
    "prime_locations" INTEGER NOT NULL DEFAULT 0,
    "compte" VARCHAR(100),
    "employe_id" INTEGER,

    CONSTRAINT "tableur_archives_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ventes_event_id_key" ON "ventes"("event_id");

-- CreateIndex
CREATE INDEX "ventes_semaine_idx" ON "ventes"("semaine");

-- CreateIndex
CREATE INDEX "ventes_employe_id_idx" ON "ventes"("employe_id");

-- CreateIndex
CREATE UNIQUE INDEX "ventes_doublons_ligne_doublon_id_key" ON "ventes_doublons"("ligne_doublon_id");

-- CreateIndex
CREATE UNIQUE INDEX "baremes_primes_type_seuil_key" ON "baremes_primes"("type", "seuil");

-- CreateIndex
CREATE INDEX "tableur_lignes_employe_id_idx" ON "tableur_lignes"("employe_id");

-- CreateIndex
CREATE INDEX "tableur_lignes_compte_id_idx" ON "tableur_lignes"("compte_id");

-- CreateIndex
CREATE UNIQUE INDEX "tableur_archives_semaine_key" ON "tableur_archives"("semaine");

-- CreateIndex
CREATE INDEX "tableur_archives_lignes_archive_id_idx" ON "tableur_archives_lignes"("archive_id");

-- CreateIndex
CREATE INDEX "tableur_archives_lignes_employe_id_idx" ON "tableur_archives_lignes"("employe_id");

-- AddForeignKey
ALTER TABLE "tableur_archives_lignes" ADD CONSTRAINT "tableur_archives_lignes_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "tableur_archives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Paliers de primes de départ : ceux de l'ancien site (réglables ensuite dans Comptabilité → Rémunération).
INSERT INTO "baremes_primes" ("type", "seuil", "montant") VALUES
  ('vente', 20, 10000), ('vente', 40, 15000), ('vente', 60, 20000), ('vente', 80, 25000), ('vente', 100, 30000),
  ('location', 20, 10000), ('location', 40, 30000), ('location', 60, 50000), ('location', 80, 60000), ('location', 100, 70000);
