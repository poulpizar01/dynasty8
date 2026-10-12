// ENTREPRISE — Agenda de l'espace agents (gestion/agenda.html). Règles dans agenda-regles.ts : un événement est destiné
// à une personne (« Perso »), à tout le monde, ou à un grade et ceux au-dessus ; chaque grade consulte, crée et modifie
// jusqu'au grade réglé dans sa fiche (page Grades). Types d'événements : simple classement (nom, couleur), gérés avec la
// permission « agenda-types ». L'identité vient toujours de la session ; un événement qu'on ne voit pas répond 404,
// comme un événement inexistant.
// « Perso » pour quelqu'un d'autre : son ID Discord est lu dans sa fiche RH ; le bot poste l'événement dans son ticket
// (catégories réglées dans Paramètres), sinon en message privé. Texte seul (un embed disparaît sans « Intégrer des
// liens ») et seule la personne est mentionnée. Si rien n'a pu partir, l'événement est créé quand même et l'auteur le sait.
import { Router, type Request } from 'express';
import type { EvenementAgenda } from '../../generated/prisma/client.js';
import { config } from '../../socle/config.js';
import { prisma } from '../../socle/db.js';
import { appelBot, ErreurDiscord, posterMessage } from '../../socle/discord.js';
import { auDessusDe, gradeDe, tousLesGrades } from '../../socle/droits.js';
import { body, couleur, entier, intParam, permission, text, valide } from '../../socle/http.js';
import { site } from '../../socle/site.js';
import { choisirTicket, droitsAgenda, estDestination, modifiable, parisVersDate, peutCreer, peutCreerPour, plafondAccordable, voit, type Destination, type DroitsAgenda } from '../agenda-regles.js';
import { idsRegles } from '../parametres.js';
import { Refus, traiter } from '../refus.js';
import { nomComplet } from '../rh.js';

export const agenda = Router();

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
// jour sans heure : stocké en DATE, échangé en AAAA-MM-JJ (jamais d'heure ni de fuseau qui le décalerait)
const versDate = (jour: string) => new Date(`${jour}T00:00:00Z`);
const dateValide = (jour: unknown): jour is string => typeof jour === 'string' && RE_DATE.test(jour) && !Number.isNaN(versDate(jour).getTime()) && versDate(jour).toISOString().startsWith(jour);

const clesGrades = () => tousLesGrades().map(g => g.cle);   // du sommet à la base
async function droitsDe(req: Request): Promise<DroitsAgenda> {
  const c = req.compte;
  const enregistres = c.gradeCle ? await prisma.agendaDroitsGrade.findUnique({ where: { gradeCle: c.gradeCle } }) : null;
  return droitsAgenda(clesGrades(), c.gradeCle, c.proprietaire, enregistres);
}
const lecteur = (req: Request) => ({ id: req.compte.id, discordId: req.compte.discordId });

// libellé d'un destinataire, tel que la page l'affiche
const libelleDestination = (e: Pick<EvenementAgenda, 'destination' | 'destinationGrade' | 'cibleNom'>): string =>
  e.destination === 'tous' ? 'Tout le monde'
    : e.destination === 'grade' ? `${gradeDe(e.destinationGrade)?.libelle ?? 'Grade supprimé'} et au-dessus`
      : e.cibleNom ? e.cibleNom : 'Perso';

const versClient = (e: EvenementAgenda, req: Request, droits: DroitsAgenda) => ({
  id: e.id, titre: e.titre, jour: e.jour.toISOString().slice(0, 10), heure_debut: e.heureDebut, heure_fin: e.heureFin, notes: e.notes,
  type_id: e.typeId, destination: e.destination, destination_grade: e.destinationGrade, destinataire: libelleDestination(e),
  auteur: e.auteurNom, mien: e.compteId === req.compte.id, pour: e.cibleNom, prevenu: e.prevenu,
  modifiable: modifiable(e, lecteur(req), droits, clesGrades()),
});

