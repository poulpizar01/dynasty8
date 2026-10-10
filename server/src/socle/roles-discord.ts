// SOCLE — rôles du serveur Discord de l'entreprise, lus sur Discord pour que la page Grades les propose par leur nom
// (jamais une liste écrite à la main, qui ne suivrait pas les rôles créés, renommés ou supprimés sur Discord). La
// connexion d'un employé ne donne que les identifiants de SES rôles, pas leurs noms : la liste exige le jeton d'un bot
// présent sur le serveur (DISCORD_BOT_TOKEN, aucune permission requise). Sans jeton : liste vide, l'identifiant d'un
// rôle se saisit à la main.
import { config } from './config.js';
import { appelBot, botDiscordConfigure, ErreurDiscord } from './discord.js';

export type RoleDiscord = { id: string; nom: string; couleur: string | null; position: number };

// échec de lecture, avec un message à montrer à qui gère les grades : la cause dit quoi faire
export class RolesIndisponibles extends Error {}
const cause = (statut: number) =>
  statut === 401 ? 'Discord refuse le jeton du bot (DISCORD_BOT_TOKEN) : à corriger dans la configuration du site.'
  : statut === 403 || statut === 404 ? 'Le bot n’est pas sur le serveur Discord de l’entreprise : invite-le, sans aucune permission.'
  : 'Discord ne répond pas pour le moment : recharge la page dans quelques minutes.';

const DUREE_MS = 5 * 60_000;   // les rôles changent rarement ; Discord limite les appels
let cache: { roles: RoleDiscord[]; le: number } | null = null;

export const rolesDiscordConfigures = botDiscordConfigure;

// du plus haut au plus bas sur Discord ; ni @everyone (porté par tous) ni les rôles gérés par une intégration (bots)
export async function rolesDiscord(): Promise<RoleDiscord[]> {
  if (!config.discord.botToken) return [];
  if (cache && Date.now() - cache.le < DUREE_MS) return cache.roles;
  let brut: unknown;
  try { brut = await appelBot('GET', `/guilds/${config.discord.guildId}/roles`); }
  catch (e) { throw new RolesIndisponibles(cause(e instanceof ErreurDiscord ? e.statut : 0)); }
  if (!Array.isArray(brut)) throw new RolesIndisponibles(cause(0));
  const roles = brut
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && /^\d{5,32}$/.test(String(x.id)) && x.id !== config.discord.guildId && !x.managed)
    .map(x => ({
      id: String(x.id), nom: String(x.name ?? '').slice(0, 100),
      couleur: Number(x.color) > 0 ? `#${Number(x.color).toString(16).padStart(6, '0').slice(-6)}` : null,
      position: Number(x.position) || 0,
    }))
    .sort((a, b) => b.position - a.position);
  cache = { roles, le: Date.now() };
  return roles;
}
