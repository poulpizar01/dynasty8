// ENTREPRISE — règles pures de l’agenda : un événement est personnel, partagé avec l’équipe ou adressé à un grade exact.
export const DESTINATIONS = ['perso', 'tous', 'grade'] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const estDestination = (v: unknown): v is Destination =>
  typeof v === 'string' && (DESTINATIONS as readonly string[]).includes(v);

export type DroitsAgenda = {
  tout: boolean;
  consulter: string[];
  creer: string[];
  modifier: string[];
  consulterTous: boolean;
  gererTous: boolean;
};
export type DroitsEnregistres = {
  consulter: string[];
  creer: string[];
  modifier: string[];
  consulterTous: boolean;
  gererTous: boolean;
} | null;
export type EvenementVu = { compteId: number | null; destination: string; destinationGrade: string | null; invitesDiscordIds?: readonly string[] };
export type Lecteur = { id: number; discordId?: string | null };

export function droitsAgenda(grades: readonly string[], gradeCle: string | null, proprietaire: boolean, enregistres: DroitsEnregistres): DroitsAgenda {
  if (proprietaire) return { tout: true, consulter: [...grades], creer: [...grades], modifier: [...grades], consulterTous: true, gererTous: true };
  const lire = (v: string[] | undefined): string[] => Array.isArray(v) ? [...new Set(v.filter(cle => grades.includes(cle)))] : [];
  if (!gradeCle || !grades.includes(gradeCle)) return { tout: false, consulter: [], creer: [], modifier: [], consulterTous: true, gererTous: false };
  return {
    tout: false,
    consulter: lire(enregistres?.consulter),
    creer: lire(enregistres?.creer),
    modifier: lire(enregistres?.modifier),
    consulterTous: enregistres?.consulterTous ?? false,
    gererTous: enregistres?.gererTous ?? false,
  };
}

export function voit(e: EvenementVu, moi: Lecteur, d: DroitsAgenda): boolean {
  if (e.compteId === moi.id) return true;
  if (e.destination === 'perso') return !!moi.discordId && !!e.invitesDiscordIds?.includes(moi.discordId);
  if (e.destination === 'tous') return d.tout || d.consulterTous;
  return d.tout || (!!e.destinationGrade && d.consulter.includes(e.destinationGrade));
}

export function modifiable(e: EvenementVu, moi: Lecteur, d: DroitsAgenda): boolean {
  if (e.compteId === moi.id) return true;
  if (e.destination === 'tous') return d.tout || (d.consulterTous && d.gererTous);
  if (e.destination === 'grade') return d.tout || (!!e.destinationGrade && d.modifier.includes(e.destinationGrade));
  return false;
}

export function peutCreer(d: DroitsAgenda, destination: Destination, destinationGrade: string | null): boolean {
  if (destination === 'perso' || d.tout) return true;
  if (destination === 'tous') return d.consulterTous && d.gererTous;
  return !!destinationGrade && d.creer.includes(destinationGrade);
}

export function peutInviter(d: DroitsAgenda, gradeCible: string | null, grades: readonly string[]): boolean {
  if (d.tout) return true;
  return !!gradeCible && grades.includes(gradeCible) && d.creer.includes(gradeCible);
}

export const droitsInclusDansConsultation = (consulter: readonly string[], droits: readonly string[]): boolean =>
  droits.every(cle => consulter.includes(cle));

export function parisVersDate(jour: string, heure: string): Date {
  const [a, mo, j] = jour.split('-').map(Number), [h, mi] = heure.split(':').map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, mi);
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const decalage = (instant: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - instant;
  };
  const premier = naif - decalage(naif);
  return new Date(naif - decalage(premier));
}

type SalonDiscord = { id?: unknown; type?: unknown; parent_id?: unknown; permission_overwrites?: { id?: unknown; type?: unknown }[] };

export function choisirTicket(salons: unknown, discordId: string, categories: readonly string[]): string | null {
  const tickets = (Array.isArray(salons) ? salons as SalonDiscord[] : [])
    .filter(c => c && c.type === 0 && /^\d{15,22}$/.test(String(c.id)) && categories.includes(String(c.parent_id ?? ''))
      && (c.permission_overwrites ?? []).some(o => String(o.type) === '1' && String(o.id) === discordId))
    .map(c => BigInt(String(c.id)));
  if (!tickets.length) return null;
  return String(tickets.reduce((a, b) => (b > a ? b : a)));
}

export function gradeAccordable(cle: string, grades: readonly string[], gradeActeur: string | null, proprietaire: boolean): boolean {
  if (!grades.includes(cle)) return false;
  if (proprietaire) return true;
  return !!gradeActeur && grades.includes(gradeActeur) && grades.indexOf(cle) >= grades.indexOf(gradeActeur);
}