type Champs = { titre: string; jour: Date; heureDebut: string; heureFin: string; notes: string; typeId: number | null };
async function lire(b: Record<string, unknown>): Promise<Champs> {
  const titre = text(b.titre, 80);
  if (!titre) throw new Refus('Le titre de l’événement est obligatoire.');
  if (!dateValide(b.jour)) throw new Refus('Date invalide : attendue au format jj/mm/aaaa.');
  const debut = String(b.heure_debut ?? ''), fin = String(b.heure_fin ?? '');
  if (!RE_HEURE.test(debut)) throw new Refus('Heure de début invalide : attendue au format 14:30.');
  if (!RE_HEURE.test(fin)) throw new Refus('Heure de fin invalide : attendue au format 14:30.');
  if (fin <= debut) throw new Refus('L’heure de fin doit être après l’heure de début.');
  if (String(b.notes ?? '').length > 500) throw new Refus('Les notes sont trop longues (500 caractères maximum).');
  let typeId: number | null = null;
  if (b.type_id !== undefined && b.type_id !== null && b.type_id !== '') {
    typeId = entier(b.type_id);
    if (typeId === null || !await prisma.typeAgenda.findUnique({ where: { id: typeId } })) throw new Refus('Ce type d’événement n’existe plus : choisissez-en un autre.');
  }
  return { titre, jour: versDate(b.jour), heureDebut: debut, heureFin: fin, notes: text(b.notes, 500), typeId };
}

// destinataire demandé : « perso », « tous » ou « grade » + destination_grade (un grade existant)
function lireDestination(b: Record<string, unknown>): { destination: Destination; destinationGrade: string | null } {
  const destination = estDestination(b.destination) ? b.destination : 'perso';
  if (destination !== 'grade') return { destination, destinationGrade: null };
  const g = gradeDe(String(b.destination_grade ?? ''));
  if (!g) throw new Refus('Ce grade n’existe plus : choisissez à qui l’événement est destiné.');
  return { destination, destinationGrade: g.cle };
}
const refusDestination = (d: { destination: Destination; destinationGrade: string | null }) => new Refus(d.destination === 'tous'
  ? 'Votre grade ne permet pas de créer un événement pour tout le monde.'
  : `Votre grade ne permet pas de créer un événement destiné à « ${gradeDe(d.destinationGrade)?.libelle ?? 'ce grade'} ».`, 403);

