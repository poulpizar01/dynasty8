-- AlterTable
ALTER TABLE "ventes" ADD COLUMN     "formateur_normalise" VARCHAR(200) NOT NULL DEFAULT '',
ADD COLUMN     "identite_normalisee" VARCHAR(200) NOT NULL DEFAULT '';

-- Ventes déjà reçues : même normalisation que l'application (sans casse ni espaces autour)
UPDATE "ventes" SET "identite_normalisee" = lower(btrim("identite")), "formateur_normalise" = lower(btrim("formateur"));

-- CreateIndex
CREATE INDEX "ventes_identite_normalisee_idx" ON "ventes"("identite_normalisee");

-- CreateIndex
CREATE INDEX "ventes_formateur_normalise_idx" ON "ventes"("formateur_normalise");
