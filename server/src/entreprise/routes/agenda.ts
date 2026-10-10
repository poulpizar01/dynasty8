// ENTREPRISE — Agenda de l'espace agents (gestion/agenda.html). Règles de visibilité dans agenda-regles.ts : chacun
// voit ses propres événements, ceux qu'on a créés pour lui (« Perso » pour quelqu'un d'autre) et les événements
// partagés que ses rôles Discord lui ouvrent. L'identité vient toujours de la session ; un événement qu'on ne voit pas
// répond 404, comme un événement inexistant.
// « Perso » pour quelqu'un d'autre : son ID Discord est lu dans sa fiche RH, son ticket (Ticket Tool, catégories
// réglées dans Paramètres) est retrouvé et le bot y poste l'événement en le mentionnant. Sans ticket, sans ID Discord
// ou si Discord refuse : rien n'est créé, et le créateur sait pourquoi.
import { Router, type Request } from 'express';
import type { EvenementAgenda } from '../../generated/prisma/client.js';
import { config } from '../../socle/config.js';
import { prisma } from '../../socle/db.js';
import { appelBot, ErreurDiscord, posterMessage } from '../../socle/discord.js';
import { peut } from '../../socle/droits.js';
import { body, entier, intParam, text, valide } from '../../socle/http.js';
import { choisirTicket, droitsAgenda, estVisibilite, LIBELLES, PARTAGEES, parisVersDate, VISIBILITES, type DroitsAgenda, type Visibilite } from '../agenda-regles.js';
import { idsRegles } from '../parametres.js';
import { Refus, traiter } from '../refus.js';
import { nomComplet } from '../rh.js';

export const agenda = Router();

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
// jour sans heure : stocké en DATE, échangé en AAAA-MM-JJ (jamais d'heure ni de fuseau qui le décalerait)
const versDate = (jour: string) => new Date(`${jour}T00:00:00Z`);
const dateValide = (jour: unknown): jour is string => typeof jour === 'string' && RE_DATE.test(jour) && !Number.isNaN(versDate(jour).getTime()) && versDate(jour).toISOString().startsWith(jour);

const droitsDe = (req: Request): DroitsAgenda => droitsAgenda(req.compte.rolesDiscord ?? [], peut(req.compte, 'parametres'), idsRegles);

// modifiable par son auteur (dans la limite de ce qu'il peut créer) ; un événement partagé aussi par qui a la
// permission « parametres ». Le « Perso » d'un autre ne se modifie jamais : seul son auteur le gère.
function modifiable(e: EvenementAgenda, req: Request, droits: DroitsAgenda): boolean {
  const vis = e.visibilite as Visibilite;
  if (e.compteId === req.compte.id) return vis === 'perso' || droits.cree.has(vis);
  return vis !== 'perso' && peut(req.compte, 'parametres');
}

const versClient = (e: EvenementAgenda, req: Request, droits: DroitsAgenda) => ({
  id: e.id, titre: e.titre, jour: e.jour.toISOString().slice(0, 10), heure_debut: e.heureDebut, heure_fin: e.heureFin, notes: e.notes,
  visibilite: e.visibilite, auteur: e.auteurNom, mien: e.compteId === req.compte.id,
  pour: e.cibleNom, envoye_discord: !!e.discordMessageId, modifiable: modifiable(e, req, droits),
});

function lire(b: Record<string, unknown>) {
  const titre = text(b.titre, 80);
  if (!titre) return 'Le titre de l’événement est obligatoire.';
  if (!dateValide(b.jour)) return 'Date invalide.';
  const debut = String(b.heure_debut ?? ''), fin = String(b.heure_fin ?? '');
  if (!RE_HEURE.test(debut)) return 'Heure de début invalide.';
  if (!RE_HEURE.test(fin)) return 'Heure de fin invalide.';
  if (fin <= debut) return 'L’heure de fin doit être après l’heure de début.';
  if (String(b.notes ?? '').length > 500) return 'Le descriptif est trop long (500 caractères maximum).';
  if (b.visibilite !== undefined && !estVisibilite(b.visibilite)) return 'Visibilité inconnue.';
  return { titre, jour: versDate(b.jour), heureDebut: debut, heureFin: fin, notes: text(b.notes, 500) };
}

