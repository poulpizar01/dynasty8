-- La création est idempotente : certaines dérivations ont déjà cette table avec leur propre migration.
CREATE TABLE IF NOT EXISTS "agenda_invitations" (
    "id" SERIAL NOT NULL,
    "evenement_id" INTEGER NOT NULL,
    "discord_id" VARCHAR(22) NOT NULL,
    "nom" VARCHAR(130) NOT NULL,
    "discord_salon_id" VARCHAR(22),
    "discord_message_id" VARCHAR(22),
    "prevenu" VARCHAR(10) NOT NULL DEFAULT '',
    CONSTRAINT "agenda_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "agenda_invitations_evenement_id_discord_id_key"
ON "agenda_invitations"("evenement_id", "discord_id");

CREATE INDEX IF NOT EXISTS "agenda_invitations_discord_id_evenement_id_idx"
ON "agenda_invitations"("discord_id", "evenement_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agenda_invitations_evenement_id_fkey'
      AND conrelid = '"agenda_invitations"'::regclass
  ) THEN
    ALTER TABLE "agenda_invitations"
    ADD CONSTRAINT "agenda_invitations_evenement_id_fkey"
    FOREIGN KEY ("evenement_id") REFERENCES "evenements_agenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
