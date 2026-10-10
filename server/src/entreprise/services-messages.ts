// ENTREPRISE — lecture des messages du bot des services (services.ts) : fonctions pures, sans base ni réseau, testées
// par test/services.test.ts.

export const normaliser = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// « <t:1791477420:f> » → Date ; null sans horodatage Discord
export function lireHorodatageDiscord(valeur: unknown): Date | null {
  const m = String(valeur ?? '').match(/<t:(\d{9,11})(?::[a-zA-Z])?>/);
  return m ? new Date(Number(m[1]) * 1000) : null;
}

// identifiant Discord de la personne, lu dans l'adresse de son avatar quand le bot le met en tête du message
export function discordIdDepuisAvatar(url: unknown): string | null {
  return String(url ?? '').match(/\/(?:avatars|users)\/(\d{15,21})\//)?.[1] ?? null;
}

export type EvenementService = { type: 'debut' | 'fin'; serviceId: string; employe: string; discordId: string | null; mode: string; debut: Date | null; fin: Date | null; cause: string };
export type Embed = { title?: unknown; fields?: unknown; author?: { name?: unknown; icon_url?: unknown } };

// un embed du bot → événement, ou null
export function lireEmbedService(embed: Embed | null | undefined, horodatageMessage?: string): EvenementService | null {
  if (!embed || typeof embed !== 'object') return null;
  const titre = normaliser(embed.title);
  const type = /^service demarre\b/.test(titre) ? 'debut' : /^service (termine|ferme)\b/.test(titre) ? 'fin' : null;
  if (!type) return null;
  const champs = new Map<string, string>();
  for (const f of Array.isArray(embed.fields) ? embed.fields as { name?: unknown; value?: unknown }[] : []) champs.set(normaliser(f?.name), String(f?.value ?? '').trim());
  const serviceId = (champs.get('id service') ?? '').replace(/[`*_\s]/g, '');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(serviceId)) return null;
  const employe = (champs.get('employe') || String(embed.author?.name ?? '')).replace(/[`*_]/g, '').trim();
  const message = horodatageMessage ? new Date(horodatageMessage) : null;
  const debut = lireHorodatageDiscord(champs.get('debut')) ?? (type === 'debut' ? message : null);
  const fin = type === 'fin' ? lireHorodatageDiscord(champs.get('fin')) ?? message : null;
  let cause = champs.get('cause de fin') ?? '';
  if (!cause && type === 'fin') cause = /inactivite/.test(titre) ? 'Inactivité' : /avance/.test(titre) ? 'Fin anticipée' : 'Fin normale';
  const valide = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d : null);
  return {
    type, serviceId, employe: employe.slice(0, 120), discordId: discordIdDepuisAvatar(embed.author?.icon_url),
    mode: (champs.get('mode') ?? '').slice(0, 60), debut: valide(debut), fin: valide(fin), cause: cause.slice(0, 120),
  };
}
