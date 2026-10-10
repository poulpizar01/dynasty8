-- AlterTable
ALTER TABLE "evenements_agenda" ADD COLUMN     "auteur_nom" VARCHAR(64) NOT NULL DEFAULT '',
ADD COLUMN     "cible_discord_id" VARCHAR(22),
ADD COLUMN     "cible_employe_id" INTEGER,
ADD COLUMN     "cible_nom" VARCHAR(130) NOT NULL DEFAULT '',
ADD COLUMN     "discord_message_id" VARCHAR(22),
ADD COLUMN     "discord_salon_id" VARCHAR(22),
ADD COLUMN     "visibilite" VARCHAR(10) NOT NULL DEFAULT 'perso',
ALTER COLUMN "compte_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "evenements_agenda_visibilite_jour_idx" ON "evenements_agenda"("visibilite", "jour");

-- CreateIndex
CREATE INDEX "evenements_agenda_cible_discord_id_jour_idx" ON "evenements_agenda"("cible_discord_id", "jour");
