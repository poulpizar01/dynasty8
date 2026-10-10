// ENTREPRISE — Agenda partagé : règles pures (sans base ni Discord), testées dans test/agenda.test.ts.
// Visible par :
//   - perso     : le créateur, et la personne choisie quand il l'a créé pour quelqu'un d'autre (posté dans son ticket) ;
//   - patrons / direction / tous : les comptes qui portent l'un des rôles Discord réglés dans Paramètres → Agenda.
// Crée chaque visibilité partagée : les rôles « créateurs » réglés, et toujours qui a la permission « parametres »
// (ceux qui règlent ces rôles : personne n'est bloqué tant qu'ils ne sont pas saisis). « Perso » pour soi : tout le monde.

export const VISIBILITES = ['perso', 'patrons', 'direction', 'tous'] as const;
export type Visibilite = (typeof VISIBILITES)[number];
export const PARTAGEES: readonly Visibilite[] = ['patrons', 'direction', 'tous'];
export const LIBELLES: Record<Visibilite, string> = { perso: 'Perso', patrons: 'Patrons', direction: 'Direction', tous: 'Tous' };
export const estVisibilite = (v: unknown): v is Visibilite => typeof v === 'string' && (VISIBILITES as readonly string[]).includes(v);

const CLES_VOIT: Record<Exclude<Visibilite, 'perso'>, string> = { patrons: 'agenda_roles_patrons', direction: 'agenda_roles_direction', tous: 'agenda_role_tous' };

export type DroitsAgenda = { voit: Set<Visibilite>; cree: Set<Visibilite>; persoAutrui: boolean };

// roles : rôles Discord du compte (relus à sa dernière connexion Discord) ; admin : permission « parametres » ;
// ids(cle) : IDs réglés pour cette clé de Paramètres
export function droitsAgenda(roles: readonly string[], admin: boolean, ids: (cle: string) => readonly string[]): DroitsAgenda {
  const porte = new Set(roles);
  const aUnRole = (cle: string) => ids(cle).some(r => porte.has(r));
  const voit = new Set<Visibilite>(['perso']), cree = new Set<Visibilite>(['perso']);
  for (const v of PARTAGEES) {
    if (aUnRole(CLES_VOIT[v as keyof typeof CLES_VOIT])) voit.add(v);
    if (admin || aUnRole(`agenda_createurs_${v}`)) cree.add(v);
  }
  return { voit, cree, persoAutrui: admin || aUnRole('agenda_createurs_perso') };
}

// « 2026-10-08 », « 14:30 », heure de Paris (celle de l'agence, heure d'été comprise) → instant réel
export function parisVersDate(jour: string, heure: string): Date {
  const [a, mo, j] = jour.split('-').map(Number), [h, mi] = heure.split(':').map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, mi);
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const decalage = (instant: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - instant;
  };
  const premier = naif - decalage(naif);
  return new Date(naif - decalage(premier));   // second passage : jour de changement d'heure
}

export type SalonDiscord = { id?: unknown; type?: unknown; parent_id?: unknown; permission_overwrites?: { id?: unknown; type?: unknown }[] };

// ticket le plus récent de la personne : salon texte d'une des catégories réglées où elle a une permission à son nom
// (c'est ainsi que Ticket Tool ouvre le ticket à celui qui l'a créé). Les ID Discord croissent avec le temps.
export function choisirTicket(salons: unknown, discordId: string, categories: readonly string[]): string | null {
  const tickets = (Array.isArray(salons) ? salons as SalonDiscord[] : [])
    .filter(c => c && c.type === 0 && /^\d{15,22}$/.test(String(c.id)) && categories.includes(String(c.parent_id ?? ''))
      && (c.permission_overwrites ?? []).some(o => String(o.type) === '1' && String(o.id) === discordId))
    .map(c => BigInt(String(c.id)));
  if (!tickets.length) return null;
  return String(tickets.reduce((a, b) => (b > a ? b : a)));
}
