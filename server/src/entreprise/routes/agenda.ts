// ENTREPRISE — agenda partagé. L’identité vient de la session ; un événement invisible répond comme s’il n’existait pas.
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { EvenementAgenda, InvitationAgenda } from '../../generated/prisma/client.js';
import { config } from '../../socle/config.js';
import { prisma } from '../../socle/db.js';
import { appelBot, ErreurDiscord, ID_DISCORD, posterMessage } from '../../socle/discord.js';
import { auDessusDe, gradeDe, tousLesGrades } from '../../socle/droits.js';
import { body, couleur, entier, intParam, permission, text, valide } from '../../socle/http.js';
import { site } from '../../socle/site.js';
import { choisirTicket, droitsAgenda, droitsInclusDansConsultation, estDestination, gradeAccordable, modifiable, parisVersDate, peutCreer, peutInviter, voit, type Destination, type DroitsAgenda } from '../agenda-regles.js';
import { idsParametre } from '../../socle/parametres.js';

export const agenda = Router();

class Refus extends Error {
  constructor(message: string, readonly statut = 400) { super(message); }
}
const traiter = (f: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
  void f(req, res).catch(e => {
    if (e instanceof Refus) res.status(e.statut).json({ error: e.message });
    else next(e);
  });
};
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const versDate = (jour: string) => new Date(`${jour}T00:00:00.000Z`);
const dateValide = (jour: unknown): jour is string =>
  typeof jour === 'string' && RE_DATE.test(jour) && !Number.isNaN(versDate(jour).getTime()) && versDate(jour).toISOString().startsWith(jour);
const clesGrades = () => tousLesGrades().map(g => g.cle);
const lecteur = (req: Request) => ({ id: req.compte.id, discordId: req.compte.discordId });

async function droitsDe(req: Request): Promise<DroitsAgenda> {
  const grades = clesGrades(), cle = req.compte.gradeCle;
  const enregistres = cle ? await prisma.agendaDroitsGrade.findUnique({ where: { gradeCle: cle } }) : null;
  return droitsAgenda(grades, cle, req.compte.proprietaire, enregistres);
}

const libelleDestination = (e: Pick<EvenementAgenda, 'destination' | 'destinationGrade'>, invitations: Pick<InvitationAgenda, 'nom'>[]): string =>
  e.destination === 'tous' ? 'Toute l’équipe'
    : e.destination === 'grade' ? gradeDe(e.destinationGrade)?.libelle ?? 'Grade supprimé'
      : invitations.length === 1 ? `Personnel — ${invitations[0].nom}`
        : invitations.length ? `Personnel — ${invitations.length} invités` : 'Personnel — moi uniquement';

type EvenementAvecInvitations = EvenementAgenda & { invitations: InvitationAgenda[] };
const versClient = (e: EvenementAvecInvitations, req: Request, droits: DroitsAgenda) => ({
  id: e.id,
  titre: e.titre,
  jour: e.jour.toISOString().slice(0, 10),
  heure_debut: e.heureDebut,
  heure_fin: e.heureFin,
  notes: e.notes,
  type_id: e.typeId,
  destination: e.destination,
  destination_grade: e.destinationGrade,
  destinataire: libelleDestination(e, e.invitations),
  auteur: e.auteurNom,
  mien: e.compteId === req.compte.id,
  invites: e.invitations.map(({ id, nom, prevenu }) => ({
    ...(e.compteId === req.compte.id ? { invitation_id: id } : {}),
    nom, prevenu,
  })),
  modifiable: modifiable(e, lecteur(req), droits),
});

type Champs = { titre: string; jour: Date; heureDebut: string; heureFin: string; notes: string; typeId: number | null };
async function lire(b: Record<string, unknown>): Promise<Champs> {
  const titre = text(b.titre, 80);
  if (!titre) throw new Refus('Le titre de l’événement est obligatoire.');
  if (!dateValide(b.jour)) throw new Refus('Date invalide : écrivez-la au format jj/mm/aaaa.');
  const debut = String(b.heure_debut ?? ''), fin = String(b.heure_fin ?? '');
  if (!RE_HEURE.test(debut) || !RE_HEURE.test(fin)) throw new Refus('Heures invalides : utilisez le format 14:30.');
  if (fin <= debut) throw new Refus('L’heure de fin doit être après l’heure de début.');
  if (typeof b.notes === 'string' && b.notes.length > 500) throw new Refus('Les notes ne peuvent pas dépasser 500 caractères.');
  let typeId: number | null = null;
  if (b.type_id !== undefined && b.type_id !== null && b.type_id !== '') {
    typeId = entier(b.type_id);
    if (typeId === null || !await prisma.typeAgenda.findUnique({ where: { id: typeId } })) throw new Refus('Ce type n’existe plus : choisissez-en un autre.');
  }
  return { titre, jour: versDate(b.jour), heureDebut: debut, heureFin: fin, notes: text(b.notes, 500), typeId };
}

