-- AlterTable
ALTER TABLE "tableur_etat" ADD COLUMN     "instantane" JSONB,
ADD COLUMN     "instantane_du" TIMESTAMPTZ(6),
ADD COLUMN     "semaine" VARCHAR(8) NOT NULL DEFAULT '';
