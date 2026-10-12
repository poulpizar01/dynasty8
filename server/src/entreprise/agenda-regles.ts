// ENTREPRISE — Agenda partagé : règles pures (sans base ni Discord), testées dans test/agenda.test.ts.
// Un événement est destiné à :
//   - perso : son auteur, et la personne choisie quand il l'a créé pour quelqu'un d'autre (prévenue sur Discord) ;
//   - tous  : tout compte validé ;
//   - grade : ce grade et ceux au-dessus.
// Chaque grade a trois plafonds, réglés dans sa fiche (page Grades) : il consulte, crée et modifie les événements
// destinés aux grades jusqu'à celui-là (lui compris, et tous ceux en dessous). Par défaut : son propre grade ; « aucun »
// possible. « Tout le monde » se consulte toujours, se crée et se modifie dès que le plafond n'est pas « aucun ».
// Le propriétaire du serveur Discord a tout. Ses propres événements, chacun les voit et les gère toujours ; le « Perso »
// d'un autre ne se gère que par son auteur.

export const DESTINATIONS = ['perso', 'tous', 'grade'] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const estDestination = (v: unknown): v is Destination => typeof v === 'string' && (DESTINATIONS as readonly string[]).includes(v);

// plafond : rang du grade le plus haut atteint (0 = sommet), null = aucun
export type Plafond = number | null;
export type DroitsAgenda = { tout: boolean; consulter: Plafond; creer: Plafond; modifier: Plafond };
export type PlafondsEnregistres = { consulter: string; creer: string; modifier: string } | null;

// droits d'un compte : grades du sommet à la base (clés), son grade, ses plafonds enregistrés (null : par défaut)
export function droitsAgenda(grades: readonly string[], gradeCle: string | null, proprietaire: boolean, enregistres: PlafondsEnregistres): DroitsAgenda {
  if (proprietaire) return { tout: true, consulter: 0, creer: 0, modifier: 0 };
  const propre = gradeCle ? grades.indexOf(gradeCle) : -1;
  if (propre < 0) return { tout: false, consulter: null, creer: null, modifier: null };   // sans grade : « Tout le monde » en lecture
  // '' : aucun ; un grade disparu depuis : retour à son propre grade
  const lire = (v: string | undefined): Plafond => v === undefined ? propre : v === '' ? null : grades.includes(v) ? grades.indexOf(v) : propre;
  return { tout: false, consulter: lire(enregistres?.consulter), creer: lire(enregistres?.creer), modifier: lire(enregistres?.modifier) };
}

// le plafond atteint-il cette destination ? Un grade disparu compte comme le sommet (personne ne le voit plus par erreur).
export function atteint(plafond: Plafond, destination: string, destinationGrade: string | null, grades: readonly string[]): boolean {
  if (plafond === null) return false;
  if (destination === 'tous') return true;
  if (destination !== 'grade') return false;
  const r = destinationGrade ? grades.indexOf(destinationGrade) : -1;
  return Math.max(r, 0) >= plafond;
}

export type EvenementVu = { compteId: number | null; destination: string; destinationGrade: string | null; cibleDiscordId: string | null };
export type Lecteur = { id: number; discordId: string | null };

export function voit(e: EvenementVu, moi: Lecteur, d: DroitsAgenda, grades: readonly string[]): boolean {
  if (e.compteId === moi.id) return true;
  if (e.destination === 'perso') return !!moi.discordId && e.cibleDiscordId === moi.discordId;
  if (e.destination === 'tous') return true;
  return d.tout || atteint(d.consulter, e.destination, e.destinationGrade, grades);
}

export function modifiable(e: EvenementVu, moi: Lecteur, d: DroitsAgenda, grades: readonly string[]): boolean {
  if (e.compteId === moi.id) return true;
  if (e.destination === 'perso') return false;
  return d.tout || atteint(d.modifier, e.destination, e.destinationGrade, grades);
}

// créer (ou déplacer un événement vers) cette destination ; « perso » pour soi : toujours
export const peutCreer = (d: DroitsAgenda, destination: Destination, destinationGrade: string | null, grades: readonly string[]): boolean =>
  destination === 'perso' || d.tout || atteint(d.creer, destination, destinationGrade, grades);

// « Perso » pour quelqu'un d'autre : sa personne doit être dans ce qu'on peut créer (grade inconnu : le bas de l'échelle)
export function peutCreerPour(d: DroitsAgenda, gradeCible: string | null, grades: readonly string[]): boolean {
  if (d.tout) return true;
  if (d.creer === null) return false;
  const r = gradeCible ? grades.indexOf(gradeCible) : -1;
  return (r < 0 ? grades.length : r) >= d.creer;
}

// plafond qu'un acteur peut donner à un grade : jamais au-dessus de son propre grade (anti-escalade, comme les permissions)
export function plafondAccordable(cle: string, grades: readonly string[], gradeActeur: string | null, proprietaire: boolean): boolean {
  if (cle === '') return true;
  if (!grades.includes(cle)) return false;
  if (proprietaire) return true;
  return !!gradeActeur && grades.includes(gradeActeur) && grades.indexOf(cle) >= grades.indexOf(gradeActeur);
}

// « 2026-10-08 », « 14:30 », heure de Paris (celle de l'agence, heure d'été comprise) → instant réel
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
// (un bot de tickets ouvre ainsi le salon à celui qui l'a créé). Les ID Discord croissent avec le temps.
export function choisirTicket(salons: unknown, discordId: string, categories: readonly string[]): string | null {
  const tickets = (Array.isArray(salons) ? salons as SalonDiscord[] : [])
    .filter(c => c && c.type === 0 && /^\d{15,22}$/.test(String(c.id)) && categories.includes(String(c.parent_id ?? ''))
      && (c.permission_overwrites ?? []).some(o => String(o.type) === '1' && String(o.id) === discordId))
    .map(c => BigInt(String(c.id)));
  if (!tickets.length) return null;
  return String(tickets.reduce((a, b) => (b > a ? b : a)));
}
