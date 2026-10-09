// SOCLE — rôles du serveur Discord de l'entreprise, lus sur Discord pour que la page Grades les propose par leur nom
// (jamais une liste écrite à la main, qui ne suivrait pas les rôles créés, renommés ou supprimés sur Discord). La
// connexion d'un employé ne donne que les identifiants de SES rôles, pas leurs noms : la liste exige le jeton d'un bot
// présent sur le serveur (DISCORD_BOT_TOKEN, aucune permission requise). Sans jeton : liste vide, l'identifiant d'un
// rôle se saisit à la main.
import { config } from './config.js';

export type RoleDiscord = { id: string; nom: string; couleur: string | null; position: number };

const DUREE_MS = 5 * 60_000;   // les rôles changent rarement ; Discord limite les appels
let cache: { roles: RoleDiscord[]; le: number } | null = null;

export const rolesDiscordConfigures = (): boolean => !!config.discord.botToken;

// du plus haut au plus bas sur Discord ; ni @everyone (porté par tous) ni les rôles gérés par une intégration (bots)
export async function rolesDiscord(): Promise<RoleDiscord[]> {
  if (!config.discord.botToken) return [];
  if (cache && Date.now() - cache.le < DUREE_MS) return cache.roles;
  const r = await fetch(`https://discord.com/api/v10/guilds/${config.discord.guildId}/roles`, {
    headers: { Authorization: `Bot ${config.discord.botToken}` }, signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Discord a répondu ${r.status} à la lecture des rôles du serveur`);
  const brut: unknown = await r.json();
  if (!Array.isArray(brut)) throw new Error('liste des rôles illisible');
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