// ---- ticket Discord de la personne ----
// erreur de Discord (socle/discord.ts) → refus lisible par le créateur : rien n'est créé
async function discord<T>(appel: () => Promise<T>): Promise<T> {
  try { return await appel(); }
  catch (e) {
    if (!(e instanceof ErreurDiscord)) throw e;
    const cause = e.statut === 0 ? 'Discord ne répond pas'
      : e.statut === 401 ? 'Le jeton du bot Discord (DISCORD_BOT_TOKEN) est refusé — prévenez la personne qui gère le serveur du site'
      : e.statut === 403 ? 'Le bot n’a pas le droit de voir les salons ou d’écrire dans ce ticket (« Voir le salon », « Envoyer des messages », « Intégrer des liens »)'
      : e.statut === 429 ? 'Discord demande de ralentir' : `Discord a refusé la demande (HTTP ${e.statut})`;
    const reessayer = e.statut === 0 || e.statut === 429 ? ' Réessayez dans un instant.' : '';
    throw new Refus(`${cause} : l’événement n’a pas été créé.${reessayer}`, e.statut === 401 || e.statut === 429 ? 503 : 502);
  }
}

async function posterDansTicket(salonId: string, discordId: string, ev: { titre: string; jour: string; heureDebut: string; heureFin: string; notes: string }, auteur: string): Promise<string | null> {
  const debut = Math.floor(parisVersDate(ev.jour, ev.heureDebut).getTime() / 1000), fin = Math.floor(parisVersDate(ev.jour, ev.heureFin).getTime() / 1000);
  // posterMessage : seule la personne est notifiée, quoi que contienne le texte
  return discord(() => posterMessage(salonId, {
    content: `<@${discordId}>`,
    embeds: [{
      title: `📅 ${ev.titre}`.slice(0, 256),
      description: ev.notes ? ev.notes.slice(0, 2000) : undefined,
      color: 0xc9a55c,
      fields: [{ name: 'Début', value: `<t:${debut}:F>`, inline: true }, { name: 'Fin', value: `<t:${fin}:t>`, inline: true }],
      footer: { text: `Agenda — ajouté par ${auteur}`.slice(0, 2048) },
    }],
  }, [discordId]));
}

// ---- routes ----
agenda.get('/api/agenda', ...valide, async (req, res) => {
  const { debut, fin } = req.query;
  if (!dateValide(debut) || !dateValide(fin)) { res.status(400).json({ error: 'Plage de dates invalide.' }); return; }
  const droits = droitsDe(req);
  const evenements = await prisma.evenementAgenda.findMany({
    where: {
      jour: { gte: versDate(debut), lte: versDate(fin) },
      OR: [
        { compteId: req.compte.id },
        { visibilite: 'perso', cibleDiscordId: req.compte.discordId },
        { visibilite: { in: PARTAGEES.filter(v => droits.voit.has(v)) } },
      ],
    },
    orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
    take: 1000,
  });
  res.json({
    evenements: evenements.map(e => versClient(e, req, droits)),
    droits: { cree: VISIBILITES.filter(v => droits.cree.has(v)), perso_autrui: droits.persoAutrui },
  });
});

// fiches RH proposées pour un « Perso » destiné à quelqu'un d'autre
agenda.get('/api/agenda/personnes', ...valide, async (req, res) => {
  if (!droitsDe(req).persoAutrui) { res.status(403).json({ error: 'Votre rôle ne permet pas de créer un événement pour quelqu’un d’autre.' }); return; }
  const fiches = await prisma.employe.findMany({ where: { statut: 'actif' }, orderBy: [{ prenom: 'asc' }, { nom: 'asc' }], select: { id: true, prenom: true, nom: true, discordPseudo: true, idEmploye: true, discordId: true } });
  res.json({ personnes: fiches.map(f => ({ id: f.id, nom: nomComplet(f), discord: !!f.discordId })) });
});

