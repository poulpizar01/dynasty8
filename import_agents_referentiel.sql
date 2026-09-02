-- Import/mise à jour du référentiel des agents (stats_agents), à partir du
-- fichier "Compta Immo" transmis par Paul (Identité Discord / Identité RP /
-- Grade). Rejouable sans risque : un agent déjà présent (même pseudo
-- normalisé) est simplement mis à jour plutôt que dupliqué, donc ce fichier
-- peut être exécuté de nouveau après chaque mise à jour du fichier source.
INSERT INTO stats_agents (discord_pseudo, discord_pseudo_normalise, identite_rp, grade)
VALUES
  ('.kpz', '.kpz', 'Andrew Finley', 'Patron'),
  ('mily____.', 'mily____.', 'Roxanne Finley', 'Co Patron'),
  ('zirnox', 'zirnox', 'Andrew Martins', 'Manager'),
  ('Ly Bé', 'ly bé', 'Myron Porter', 'Référent Immobilier'),
  ('Gaetan', 'gaetan', 'Dario Cole', 'Référent Immobilier'),
  ('Keawii', 'keawii', 'Albanito Reyes', 'Référent Immobilier'),
  ('Le N', 'le n', 'Soren Uteli', 'Référent Immobilier'),
  ('Stark', 'stark', 'Mickael Strasky', 'Référent Immobilier'),
  ('Adchat', 'adchat', 'Sylvestre Parker', 'Référent Immobilier'),
  ('yyuukkaaa', 'yyuukkaaa', 'Ava Snow', 'Référent Immobilier'),
  ('m4z3._', 'm4z3._', 'Lola Finley', 'Agent'),
  ('.matlow.', '.matlow.', 'Caleb Duval', 'Agent'),
  ('frch_luffy', 'frch_luffy', 'Noam Finley', 'Agent'),
  ('cmoihaki', 'cmoihaki', 'Damon Finley', 'Agent'),
  ('.majins.', '.majins.', 'Whisper Kaita', 'Agent'),
  ('lepro0448', 'lepro0448', 'Alessandro Moretti', 'Agent Novice'),
  ('sst.gf', 'sst.gf', 'Grey Brook', 'Agent Novice'),
  ('alpha_o1', 'alpha_o1', 'William Steerl', 'Agent Novice'),
  ('elpinchechivo', 'elpinchechivo', 'Hawk Bisoux', 'Agent Novice'),
  ('jsuisbrenda', 'jsuisbrenda', 'Loïs Goldberg', 'Agent Novice'),
  ('kyubi1812', 'kyubi1812', 'Nathan Carter', 'Agent Novice'),
  ('deepson38', 'deepson38', 'Armando Porto', 'Agent Novice'),
  ('amlette.', 'amlette.', 'Amlet Fromage', 'Agent Novice'),
  ('io0041', 'io0041', 'Blue Finley', 'Agent Novice'),
  ('eldryss1', 'eldryss1', 'Léonard Eldryss', 'Stagiaire'),
  ('lo_lo_lo_lo_', 'lo_lo_lo_lo_', 'John Morales', 'Stagiaire'),
  ('n3x_u', 'n3x_u', 'Tony Morino', 'Stagiaire')
ON CONFLICT(discord_pseudo_normalise) DO UPDATE SET
  discord_pseudo = excluded.discord_pseudo,
  identite_rp = excluded.identite_rp,
  grade = excluded.grade,
  maj = datetime('now');