function lireDestination(b: Record<string, unknown>): { destination: Destination; destinationGrade: string | null } {
  const destination = b.destination === undefined ? 'perso' : b.destination;
  if (!estDestination(destination)) throw new Refus('Destination invalide.');
  if (destination !== 'grade') return { destination, destinationGrade: null };
  const g = gradeDe(String(b.destination_grade ?? ''));
  if (!g) throw new Refus('Ce grade n’existe plus : choisissez un autre destinataire.');
  return { destination, destinationGrade: g.cle };
}

const listeTypes = async () => prisma.typeAgenda.findMany({ orderBy: [{ position: 'asc' }, { nom: 'asc' }] });
const nomPris = (e: unknown) => (e as { code?: string }).code === 'P2002';

type Envoi = { prevenu: '' | 'ticket' | 'prive'; discordSalonId: string | null; discordMessageId: string | null; avertissement: string };
const echapperMarkdown = (t: string) => t.replace(/[\\*_~`|>#[\]()-]/g, c => `\\${c}`);
const pourquoi = (e: unknown) => e instanceof ErreurDiscord
  ? e.statut === 0 ? 'Discord ne répond pas' : e.statut === 401 ? 'le jeton du bot Discord est refusé' : e.statut === 403 ? 'le bot n’a pas le droit d’y écrire' : e.statut === 429 ? 'Discord demande de ralentir' : `Discord a refusé (HTTP ${e.statut})`
  : 'erreur inattendue';

function texteInvitation(discordId: string, ev: { titre: string; jour: string; heureDebut: string; heureFin: string; notes: string }, auteur: string): string {
  const debut = Math.floor(parisVersDate(ev.jour, ev.heureDebut).getTime() / 1000), fin = Math.floor(parisVersDate(ev.jour, ev.heureFin).getTime() / 1000);
  return [`<@${discordId}>`, '', `📅 **${echapperMarkdown(ev.titre)}**`, `<t:${debut}:F> → <t:${fin}:t>`,
    ...(ev.notes ? [echapperMarkdown(ev.notes)] : []), '', `*Ajouté à ton agenda par ${echapperMarkdown(auteur)} · ${echapperMarkdown(site.nom)}*`].join('\n').slice(0, 2000);
}

async function prevenir(discordId: string, nom: string, ev: Parameters<typeof texteInvitation>[1], auteur: string): Promise<Envoi> {
  const rien = (avertissement: string): Envoi => ({ prevenu: '', discordSalonId: null, discordMessageId: null, avertissement });
  if (!config.discord.botToken) return rien(`${nom} n’a pas été prévenu sur Discord : le bot n’est pas relié au site.`);
  const contenu = { content: texteInvitation(discordId, ev, auteur) };
  const categories = idsParametre('agenda_categories_tickets');
  let ticket: string | null = null;
  if (categories.length) {
    try { ticket = choisirTicket(await appelBot('GET', `/guilds/${config.discord.guildId}/channels`), discordId, categories); }
    catch (e) { console.error('[agenda] salons du serveur :', pourquoi(e)); }
  }
  if (ticket) {
    try { return { prevenu: 'ticket', discordSalonId: ticket, discordMessageId: await posterMessage(ticket, contenu, [discordId]), avertissement: '' }; }
    catch (e) { return rien(`Le message n’a pas pu être posté dans le ticket de ${nom} (${pourquoi(e)}) : prévenez-le vous-même.`); }
  }
  try {
    const prive = await appelBot('POST', '/users/@me/channels', { recipient_id: discordId }) as { id?: unknown } | null;
    const salon = String(prive?.id ?? '');
    return { prevenu: 'prive', discordSalonId: salon, discordMessageId: await posterMessage(salon, contenu, [discordId]), avertissement: '' };
  } catch (e) {
    const cause = e instanceof ErreurDiscord && e.statut === 403 ? 'ses messages privés sont fermés' : pourquoi(e);
    return rien(`${nom} n’a pas de ticket ouvert et n’a pas pu être prévenu en message privé (${cause}) : prévenez-le vous-même.`);
  }
}

async function prevenirRetrait(invitation: InvitationAgenda, titre: string): Promise<string> {
  if (!invitation.prevenu || !invitation.discordSalonId) return '';
  if (!config.discord.botToken) return `${invitation.nom} a été retiré de l’événement, mais le bot Discord n’est plus relié : l’ancienne invitation n’a pas pu être signalée.`;
  try {
    await posterMessage(invitation.discordSalonId, {
      content: `<@${invitation.discordId}> — l’événement **${echapperMarkdown(titre)}** a été retiré de votre agenda par son organisateur.`,
    }, [invitation.discordId]);
    return '';
  } catch (e) {
    return `${invitation.nom} a été retiré de l’événement, mais l’annulation n’a pas pu être signalée sur Discord (${pourquoi(e)}).`;
  }
}

agenda.get('/api/agenda/types', ...valide, async (_req, res) => { res.json({ types: await listeTypes() }); });
agenda.post('/api/agenda/types', ...permission('agenda-types'), traiter(async (req, res) => {
  const b = body(req), nom = text(b.nom, 40), c = couleur(b.couleur);
  if (!nom) throw new Refus('Donnez un nom au type.');
  if (!c) throw new Refus('Choisissez une couleur valide.');
  if (await prisma.typeAgenda.count() >= 30) throw new Refus('30 types au plus : supprimez-en un avant d’en créer un autre.', 409);
  const position = (await prisma.typeAgenda.aggregate({ _max: { position: true } }))._max.position ?? -1;
  try { await prisma.typeAgenda.create({ data: { nom, couleur: c, position: position + 1 } }); }
  catch (e) { if (nomPris(e)) throw new Refus(`Le type « ${nom} » existe déjà.`, 409); throw e; }
  res.status(201).json({ types: await listeTypes() });
}));
agenda.put('/api/agenda/types/:id', ...permission('agenda-types'), traiter(async (req, res) => {
  const b = body(req), nom = text(b.nom, 40), c = couleur(b.couleur);
  if (!nom) throw new Refus('Donnez un nom au type.');
  if (!c) throw new Refus('Choisissez une couleur valide.');
  try { await prisma.typeAgenda.update({ where: { id: intParam(req, 'id') }, data: { nom, couleur: c } }); }
  catch (e) {
    if (nomPris(e)) throw new Refus(`Le type « ${nom} » existe déjà.`, 409);
    if ((e as { code?: string }).code === 'P2025') throw new Refus('Type introuvable.', 404);
    throw e;
  }
  res.json({ types: await listeTypes() });
}));
agenda.delete('/api/agenda/types/:id', ...permission('agenda-types'), traiter(async (req, res) => {
  await prisma.typeAgenda.deleteMany({ where: { id: intParam(req, 'id') } });
  res.json({ types: await listeTypes() });
}));

agenda.get('/api/agenda/personnes', ...valide, traiter(async (req, res) => {
  const droits = await droitsDe(req), grades = clesGrades();
  if (!droits.tout && droits.creer.length === 0) throw new Refus('Votre grade ne permet pas d’inviter des personnes.', 403);
  const comptes = await prisma.compte.findMany({
    where: { statut: 'valide' },
    orderBy: [{ nom: 'asc' }, { pseudo: 'asc' }],
    select: { id: true, nom: true, pseudo: true, gradeCle: true, discordId: true },
  });
  res.json({
    personnes: comptes.filter(c => c.id !== req.compte.id && peutInviter(droits, c.gradeCle, grades))
      .map(c => ({ id: c.id, nom: c.nom || c.pseudo, discord: true })),
  });
}));

agenda.get('/api/agenda/droits-grades', ...permission('grades'), async (_req, res) => {
  const lignes = new Map((await prisma.agendaDroitsGrade.findMany()).map(l => [l.gradeCle, l]));
  const grades = clesGrades();
  res.json({ droits: grades.map(grade => {
    const d = droitsAgenda(grades, grade, false, lignes.get(grade) ?? null);
    return { grade, consulter: d.consulter, creer: d.creer, modifier: d.modifier, consulter_tous: d.consulterTous, gerer_tous: d.gererTous };
  }) });
});

agenda.put('/api/agenda/droits-grades/:cle', ...permission('grades'), traiter(async (req, res) => {
  const cle = String(req.params.cle), b = body(req), grades = clesGrades();
  if (!gradeDe(cle)) throw new Refus('Grade introuvable.', 404);
  if (!auDessusDe(req.compte, cle)) throw new Refus('Vous ne gérez que les grades sous le vôtre.', 403);
  const lireListe = (valeur: unknown, nom: string): string[] => {
    if (!Array.isArray(valeur) || valeur.some(v => typeof v !== 'string') || new Set(valeur).size !== valeur.length) throw new Refus(`La sélection « ${nom} » est invalide.`);
    const liste = valeur as string[];
    if (liste.some(c => !gradeAccordable(c, grades, req.compte.gradeCle, req.compte.proprietaire))) throw new Refus('Vous ne pouvez accorder des droits qu’à votre grade ou à un grade inférieur.', 403);
    return liste;
  };
  const selection = {
    consulter: lireListe(b.consulter, 'Consulter'),
    creer: lireListe(b.creer, 'Créer'),
    modifier: lireListe(b.modifier, 'Modifier'),
  };
  if (typeof b.consulter_tous !== 'boolean' || typeof b.gerer_tous !== 'boolean') throw new Refus('Choisissez les droits d’agenda pour toute l’équipe.');
  if (b.gerer_tous && !b.consulter_tous) throw new Refus('La gestion des événements d’équipe nécessite aussi leur consultation.');
  if (!droitsInclusDansConsultation(selection.consulter, selection.creer) || !droitsInclusDansConsultation(selection.consulter, selection.modifier)) throw new Refus('Créer ou modifier des événements nécessite aussi le droit de les consulter.');
  const [acteur, existant] = await Promise.all([
    droitsDe(req),
    prisma.agendaDroitsGrade.findUnique({ where: { gradeCle: cle } }),
  ]);
  const anciens = droitsAgenda(grades, cle, false, existant);
  for (const action of ['consulter', 'creer', 'modifier'] as const) {
    const nouvelles = selection[action].filter(c => !anciens[action].includes(c));
    if (!acteur.tout && nouvelles.some(c => !acteur[action].includes(c))) throw new Refus(`Vous ne pouvez accorder que les droits « ${action} » que vous détenez pour chaque grade.`, 403);
  }
  if (!acteur.tout && b.consulter_tous && !acteur.consulterTous && !anciens.consulterTous) throw new Refus('Vous ne pouvez pas accorder la consultation des événements d’équipe.', 403);
  if (!acteur.tout && b.gerer_tous && !acteur.gererTous && !anciens.gererTous) throw new Refus('Vous ne pouvez pas accorder la gestion des événements d’équipe.', 403);
  const droits = { ...selection, consulterTous: b.consulter_tous, gererTous: b.gerer_tous };
  await prisma.agendaDroitsGrade.upsert({ where: { gradeCle: cle }, create: { gradeCle: cle, ...droits }, update: droits });
  res.json({ ok: true });
}));

agenda.get('/api/agenda', ...valide, async (req, res) => {
  const debut = req.query.debut, fin = req.query.fin;
  if (!dateValide(debut) || !dateValide(fin) || debut > fin) { res.status(400).json({ error: 'Plage de dates invalide.' }); return; }
  const droits = await droitsDe(req), grades = tousLesGrades(), moi = lecteur(req);
  const evenements = await prisma.evenementAgenda.findMany({
    where: {
      jour: { gte: versDate(debut), lte: versDate(fin) },
      OR: [
        { compteId: req.compte.id },
        { invitations: { some: { discordId: req.compte.discordId } } },
        { destination: { in: ['tous', 'grade'] } },
      ],
    },
    orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
    take: 1000,
    include: { invitations: true },
  });
  const destinations = [{ valeur: 'perso', libelle: 'Moi uniquement' }];
  if (peutCreer(droits, 'tous', null)) destinations.push({ valeur: 'tous', libelle: 'Toute l’équipe' });
  for (const g of grades) if (peutCreer(droits, 'grade', g.cle)) destinations.push({ valeur: `grade:${g.cle}`, libelle: g.libelle });
  res.json({
    evenements: evenements.filter(e => voit({ ...e, invitesDiscordIds: e.invitations.map(i => i.discordId) }, moi, droits)).map(e => versClient(e, req, droits)),
    types: await listeTypes(),
    droits: { destinations, peut_inviter: droits.tout || droits.creer.length > 0 },
  });
});

agenda.post('/api/agenda', ...valide, traiter(async (req, res) => {
  const b = body(req), champs = await lire(b), dest = lireDestination(b), droits = await droitsDe(req);
  if (!peutCreer(droits, dest.destination, dest.destinationGrade)) throw new Refus('Votre grade ne permet pas de créer un événement pour cette destination.', 403);
  const valeurs = b.invites_compte_ids;
  if (valeurs !== undefined && (!Array.isArray(valeurs) || valeurs.length > 100 || valeurs.some(id => entier(id) === null))) {
    throw new Refus('La liste des personnes à inviter est invalide.');
  }
  const ids: number[] = [];
  for (const valeur of Array.isArray(valeurs) ? valeurs : []) {
    const id = entier(valeur);
    if (id === null || ids.includes(id)) throw new Refus('La liste des personnes à inviter est invalide.');
    ids.push(id);
  }
  if (ids.length && dest.destination !== 'perso') throw new Refus('Les personnes ne peuvent être invitées que pour un événement personnel.');
  const comptes = ids.length ? await prisma.compte.findMany({ where: { id: { in: ids }, statut: 'valide' } }) : [];
  if (comptes.length !== ids.length) throw new Refus('Une personne sélectionnée est introuvable ou n’est plus active.', 404);
  const parId = new Map(comptes.map(c => [c.id, c]));
  const personnes = ids.map(id => {
    const compte = parId.get(id);
    if (!compte) throw new Refus('Une personne sélectionnée est introuvable ou n’est plus active.', 404);
    const nom = compte.nom || compte.pseudo;
    if (!peutInviter(droits, compte.gradeCle, clesGrades())) throw new Refus(`Votre grade ne permet pas d’inviter ${nom}.`, 403);
    if (compte.id === req.compte.id) throw new Refus('Vous ne pouvez pas vous inviter vous-même.');
    if (!ID_DISCORD.test(compte.discordId)) throw new Refus(`Le compte de ${nom} ne peut pas recevoir d’invitation Discord.`, 409);
    return { discordId: compte.discordId, nom };
  });
  const auteur = req.compte.nom || req.compte.pseudo;
  const e = await prisma.evenementAgenda.create({
    data: {
      ...champs, ...dest, compteId: req.compte.id, auteurNom: auteur.slice(0, 64),
      invitations: { create: personnes },
    },
    include: { invitations: true },
  });
  const notifications: { nom: string; prevenu: Envoi['prevenu'] }[] = [], avertissements: string[] = [];
  for (const invitation of e.invitations) {
    const envoi = await prevenir(invitation.discordId, invitation.nom, { ...champs, jour: String(b.jour) }, auteur);
    await prisma.invitationAgenda.update({
      where: { id: invitation.id },
      data: { prevenu: envoi.prevenu, discordSalonId: envoi.discordSalonId, discordMessageId: envoi.discordMessageId },
    });
    notifications.push({ nom: invitation.nom, prevenu: envoi.prevenu });
    if (envoi.avertissement) avertissements.push(envoi.avertissement);
  }
  res.status(201).json({ id: e.id, notifications, avertissements });
}));

async function evenementModifiable(req: Request) {
  const e = await prisma.evenementAgenda.findUnique({ where: { id: intParam(req, 'id') }, include: { invitations: true } });
  const droits = await droitsDe(req);
  if (!e || !voit({ ...e, invitesDiscordIds: e.invitations.map(i => i.discordId) }, lecteur(req), droits)) throw new Refus('Événement introuvable.', 404);
  if (!modifiable(e, lecteur(req), droits)) throw new Refus('Votre grade ne permet pas de modifier cet événement.', 403);
  return { e, droits };
}

agenda.put('/api/agenda/:id', ...valide, traiter(async (req, res) => {
  const { e, droits } = await evenementModifiable(req), b = body(req), champs = await lire(b);
  const invitationIds: number[] = [];
  if (b.invitation_ids === undefined) invitationIds.push(...e.invitations.map(i => i.id));
  else {
    if (!Array.isArray(b.invitation_ids) || b.invitation_ids.length > 100) throw new Refus('La liste des invitations est invalide.');
    for (const valeur of b.invitation_ids) {
      const id = entier(valeur);
      if (id === null || invitationIds.includes(id) || !e.invitations.some(i => i.id === id)) throw new Refus('La liste des invitations est invalide.');
      invitationIds.push(id);
    }
  }
  const valeursComptes = b.invites_compte_ids;
  if (valeursComptes !== undefined && (!Array.isArray(valeursComptes) || valeursComptes.length > 100)) throw new Refus('La liste des personnes à inviter est invalide.');
  const compteIds: number[] = [];
  for (const valeur of Array.isArray(valeursComptes) ? valeursComptes : []) {
    const id = entier(valeur);
    if (id === null || compteIds.includes(id)) throw new Refus('La liste des personnes à inviter est invalide.');
    compteIds.push(id);
  }
  const comptes = compteIds.length ? await prisma.compte.findMany({ where: { id: { in: compteIds }, statut: 'valide' } }) : [];
  if (comptes.length !== compteIds.length) throw new Refus('Une personne sélectionnée est introuvable ou n’est plus active.', 404);
  const parId = new Map(comptes.map(c => [c.id, c]));
  const invitesExistants = e.invitations.filter(i => invitationIds.includes(i.id));
  const discordDejaInvite = new Set(invitesExistants.map(i => i.discordId));
  const nouvellesPersonnes = compteIds.map(id => {
    const compte = parId.get(id);
    if (!compte) throw new Refus('Une personne sélectionnée est introuvable ou n’est plus active.', 404);
    const nom = compte.nom || compte.pseudo;
    if (!peutInviter(droits, compte.gradeCle, clesGrades())) throw new Refus(`Votre grade ne permet pas d’inviter ${nom}.`, 403);
    if (compte.id === req.compte.id) throw new Refus('Vous ne pouvez pas vous inviter vous-même.');
    if (!ID_DISCORD.test(compte.discordId)) throw new Refus(`Le compte de ${nom} ne peut pas recevoir d’invitation Discord.`, 409);
    if (discordDejaInvite.has(compte.discordId)) return null;
    discordDejaInvite.add(compte.discordId);
    return { discordId: compte.discordId, nom };
  }).filter((personne): personne is { discordId: string; nom: string } => personne !== null);
  let dest = { destination: e.destination as Destination, destinationGrade: e.destinationGrade };
  if (b.destination !== undefined && invitationIds.length === 0 && nouvellesPersonnes.length === 0) {
    const demande = lireDestination(b);
    if (demande.destination !== dest.destination || demande.destinationGrade !== dest.destinationGrade) {
      if (!peutCreer(droits, demande.destination, demande.destinationGrade)) throw new Refus('Votre grade ne permet pas de déplacer l’événement vers cette destination.', 403);
      if (demande.destination === 'perso' && e.compteId !== req.compte.id) throw new Refus('Seul l’auteur peut rendre cet événement personnel.', 403);
      dest = demande;
    }
  }
  if ((invitationIds.length || nouvellesPersonnes.length) && dest.destination !== 'perso') throw new Refus('Les personnes ne peuvent être invitées que pour un événement personnel.');
  const retires = e.invitations.filter(i => !invitationIds.includes(i.id));
  const ajoutes = await prisma.$transaction(async tx => {
    await tx.evenementAgenda.update({ where: { id: e.id }, data: { ...champs, ...dest } });
    if (retires.length) await tx.invitationAgenda.deleteMany({ where: { id: { in: retires.map(i => i.id) } } });
    return nouvellesPersonnes.length
      ? Promise.all(nouvellesPersonnes.map(p => tx.invitationAgenda.create({ data: { evenementId: e.id, ...p } })))
      : [];
  });
  const auteur = req.compte.nom || req.compte.pseudo;
  const notifications: { nom: string; prevenu: Envoi['prevenu'] }[] = [], avertissements: string[] = [];
  for (const invitation of ajoutes) {
    const envoi = await prevenir(invitation.discordId, invitation.nom, { ...champs, jour: String(b.jour) }, auteur);
    await prisma.invitationAgenda.update({
      where: { id: invitation.id },
      data: { prevenu: envoi.prevenu, discordSalonId: envoi.discordSalonId, discordMessageId: envoi.discordMessageId },
    });
    notifications.push({ nom: invitation.nom, prevenu: envoi.prevenu });
    if (envoi.avertissement) avertissements.push(envoi.avertissement);
  }
  let annulations = 0;
  for (const invitation of retires) {
    const avertissement = await prevenirRetrait(invitation, e.titre);
    if (!avertissement && invitation.prevenu) annulations++;
    if (avertissement) avertissements.push(avertissement);
  }
  res.json({ ok: true, notifications, annulations, avertissements });
}));

agenda.delete('/api/agenda/:id', ...valide, traiter(async (req, res) => {
  const { e } = await evenementModifiable(req);
  await prisma.evenementAgenda.delete({ where: { id: e.id } });
  res.json({ ok: true });
}));
