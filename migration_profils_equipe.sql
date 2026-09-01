-- Migration : profil public pour chaque membre de l'équipe.
-- Objectif : la page /equipe.html affichait jusqu'ici 6 noms écrits en dur
-- dans le HTML. Avec cette migration, chaque agent peut renseigner lui-même
-- (depuis l'espace agents, onglet « Mon profil ») sa photo, son intitulé de
-- poste, sa spécialité et sa biographie — affichés automatiquement sur la
-- page publique.
--
-- Important : ces colonnes sont séparées de "grade" (Direction/Agent), qui
-- reste le seul champ qui contrôle les droits d'accès et n'est modifiable
-- que par la Direction depuis l'onglet Équipe. Un agent ne peut donc jamais
-- se donner lui-même des droits supplémentaires en éditant son profil.
--
-- Cette migration n'efface rien : elle ajoute des colonnes vides (NULL),
-- les comptes existants ne sont pas modifiés.

ALTER TABLE membres ADD COLUMN poste TEXT;
ALTER TABLE membres ADD COLUMN specialite TEXT;
ALTER TABLE membres ADD COLUMN bio TEXT;
ALTER TABLE membres ADD COLUMN photo TEXT;
ALTER TABLE membres ADD COLUMN linkedin TEXT;
