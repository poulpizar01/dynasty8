-- Remplace les plafonds hiérarchiques par des listes explicites de grades destinataires.
ALTER TABLE "agenda_droits_grades"
  ADD COLUMN "consulter_grades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "creer_grades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "modifier_grades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

INSERT INTO "agenda_droits_grades" ("grade", "consulter", "creer", "modifier", "consulter_tous", "modifier_tous")
SELECT "cle", "cle", "cle", "cle", true, true
FROM "grades"
ON CONFLICT ("grade") DO NOTHING;

WITH grades_ordonnes AS (
  SELECT "cle", ROW_NUMBER() OVER (ORDER BY "position", "libelle") - 1 AS "rang"
  FROM "grades"
),
plafonds AS (
  SELECT
    d."grade",
    COALESCE(own."rang", -1) AS "rang_propre",
    CASE WHEN d."consulter" = '' THEN NULL ELSE COALESCE(consulter."rang", own."rang") END AS "rang_consulter",
    COALESCE(creer."rang", own."rang") AS "rang_creer",
    COALESCE(modifier."rang", own."rang") AS "rang_modifier"
  FROM "agenda_droits_grades" d
  LEFT JOIN grades_ordonnes own ON own."cle" = d."grade"
  LEFT JOIN grades_ordonnes consulter ON consulter."cle" = d."consulter"
  LEFT JOIN grades_ordonnes creer ON creer."cle" = d."creer"
  LEFT JOIN grades_ordonnes modifier ON modifier."cle" = d."modifier"
)
UPDATE "agenda_droits_grades" d
SET
  "consulter_grades" = COALESCE((
    SELECT ARRAY_AGG(g."cle" ORDER BY g."rang")
    FROM grades_ordonnes g
    WHERE d."consulter" <> ''
      AND g."rang" >= COALESCE(p."rang_consulter", p."rang_propre")
  ), ARRAY[]::TEXT[]),
  "creer_grades" = COALESCE((
    SELECT ARRAY_AGG(g."cle" ORDER BY g."rang")
    FROM grades_ordonnes g
    WHERE d."creer" <> ''
      AND p."rang_consulter" IS NOT NULL
      AND p."rang_creer" IS NOT NULL
      AND g."rang" >= GREATEST(p."rang_consulter", p."rang_creer")
  ), ARRAY[]::TEXT[]),
  "modifier_grades" = COALESCE((
    SELECT ARRAY_AGG(g."cle" ORDER BY g."rang")
    FROM grades_ordonnes g
    WHERE d."modifier" <> ''
      AND p."rang_consulter" IS NOT NULL
      AND p."rang_modifier" IS NOT NULL
      AND g."rang" >= GREATEST(p."rang_consulter", p."rang_modifier")
  ), ARRAY[]::TEXT[])
FROM plafonds p
WHERE d."grade" = p."grade";

ALTER TABLE "agenda_droits_grades"
  DROP COLUMN "consulter",
  DROP COLUMN "creer",
  DROP COLUMN "modifier";

ALTER TABLE "agenda_droits_grades" RENAME COLUMN "consulter_grades" TO "consulter";
ALTER TABLE "agenda_droits_grades" RENAME COLUMN "creer_grades" TO "creer";
ALTER TABLE "agenda_droits_grades" RENAME COLUMN "modifier_grades" TO "modifier";
