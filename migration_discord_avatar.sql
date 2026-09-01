-- Ajoute la colonne qui stocke l'adresse de la photo de profil Discord de
-- chaque membre (remplie automatiquement à sa connexion via Discord).
ALTER TABLE membres ADD COLUMN discord_avatar TEXT;
