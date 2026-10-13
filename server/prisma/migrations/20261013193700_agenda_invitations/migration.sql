CREATE TABLE "agenda_invitations" (
    "id" SERIAL NOT NULL,
    "evenement_id" INTEGER NOT NULL,
    "discord_id" VARCHAR(22) NOT NULL,
    "nom" VARCHAR(130) NOT NULL,
    "discord_salon_id" VARCHAR(22),
    "discord_message_id" VARCHAR(22),
    "prevenu" VARCHAR(10) NOT NULL DEFAULT '',

    CONSTRAINT "agenda_invitations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "agenda_invitations" ("evenement_id", "discord_id", "nom", "discord_salon_id", "discord_message_id", "prevenu")
SELECT "id", "cible_discord_id", "cible_nom", "discord_salon_id", "discord_message_id", "prevenu"
FROM "evenements_agenda"
WHERE "cible_discord_id" IS NOT NULL;

CREATE UNIQUE INDEX "agenda_invitations_evenement_id_discord_id_key"
ON "agenda_invitations"("evenement_id", "discord_id");

CREATE INDEX "agenda_invitations_discord_id_evenement_id_idx"
ON "agenda_invitations"("discord_id", "evenement_id");

ALTER TABLE "agenda_invitations"
ADD CONSTRAINT "agenda_invitations_evenement_id_fkey"
FOREIGN KEY ("evenement_id") REFERENCES "evenements_agenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "evenements_agenda_cible_discord_id_jour_idx";

ALTER TABLE "evenements_agenda"
DROP COLUMN "cible_discord_id",
DROP COLUMN "cible_employe_id",
DROP COLUMN "cible_nom",
DROP COLUMN "discord_salon_id",
DROP COLUMN "discord_message_id",
DROP COLUMN "prevenu";
