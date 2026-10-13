DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agenda_droits_grades'
      AND column_name = 'modifier_tous'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'agenda_droits_grades'
      AND column_name = 'gerer_tous'
  ) THEN
    ALTER TABLE "agenda_droits_grades" RENAME COLUMN "modifier_tous" TO "gerer_tous";
  END IF;
END $$;

ALTER TABLE "agenda_droits_grades"
  ALTER COLUMN "consulter_tous" SET DEFAULT false,
  ALTER COLUMN "gerer_tous" SET DEFAULT false;
