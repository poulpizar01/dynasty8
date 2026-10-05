-- CreateTable
CREATE TABLE "compta_imports" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'tablettes',
    "colonnes" JSONB NOT NULL,
    "lignes" JSONB NOT NULL,
    "compte_id" INTEGER,
    "importe_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compta_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compta_dot_ecritures" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "date_ecriture" VARCHAR(10) NOT NULL DEFAULT '',
    "justificatif" VARCHAR(200) NOT NULL,
    "montant" INTEGER NOT NULL,
    "compte_id" INTEGER,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compta_dot_ecritures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dot_bareme_imposition" (
    "id" SERIAL NOT NULL,
    "seuil_min" INTEGER NOT NULL,
    "seuil_max" INTEGER NOT NULL,
    "taux" DOUBLE PRECISION NOT NULL,
    "salaire_max_employe" INTEGER NOT NULL,
    "salaire_max_patron" INTEGER NOT NULL,
    "prime_max_employe" INTEGER NOT NULL,
    "prime_max_patron" INTEGER NOT NULL,

    CONSTRAINT "dot_bareme_imposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compta_imports_type_importe_le_idx" ON "compta_imports"("type", "importe_le" DESC);

-- CreateIndex
CREATE INDEX "compta_dot_ecritures_type_idx" ON "compta_dot_ecritures"("type");

-- Barème officiel de la DOT (repris de l'ancien site).
INSERT INTO "dot_bareme_imposition" ("seuil_min", "seuil_max", "taux", "salaire_max_employe", "salaire_max_patron", "prime_max_employe", "prime_max_patron") VALUES
  (100, 9999, 0.07, 5000, 8000, 2500, 4000),
  (10000, 29999, 0.09, 10000, 15000, 5000, 7500),
  (30000, 49999, 0.16, 20000, 25000, 10000, 12500),
  (50000, 99999, 0.21, 35000, 40000, 17500, 20000),
  (100000, 249999, 0.23, 55000, 60000, 27500, 30000),
  (250000, 449999, 0.26, 65000, 70000, 32500, 35000),
  (450000, 599999, 0.29, 75000, 80000, 37500, 40000),
  (600000, 899999, 0.32, 85000, 90000, 42500, 45000),
  (900000, 1499999, 0.36, 95000, 100000, 47500, 50000),
  (1500000, 1799999, 0.38, 105000, 110000, 52500, 55000),
  (1800000, 2499999, 0.44, 115000, 125000, 57500, 62500),
  (2500000, 4999999, 0.47, 145000, 150000, 72500, 75000),
  (5000000, 99000000, 0.49, 155000, 170000, 77500, 85000);