agenda.post('/api/agenda', ...valide, traiter(async (req, res) => {
  const b = body(req), d = lire(b);
  if (typeof d === 'string') throw new Refus(d);
  const droits = droitsDe(req), visibilite: Visibilite = estVisibilite(b.visibilite) ? b.visibilite : 'perso';
  if (!droits.cree.has(visibilite)) throw new Refus(`Votre rôle ne permet pas de créer un événement « ${LIBELLES[visibilite]} ».`, 403);
  const auteur = req.compte.nom || req.compte.pseudo;

  const cible = { cibleEmployeId: null as number | null, cibleDiscordId: null as string | null, cibleNom: '', discordSalonId: null as string | null, discordMessageId: null as string | null };
  const pour = b.pour_employe_id, cibleId = entier(pour);
  if (visibilite === 'perso' && pour !== undefined && pour !== null && pour !== '') {
    if (!droits.persoAutrui) throw new Refus('Votre rôle ne permet pas de créer un événement pour quelqu’un d’autre.', 403);
    const fiche = cibleId === null ? null : await prisma.employe.findFirst({ where: { id: cibleId, statut: 'actif' } });
    if (!fiche) throw new Refus('Personne introuvable dans les fiches RH.', 404);
    const nom = nomComplet(fiche);
    if (!fiche.discordId) throw new Refus(`La fiche RH de ${nom} n’a pas d’ID Discord : impossible de retrouver son ticket. Complétez la fiche dans Ressources humaines.`, 409);
    if (fiche.discordId !== req.compte.discordId) {
      const categories = idsRegles('agenda_categories_tickets');
      if (!config.discord.botToken) throw new Refus('Envoi dans les tickets non configuré sur le serveur (DISCORD_BOT_TOKEN du .env) : l’événement n’a pas été créé.', 503);
      if (!categories.length) throw new Refus('Aucune catégorie de tickets n’est réglée dans Paramètres → Agenda partagé : l’événement n’a pas été créé.', 503);
      const ticket = choisirTicket(await discord(() => appelBot('GET', `/guilds/${config.discord.guildId}/channels`)),fiche.discordId, categories);
      if (!ticket) throw new Refus(`Aucun ticket ouvert par ${nom} n’a été trouvé dans les catégories réglées : l’événement n’a pas été créé. Vérifiez que ${nom} a bien un ticket ouvert.`, 409);
      cible.discordSalonId = ticket;
      cible.discordMessageId = await posterDansTicket(ticket, fiche.discordId, { ...d, jour: String(b.jour) }, auteur);
    }
    Object.assign(cible, { cibleEmployeId: fiche.id, cibleDiscordId: fiche.discordId, cibleNom: nom });
  }

  const e = await prisma.evenementAgenda.create({ data: { ...d, ...cible, visibilite, compteId: req.compte.id, auteurNom: auteur.slice(0, 64) } });
  res.status(201).json({ id: e.id, envoye_discord: !!cible.discordMessageId });
}));

// un événement qu'on ne peut pas modifier répond 404 s'il est invisible, 403 s'il est seulement visible
async function modifiableOuRefus(req: Request) {
  const e = await prisma.evenementAgenda.findUnique({ where: { id: intParam(req, 'id') } });
  const droits = droitsDe(req);
  const visible = e && (e.compteId === req.compte.id || (e.visibilite === 'perso' ? e.cibleDiscordId === req.compte.discordId : droits.voit.has(e.visibilite as Visibilite)));
  if (!e || !visible) throw new Refus('Événement introuvable.', 404);
  if (!modifiable(e, req, droits)) throw new Refus('Vous ne pouvez pas modifier cet événement.', 403);
  return { e, droits };
}

agenda.put('/api/agenda/:id', ...valide, traiter(async (req, res) => {
  const { e, droits } = await modifiableOuRefus(req);
  const b = body(req), d = lire(b);
  if (typeof d === 'string') throw new Refus(d);
  // la personne d'un « Perso » pour quelqu'un d'autre ne change pas (le message est déjà dans son ticket) ;
  // la visibilité, seulement vers ce qu'on peut créer
  let visibilite = (estVisibilite(b.visibilite) ? b.visibilite : e.visibilite) as Visibilite;
  if (e.cibleEmployeId !== null || e.cibleDiscordId) visibilite = 'perso';
  if (visibilite !== e.visibilite && !droits.cree.has(visibilite)) throw new Refus(`Votre rôle ne permet pas de créer un événement « ${LIBELLES[visibilite]} ».`, 403);
  await prisma.evenementAgenda.update({ where: { id: e.id }, data: { ...d, visibilite } });
  res.json({ ok: true });
}));

agenda.delete('/api/agenda/:id', ...valide, traiter(async (req, res) => {
  const { e } = await modifiableOuRefus(req);
  await prisma.evenementAgenda.delete({ where: { id: e.id } });
  res.json({ ok: true });
}));
