-- Comptabilité -> Paramètres : rémunération (salaire fixe, primes, barèmes).
-- Ajoute les interrupteurs qui manquaient sur stats_taux_commission (déjà
-- utilisée par Statistiques et DOT) pour rendre configurable depuis l'écran
-- admin ce qui ne pouvait avant être réglé qu'à la main en SQL : activer ou
-- désactiver le salaire fixe par grade, et donner ou retirer le droit aux
-- primes de vente / de location par grade (remplace la règle "Stagiaire ne
-- touche jamais de prime" qui était codée en dur dans src/stats-calc.js).
ALTER TABLE stats_taux_commission ADD COLUMN salaire_actif INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_taux_commission ADD COLUMN prime_vente_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stats_taux_commission ADD COLUMN prime_location_active INTEGER NOT NULL DEFAULT 1;

-- Préserve EXACTEMENT les montants versés tels qu'ils sont calculés
-- aujourd'hui, à l'instant de cette migration : un grade qui touchait déjà
-- un salaire fixe (ancienne règle "salaire OU primes, jamais les deux")
-- continue de ne toucher QUE son salaire tant que la Direction ne change
-- rien depuis Paramètres.
UPDATE stats_taux_commission
   SET salaire_actif = 1, prime_vente_active = 0, prime_location_active = 0
 WHERE salaire_fixe IS NOT NULL;

-- Stagiaire ne touchait déjà aucune prime (règle codée en dur côté
-- src/stats-calc.js, maintenant supprimée) — même résultat obtenu ici, mais
-- réglable comme n'importe quel autre grade depuis Paramètres.
UPDATE stats_taux_commission
   SET prime_vente_active = 0, prime_location_active = 0
 WHERE grade = 'Stagiaire';