// ---- prévenir la personne d'un « Perso » créé pour elle : son ticket, sinon un message privé ----
type Envoi = { prevenu: '' | 'ticket' | 'prive'; discordSalonId: string | null; discordMessageId: string | null; avertissement: string };
const echapperMarkdown = (t: string) => t.replace(/[\\*_~`|>#[\]()-]/g, c => `\\${c}`);
const pourquoi = (e: unknown) => e instanceof ErreurDiscord
  ? e.statut === 0 ? 'Discord ne répond pas' : e.statut === 401 ? 'le jeton du bot Discord est refusé' : e.statut === 403 ? 'le bot n’a pas le droit d’y écrire' : e.statut === 429 ? 'Discord demande de ralentir' : `Discord a refusé (HTTP ${e.statut})`
  : 'erreur inattendue';

function texteMessage(discordId: string, ev: { titre: string; jour: string; heureDebut: string; heureFin: string; notes: string }, auteur: string): string {
  const debut = Math.floor(parisVersDate(ev.jour, ev.heureDebut).getTime() / 1000), fin = Math.floor(parisVersDate(ev.jour, ev.heureFin).getTime() / 1000);
  return [`<@${discordId}>`, '', `📅 **${echapperMarkdown(ev.titre)}**`, `<t:${debut}:F> → <t:${fin}:t>`,
    ...(ev.notes ? [echapperMarkdown(ev.notes)] : []), '', `*Ajouté à ton agenda par ${echapperMarkdown(auteur)} · ${echapperMarkdown(site.nom)}*`].join('\n').slice(0, 2000);
}

async function prevenir(discordId: string, nom: string, ev: Parameters<typeof texteMessage>[1], auteur: string): Promise<Envoi> {
  const rien = (avertissement: string): Envoi => ({ prevenu: '', discordSalonId: null, discordMessageId: null, avertissement });
  if (!config.discord.botToken) return rien(`${nom} n’a pas été prévenu sur Discord : le bot n’est pas relié au site.`);
  const contenu = { content: texteMessage(discordId, ev, auteur) };
  // 1. son ticket : salon d'une des catégories réglées où il a une permission à son nom
  const categories = idsRegles('agenda_categories_tickets');
  let ticket: string | null = null;
  if (categories.length) {
    try { ticket = choisirTicket(await appelBot('GET', `/guilds/${config.discord.guildId}/channels`), discordId, categories); }
    catch (e) { console.error('[agenda] salons du serveur :', pourquoi(e)); }
  }
  if (ticket) {
    // ticket trouvé mais refusé : on le dit plutôt que d'écrire ailleurs en silence (droits du bot à corriger)
    try { return { prevenu: 'ticket', discordSalonId: ticket, discordMessageId: await posterMessage(ticket, contenu, [discordId]), avertissement: '' }; }
    catch (e) { return rien(`Le message n’a pas pu être posté dans le ticket de ${nom} (${pourquoi(e)}) : prévenez-le vous-même.`); }
  }
  // 2. sans ticket : message privé
  try {
    const prive = await appelBot('POST', '/users/@me/channels', { recipient_id: discordId }) as { id?: unknown } | null;
    const salon = String(prive?.id ?? '');
    return { prevenu: 'prive', discordSalonId: salon, discordMessageId: await posterMessage(salon, contenu, [discordId]), avertissement: '' };
  } catch (e) {
    const cause = e instanceof ErreurDiscord && e.statut === 403 ? 'ses messages privés sont fermés' : pourquoi(e);
    return rien(`${nom} n’a pas de ticket ouvert et n’a pas pu être prévenu en message privé (${cause}) : prévenez-le vous-même.`);
  }
}

// ---- types d'événements ----
const versType = (t: { id: number; nom: string; couleur: string }) => ({ id: t.id, nom: t.nom, couleur: t.couleur });
const listeTypes = async () => (await prisma.typeAgenda.findMany({ orderBy: [{ position: 'asc' }, { nom: 'asc' }] })).map(versType);

function lireType(b: Record<string, unknown>) {
  const nom = text(b.nom, 40), c = couleur(b.couleur);
  if (!nom) throw new Refus('Donnez un nom au type.');
  if (!c) throw new Refus('Couleur invalide.');
  return { nom, couleur: c };
}
const nomPris = (e: unknown) => (e as { code?: string }).code === 'P2002';

agenda.get('/api/agenda/types', ...valide, async (_req, res) => { res.json({ types: await listeTypes() }); });

agenda.post('/api/agenda/types', ...permission('agenda-types'), traiter(async (req, res) => {
  const t = lireType(body(req));
  if (await prisma.typeAgenda.count() >= 30) throw new Refus('30 types au plus : regroupez-en avant d’en créer un autre.');
  const position = (await prisma.typeAgenda.aggregate({ _max: { position: true } }))._max.position ?? -1;
  try { await prisma.typeAgenda.create({ data: { ...t, position: position + 1 } }); }
  catch (e) { if (nomPris(e)) throw new Refus(`Le type « ${t.nom} » existe déjà.`, 409); throw e; }
  res.status(201).json({ types: await listeTypes() });
}));

agenda.put('/api/agenda/types/:id', ...permission('agenda-types'), traiter(async (req, res) => {
  const t = lireType(body(req));
  try { await prisma.typeAgenda.update({ where: { id: intParam(req, 'id') }, data: t }); }
  catch (e) {
    if (nomPris(e)) throw new Refus(`Le type « ${t.nom} » existe déjà.`, 409);
    if ((e as { code?: string }).code === 'P2025') throw new Refus('Type introuvable.', 404);
    throw e;
  }
  res.json({ types: await listeTypes() });
}));

// ses événements restent, « sans type » (onDelete: SetNull)
agenda.delete('/api/agenda/types/:id', ...permission('agenda-types'), traiter(async (req, res) => {
  await prisma.typeAgenda.deleteMany({ where: { id: intParam(req, 'id') } });
  res.json({ types: await listeTypes() });
}));

// ---- plafonds par grade (fiche du grade, page Grades) ----
// effectifs : enregistrés, sinon le grade lui-même ; '' = aucun
agenda.get('/api/agenda/droits-grades', ...permission('grades'), async (_req, res) => {
  const lignes = new Map((await prisma.agendaDroitsGrade.findMany()).map(l => [l.gradeCle, l]));
  const grades = clesGrades();
  const effectif = (v: string | undefined, propre: string) => v === undefined ? propre : v === '' || grades.includes(v) ? v : propre;
  res.json({ droits: grades.map(cle => {
    const l = lignes.get(cle);
    return { grade: cle, consulter: effectif(l?.consulter, cle), creer: effectif(l?.creer, cle), modifier: effectif(l?.modifier, cle) };
  }) });
});

// mêmes règles que les permissions : un grade sous le sien, jamais un plafond au-dessus de son propre grade
agenda.put('/api/agenda/droits-grades/:cle', ...permission('grades'), traiter(async (req, res) => {
  const cle = String(req.params.cle), b = body(req), grades = clesGrades();
  if (!gradeDe(cle)) throw new Refus('Grade introuvable.', 404);
  if (!auDessusDe(req.compte, cle)) throw new Refus('Vous ne gérez que les grades sous le vôtre.', 403);
  const valeurs = { consulter: String(b.consulter ?? ''), creer: String(b.creer ?? ''), modifier: String(b.modifier ?? '') };
  for (const v of Object.values(valeurs)) {
    if (!plafondAccordable(v, grades, req.compte.gradeCle, req.compte.proprietaire)) throw new Refus('Vous ne pouvez pas ouvrir l’agenda au-dessus de votre propre grade.', 403);
  }
  await prisma.agendaDroitsGrade.upsert({ where: { gradeCle: cle }, create: { gradeCle: cle, ...valeurs }, update: valeurs });
  res.json({ ok: true });
}));

// ---- événements ----
agenda.get('/api/agenda', ...valide, async (req, res) => {
  const { debut, fin } = req.query;
  if (!dateValide(debut) || !dateValide(fin)) { res.status(400).json({ error: 'Plage de dates invalide.' }); return; }
  const droits = await droitsDe(req), grades = clesGrades(), moi = lecteur(req);
  const candidats = await prisma.evenementAgenda.findMany({
    where: {
      jour: { gte: versDate(debut), lte: versDate(fin) },
      OR: [{ compteId: req.compte.id }, { destination: 'perso', cibleDiscordId: req.compte.discordId }, { destination: { in: ['tous', 'grade'] } }],
    },
    orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
    take: 2000,
  });
  // destinations proposées à la création : soi, tout le monde, puis chaque grade atteint (du plus haut au plus bas)
  const destinations = [{ valeur: 'perso', libelle: 'Moi seul' }];
  if (peutCreer(droits, 'tous', null, grades)) destinations.push({ valeur: 'tous', libelle: 'Tout le monde' });
  for (const g of tousLesGrades()) if (peutCreer(droits, 'grade', g.cle, grades)) destinations.push({ valeur: `grade:${g.cle}`, libelle: `${g.libelle} et au-dessus` });
  res.json({
    evenements: candidats.filter(e => voit(e, moi, droits, grades)).slice(0, 1000).map(e => versClient(e, req, droits)),
    types: await listeTypes(),
    droits: { destinations, perso_autrui: droits.tout || droits.creer !== null },
  });
});

// fiches RH proposées pour un « Perso » destiné à quelqu'un d'autre : celles dans la limite de ce qu'on crée
agenda.get('/api/agenda/personnes', ...valide, traiter(async (req, res) => {
  const droits = await droitsDe(req), grades = clesGrades();
  if (!droits.tout && droits.creer === null) throw new Refus('Votre grade ne permet pas de créer un événement pour quelqu’un d’autre.', 403);
  const fiches = await prisma.employe.findMany({ where: { statut: 'actif' }, orderBy: [{ prenom: 'asc' }, { nom: 'asc' }], select: { id: true, prenom: true, nom: true, discordPseudo: true, idEmploye: true, discordId: true, gradeCle: true } });
  res.json({ personnes: fiches.filter(f => f.discordId !== req.compte.discordId && peutCreerPour(droits, f.gradeCle, grades)).map(f => ({ id: f.id, nom: nomComplet(f), discord: !!f.discordId })) });
}));

agenda.post('/api/agenda', ...valide, traiter(async (req, res) => {
  const b = body(req), d = await lire(b), dest = lireDestination(b);
  const droits = await droitsDe(req), grades = clesGrades();
  if (!peutCreer(droits, dest.destination, dest.destinationGrade, grades)) throw refusDestination(dest);
  const auteur = req.compte.nom || req.compte.pseudo;

  const cible = { cibleEmployeId: null as number | null, cibleDiscordId: null as string | null, cibleNom: '' };
  let envoi: Envoi = { prevenu: '', discordSalonId: null, discordMessageId: null, avertissement: '' };
  const pour = b.pour_employe_id, cibleId = entier(pour);
  if (dest.destination === 'perso' && pour !== undefined && pour !== null && pour !== '') {
    const fiche = cibleId === null ? null : await prisma.employe.findFirst({ where: { id: cibleId, statut: 'actif' } });
    if (!fiche) throw new Refus('Personne introuvable dans les fiches RH.', 404);
    const nom = nomComplet(fiche);
    if (!peutCreerPour(droits, fiche.gradeCle, grades)) throw new Refus(`Votre grade ne permet pas de créer un événement pour ${nom}.`, 403);
    // sans ID Discord, l'événement n'apparaîtrait dans aucun agenda : rien n'est créé
    if (!fiche.discordId) throw new Refus(`La fiche RH de ${nom} n’a pas d’ID Discord : l’événement n’apparaîtrait pas dans son agenda. Complétez la fiche dans Ressources humaines.`, 409);
    Object.assign(cible, { cibleEmployeId: fiche.id, cibleDiscordId: fiche.discordId, cibleNom: nom });
    if (fiche.discordId !== req.compte.discordId) envoi = await prevenir(fiche.discordId, nom, { ...d, jour: String(b.jour) }, auteur);
  }

  const { avertissement, ...prevenu } = envoi;
  const e = await prisma.evenementAgenda.create({ data: { ...d, ...dest, ...cible, ...prevenu, compteId: req.compte.id, auteurNom: auteur.slice(0, 64) } });
  res.status(201).json({ id: e.id, prevenu: envoi.prevenu, avertissement });
}));

// un événement qu'on ne peut pas modifier répond 404 s'il est invisible, 403 s'il est seulement visible
async function modifiableOuRefus(req: Request) {
  const e = await prisma.evenementAgenda.findUnique({ where: { id: intParam(req, 'id') } });
  const droits = await droitsDe(req), grades = clesGrades();
  if (!e || !voit(e, lecteur(req), droits, grades)) throw new Refus('Événement introuvable.', 404);
  if (!modifiable(e, lecteur(req), droits, grades)) throw new Refus('Votre grade ne permet pas de modifier cet événement.', 403);
  return { e, droits, grades };
}

agenda.put('/api/agenda/:id', ...valide, traiter(async (req, res) => {
  const { e, droits, grades } = await modifiableOuRefus(req);
  const b = body(req), d = await lire(b);
  // la personne d'un « Perso » pour quelqu'un d'autre ne change pas (elle a déjà été prévenue) ;
  // un autre destinataire, seulement vers ce qu'on peut créer
  let dest = { destination: e.destination as Destination, destinationGrade: e.destinationGrade };
  if (b.destination !== undefined && e.cibleEmployeId === null && !e.cibleDiscordId) {
    const demande = lireDestination(b);
    if (demande.destination !== dest.destination || demande.destinationGrade !== dest.destinationGrade) {
      if (!peutCreer(droits, demande.destination, demande.destinationGrade, grades)) throw refusDestination(demande);
      // l'événement d'un autre ne devient pas privé à soi : il disparaîtrait de l'agenda de son auteur
      if (demande.destination === 'perso' && e.compteId !== req.compte.id) throw new Refus('Seul son auteur peut rendre cet événement personnel.', 403);
      dest = demande;
    }
  }
  await prisma.evenementAgenda.update({ where: { id: e.id }, data: { ...d, ...dest } });
  res.json({ ok: true });
}));

agenda.delete('/api/agenda/:id', ...valide, traiter(async (req, res) => {
  const { e } = await modifiableOuRefus(req);
  await prisma.evenementAgenda.delete({ where: { id: e.id } });
  res.json({ ok: true });
}));
