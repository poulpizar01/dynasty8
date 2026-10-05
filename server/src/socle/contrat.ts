// SOCLE — contrat entre le socle et le code propre à l'entreprise (src/entreprise/).
// Le socle ne connaît l'entreprise que par deux fichiers : permissions.ts (ses permissions) et index.ts (l'objet
// Entreprise ci-dessous : niveau d'accès de ses pages, ses routes, ce qu'elle fait des événements du bot…).
// Tout le reste de src/entreprise/ est libre.
import type { Router } from 'express';
import type { Prisma } from '../generated/prisma/client.js';

// Permission déclarée par l'entreprise (src/entreprise/permissions.ts), cochée par grade dans la gestion
// (ex. { cle: 'stocks', libelle: 'Gérer les stocks' }). Clé : minuscules, chiffres, tirets ; « comptes » et « grades »
// sont réservées au socle. Fichier à part et sans import : le socle le lit avant de charger les routes.
export type Permission = { cle: string; libelle: string; description?: string };

// Niveau d'accès d'une page de gestion/ : 'public' (sans connexion), 'connecte' (compte même en attente),
// 'valide' (compte validé), ou une clé de permission. Une page non déclarée exige un compte validé.
export type NiveauPage = 'public' | 'connecte' | 'valide' | string;

// Événement reçu du bot Discord entreprise (corps du webhook, signature déjà vérifiée, serveur Discord contrôlé)
export type EvenementBot = { guildId: string; eventType: string; payload: unknown; sentAt: string };

export type Entreprise = {
  // nom de la page de gestion/ (sans .html) → niveau
  pages: Record<string, NiveauPage>;
  // routes Express, sous /api/… (la session n'est ouverte que là) ; chacune protégée par une garde de socle/http.ts
  routes: Router[];
  // traitement d'un événement du bot, par type (`absence.updated`, `order.updated`, `monitoring.sale`, `custom`…).
  // Une erreur levée → réponse 500, le bot réessaie plus tard ; un type sans traitement est accepté et ignoré.
  webhooks?: Record<string, (e: EvenementBot) => Promise<void>>;
  // avant la suppression d'un compte (par lui-même ou par la gestion), dans la même transaction : effacer ou anonymiser
  // ce qui lui appartient dans les tables de l'entreprise
  avantSuppressionCompte?: (compteId: number, tx: Prisma.TransactionClient) => Promise<void>;
  // au démarrage, après le chargement du socle (tâches planifiées, caches…)
  demarrage?: () => Promise<void>;
  // origines https supplémentaires autorisées par la politique de sécurité : exception à justifier (voir CLAUDE.md),
  // à déclarer aussi dans confidentialite.html
  csp?: { img?: string[]; connect?: string[] };
};
