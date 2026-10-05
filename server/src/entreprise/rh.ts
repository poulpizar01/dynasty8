// ENTREPRISE — ressources humaines : la fiche employé, source de vérité de l'identité, du grade et du statut (table
// employes). Logique partagée par les routes (routes/rh.ts) et le traitement des candidatures du bot Discord.
// Permissions (vérifiées côté serveur, l'interface ne fait que suivre) : rh-voir, rh-creer, rh-modifier,
// rh-desactiver, rh-reactiver, rh-sensible (téléphone, RIB), rh-parametrer (réglages du bot). Elles se cochent par
// grade dans la page Grades ; le propriétaire du serveur Discord les a toutes.
import crypto from 'node:crypto';
import { Prisma, type Compte, type Employe } from '../generated/prisma/client.js';
import { prisma } from '../socle/db.js';
import { auDessusDe, gradeDe, peut, tousLesGrades } from '../socle/droits.js';
import { definirReglage, reglage } from '../socle/reglages.js';
import type { EvenementBot } from '../socle/contrat.js';
import { jourParis, jourValide, normaliserPseudo, normaliserTexte, versDate, versJour } from './texte.js';

export const DROITS_RH = ['voir', 'creer', 'modifier', 'desactiver', 'reactiver', 'sensible', 'parametrer'] as const;
export type DroitRh = typeof DROITS_RH[number];
// droits RH d'un compte ; rien sans rh-voir (toute action suppose de pouvoir consulter les fiches)
export const droitsRh = (c: Compte): Set<DroitRh> =>
  peut(c, 'rh-voir') ? new Set(DROITS_RH.filter(d => peut(c, `rh-${d}`))) : new Set();

export class RefusRh extends Error { constructor(message: string, public status = 400) { super(message); } }

// ---------- lecture ----------

export const nomComplet = (e: Pick<Employe, 'prenom' | 'nom' | 'discordPseudo' | 'idEmploye'>) =>
  `${e.prenom} ${e.nom}`.trim() || e.discordPseudo || e.idEmploye;

// Fiche telle qu'envoyée au navigateur : téléphone et RIB n'y figurent QUE pour un compte qui a rh-sensible — jamais
// masqués côté interface seulement.
export function fichePublique(e: Employe, droits: Set<DroitRh>) {
  const g = gradeDe(e.gradeCle);
  return {
    id: e.id, idEmploye: e.idEmploye, idProvisoire: e.idProvisoire, prenom: e.prenom, nom: e.nom, nomComplet: nomComplet(e),
    discordId: e.discordId ?? '', discordPseudo: e.discordPseudo,
    grade: e.gradeCle, gradeLibelle: g?.libelle ?? e.gradeCle, statut: e.statut,
    dateArrivee: versJour(e.dateArrivee), dateDepart: versJour(e.dateDepart),
    aCompleter: !e.prenom || !e.nom || e.idProvisoire,
    ...(droits.has('sensible') && { telephone: e.telephone, rib: e.rib }),
  };
}

// ordre d'affichage : actifs d'abord, puis par grade (position dans la page Grades), puis par nom
export function trierEmployes<T extends { statut: string; grade: string; nomComplet: string }>(liste: T[]): T[] {
  const rang = (cle: string) => gradeDe(cle)?.position ?? Number.MAX_SAFE_INTEGER;
  return liste.sort((a, b) => (a.statut === b.statut ? 0 : a.statut === 'actif' ? -1 : 1) || rang(a.grade) - rang(b.grade) || a.nomComplet.localeCompare(b.nomComplet, 'fr'));
}

// ---------- écriture ----------

const texte = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
type Champs = Partial<Omit<Employe, 'id' | 'creeLe' | 'majLe'>>;

// Champs envoyés par le formulaire → valeurs propres. `existante` : la fiche actuelle (modification), absente à la
// création. Lève RefusRh avec un message à afficher tel quel.
export function lireChamps(b: Record<string, unknown>, existante: Employe | null): Champs {
  const c: Champs = {};
  const pris = (cle: string) => b[cle] !== undefined;
  if (!existante || pris('idEmploye')) {
    const id = texte(b.idEmploye, 40);
    if (!id) throw new RefusRh('L’ID employé est obligatoire.');
    if (!/^[\p{L}\p{N}_.\- ]+$/u.test(id)) throw new RefusRh('L’ID employé ne peut contenir que des lettres, chiffres, espaces, points, tirets et soulignés.');
    c.idEmploye = id;
    c.idEmployeNormalise = id.toLowerCase();
  }
  for (const [cle, libelle] of [['prenom', 'Le prénom'], ['nom', 'Le nom']] as const) {
    if (!existante || pris(cle)) {
      c[cle] = texte(b[cle], 60);
      if (!c[cle]) throw new RefusRh(`${libelle} est obligatoire.`);
    }
  }
  if (!existante || pris('grade')) {
    const g = gradeDe(texte(b.grade, 20));
    if (!g) throw new RefusRh('Grade invalide.');
    c.gradeCle = g.cle;
  }
  if (pris('telephone')) c.telephone = texte(b.telephone, 30);
  if (pris('rib')) c.rib = texte(b.rib, 60);
  if (pris('discordId')) {
    const id = texte(b.discordId, 22);
    if (id && !/^\d{15,22}$/.test(id)) throw new RefusRh('L’ID Discord est un nombre de 15 à 22 chiffres (clic droit sur le profil → Copier l’identifiant).');
    c.discordId = id || null;
  }
  if (pris('discordPseudo')) {
    c.discordPseudo = texte(b.discordPseudo, 100);
    c.discordPseudoNormalise = c.discordPseudo ? normaliserPseudo(c.discordPseudo) : null;
  }
  for (const [cle, colonne, libelle] of [['dateArrivee', 'dateArrivee', 'La date d’arrivée'], ['dateDepart', 'dateDepart', 'La date de départ']] as const) {
    if (pris(cle)) {
      const v = texte(b[cle], 10);
      if (v && !jourValide(v)) throw new RefusRh(`${libelle} doit être une date valide (AAAA-MM-JJ).`);
      c[colonne] = v ? versDate(v) : null;
    }
  }
  if (!existante && !c.dateArrivee) throw new RefusRh('La date d’arrivée est obligatoire.');
  if (pris('statut')) {
    if (b.statut !== 'actif' && b.statut !== 'inactif') throw new RefusRh('Statut invalide.');
    c.statut = b.statut;
  }
  const arrivee = c.dateArrivee !== undefined ? c.dateArrivee : existante?.dateArrivee;
  const depart = c.dateDepart !== undefined ? c.dateDepart : existante?.dateDepart;
  if (arrivee && depart && depart < arrivee) throw new RefusRh('La date de départ ne peut pas précéder la date d’arrivée.');
  return c;
}

// unicité (ID employé sans casse, ID Discord, pseudo) : message clair avant l'écriture ; la base garantit le reste
export async function verifierUnicite(c: Champs, idExclu = 0, tx: Prisma.TransactionClient = prisma): Promise<void> {
  const verifs: [unknown, Prisma.EmployeWhereInput, string][] = [
    [c.idEmployeNormalise, { idEmployeNormalise: c.idEmployeNormalise }, 'Cet ID employé est déjà attribué.'],
    [c.discordId, { discordId: c.discordId }, 'Cet ID Discord est déjà sur une autre fiche.'],
    [c.discordPseudoNormalise, { discordPseudoNormalise: c.discordPseudoNormalise }, 'Ce pseudo Discord est déjà sur une autre fiche.'],
  ];
  for (const [valeur, where, message] of verifs) {
    if (valeur && await tx.employe.findFirst({ where: { ...where, id: { not: idExclu } }, select: { id: true } })) throw new RefusRh(message, 409);
  }
}

// violation d'unicité arrivée malgré la vérification (deux écritures simultanées) : même message qu'avant l'écriture
export function refusUnicite(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const cible = String((e.meta as { target?: unknown } | undefined)?.target ?? '');
    throw new RefusRh(cible.includes('discord_id') ? 'Cet ID Discord est déjà sur une autre fiche.'
      : cible.includes('pseudo') ? 'Ce pseudo Discord est déjà sur une autre fiche.' : 'Cet ID employé est déjà attribué.', 409);
  }
  throw e;
}

// ---------- candidatures du bot Discord « Roxwood Network Entreprise » ----------
// Le socle reçoit l'événement recruitment.updated (signature, serveur Discord, doublons : socle/routes/webhooks.ts) :
//   payload { ticketId, candidateId, submittedById, status, statusChangedVia, answers: [{ question, answer }], … }
// Seule une validation par le staff dans Discord (status ACCEPTED, statusChangedVia DISCORD) crée la fiche d'office.
// Une embauche constatée en jeu (statusChangedVia MONITORING, ou origine inconnue) arrive « en attente
// d'approbation ». Les questions du formulaire sont libres (réglées dans le bot) : la question qui donne chaque champ
// de la fiche se règle dans Ressources humaines. Le bot ne renvoie jamais un événement traité : une candidature acceptée
// qui ne peut pas encore devenir une fiche (réglage manquant, nom incomplet…) est gardée « à traiter », et RH la
// retraite après correction.
// Règles : un ticket = une fiche ; un compte Discord qui a déjà une fiche n'en reçoit pas une deuxième, et sa fiche
// n'est pas modifiée (RH fait foi) ; sans ID employé dans les réponses, ID provisoire « PROV-B… ».

export const REGLAGES_BOT = {
  gradeArrivee: 'rh.grade_arrivee',
  questionIdentite: 'rh.question_identite',
  questionPrenom: 'rh.question_prenom',
  questionNom: 'rh.question_nom',
  questionTelephone: 'rh.question_telephone',
  questionRib: 'rh.question_rib',
  questionIdEmploye: 'rh.question_id_employe',
} as const;
type Reglages = Record<keyof typeof REGLAGES_BOT, string>;
export const lireReglagesBot = (): Reglages =>
  Object.fromEntries(Object.entries(REGLAGES_BOT).map(([champ, cle]) => [champ, reglage(cle) ?? ''])) as Reglages;

export async function reglerBot(b: Record<string, unknown>, acteur: Compte): Promise<void> {
  const v = Object.fromEntries(Object.keys(REGLAGES_BOT).map(champ => [champ, texte(b[champ], 200)])) as Reglages;
  if (v.gradeArrivee) {
    if (!gradeDe(v.gradeArrivee)) throw new RefusRh('Grade d’arrivée invalide.');
    // jamais un grade égal ou supérieur à celui de qui règle (ni un grade de direction donné d'office à un inconnu)
    if (!auDessusDe(acteur, v.gradeArrivee)) throw new RefusRh('Le grade d’arrivée doit être sous le vôtre.', 403);
  }
  if (v.questionIdentite && (v.questionPrenom || v.questionNom)) throw new RefusRh('Choisissez soit une question « Prénom Nom », soit deux questions séparées, pas les deux.');
  if (!!v.questionPrenom !== !!v.questionNom) throw new RefusRh('Avec des questions séparées, réglez à la fois celle du prénom et celle du nom.');
  for (const [champ, cle] of Object.entries(REGLAGES_BOT)) await definirReglage(cle, v[champ as keyof Reglages] || null);
}

type Reponse = { question: string; answer: string };
const EN_SUSPENS = ['refusee', 'attente'];
const RE_ID_DISCORD = /^\d{15,22}$/;

const reponseA = (reponses: Reponse[], libelle: string) => {
  if (!libelle) return '';
  const cible = normaliserTexte(libelle);
  return reponses.find(r => normaliserTexte(r.question) === cible)?.answer.trim() ?? '';
};
const lireReponses = (brut: unknown): Reponse[] => (Array.isArray(brut) ? brut : [])
  .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
  .map(r => ({ question: texte(r.question, 200), answer: texte(r.answer, 500) }))
  .slice(0, 50);
// identité : une question « Prénom Nom » (le premier mot est le prénom), ou deux questions séparées
function identite(reponses: Reponse[], r: Reglages) {
  if (r.questionIdentite) {
    const mots = reponseA(reponses, r.questionIdentite).split(/\s+/).filter(Boolean);
    return { prenom: mots.shift() ?? '', nom: mots.join(' ') };
  }
  return { prenom: reponseA(reponses, r.questionPrenom), nom: reponseA(reponses, r.questionNom) };
}

type Candidature = { ticketId: string; discordId: string; nomRecu: string; accepteLe: string; reponses: Reponse[] };
type Resultat = { resultat: string; motif: string; employeId?: number };

async function ficheDuCompte(discordId: string): Promise<Resultat | null> {
  if (!RE_ID_DISCORD.test(discordId)) return null;
  const e = await prisma.employe.findUnique({ where: { discordId }, select: { id: true, statut: true } });
  return e ? { resultat: 'existante', employeId: e.id, motif: e.statut === 'inactif' ? 'Ce compte Discord a déjà une fiche, inactive : à réactiver dans Ressources humaines.' : 'Ce compte Discord a déjà une fiche.' } : null;
}

// candidature acceptée → fiche
async function creerDepuisCandidature(c: Candidature): Promise<Resultat> {
  if (!RE_ID_DISCORD.test(c.discordId)) return { resultat: 'refusee', motif: 'Le bot n’a pas pu identifier le compte Discord du candidat.' };
  const deja = await ficheDuCompte(c.discordId);
  if (deja) return deja;
  const r = lireReglagesBot();
  const questions = c.reponses.map(x => `« ${x.question} »`).join(', ') || 'aucune';
  if (!r.questionIdentite && !(r.questionPrenom && r.questionNom)) return { resultat: 'refusee', motif: `Réglez la question qui donne le prénom et le nom. Questions reçues : ${questions}.` };
  const { prenom, nom } = identite(c.reponses, r);
  if (!prenom || !nom) return { resultat: 'refusee', motif: `Prénom ou nom introuvable dans les réponses. Questions reçues : ${questions}.` };
  if (!gradeDe(r.gradeArrivee)) return { resultat: 'refusee', motif: 'Réglez le grade donné aux arrivées.' };
  const idEmploye = reponseA(c.reponses, r.questionIdEmploye);
  let champs: Champs;
  try {
    champs = lireChamps({
      prenom, nom, grade: r.gradeArrivee, discordId: c.discordId, dateArrivee: jourParis(c.accepteLe || undefined),
      telephone: reponseA(c.reponses, r.questionTelephone), rib: reponseA(c.reponses, r.questionRib),
      // sans ID dans les réponses : provisoire, remplacé ci-dessous par PROV-B + numéro de la fiche
      idEmploye: idEmploye || `PROV-tmp-${crypto.randomUUID().slice(0, 8)}`,
    }, null);
    await verifierUnicite(champs);
  } catch (e) {
    if (e instanceof RefusRh) return { resultat: 'refusee', motif: e.message };
    throw e;
  }
  try {
    const fiche = await prisma.$transaction(async tx => {
      const f = await tx.employe.create({ data: { ...champs, statut: 'actif', idProvisoire: !idEmploye } as Prisma.EmployeUncheckedCreateInput });
      if (idEmploye) return f;
      const prov = `PROV-B${String(f.id).padStart(4, '0')}`;
      return tx.employe.update({ where: { id: f.id }, data: { idEmploye: prov, idEmployeNormalise: prov.toLowerCase() } });
    });
    return { resultat: 'creee', employeId: fiche.id, motif: '' };
  } catch (e) {
    // deux envois simultanés pour le même compte : le second trouve la fiche du premier
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return (await ficheDuCompte(c.discordId)) ?? { resultat: 'refusee', motif: 'Cet ID employé est déjà sur une autre fiche.' };
    }
    throw e;
  }
}

// consigne le résultat d'un ticket ; un ticket abouti ou écarté n'est plus jamais modifié
async function consigner(c: Candidature, r: Resultat) {
  const data = {
    discordId: c.discordId, nomRecu: c.nomRecu, resultat: r.resultat, motif: r.motif.slice(0, 400), employeId: r.employeId ?? null,
    reponses: EN_SUSPENS.includes(r.resultat) ? (c.reponses as unknown as Prisma.InputJsonValue) : Prisma.DbNull, accepteLe: c.accepteLe, recuLe: new Date(),
  };
  await prisma.arriveeBot.upsert({ where: { ticketId: c.ticketId }, create: { ticketId: c.ticketId, ...data }, update: {} });
  await prisma.arriveeBot.updateMany({ where: { ticketId: c.ticketId, resultat: { in: EN_SUSPENS } }, data });
}

// traitement de l'événement recruitment.updated (entreprise.webhooks). Une forme inattendue s'ignore : la relancer ne
// la rendrait pas valide (voir docs/webhooks.md).
export async function recevoirCandidature(e: EvenementBot): Promise<void> {
  const p = e.payload as Record<string, unknown>;
  if (!p || typeof p !== 'object') return;
  const ticketId = texte(p.ticketId, 100);
  if (!ticketId) return;
  const deja = await prisma.arriveeBot.findUnique({ where: { ticketId } });
  // refusée dans Discord : un ticket encore en suspens est écarté (réponses effacées)
  if (p.status === 'REJECTED') {
    if (deja && EN_SUSPENS.includes(deja.resultat)) await prisma.arriveeBot.update({ where: { id: deja.id }, data: { resultat: 'ecartee', motif: 'Candidature refusée dans Discord.', reponses: Prisma.DbNull } });
    return;
  }
  if (p.status !== 'ACCEPTED' || (deja && !EN_SUSPENS.includes(deja.resultat))) return;
  const reponses = lireReponses(p.answers);
  const id = identite(reponses, lireReglagesBot());
  const c: Candidature = {
    ticketId, reponses,
    // la personne qui a soumis le formulaire ; à défaut, celle qui a ouvert le ticket
    discordId: texte(p.submittedById, 30) || texte(p.candidateId, 30),
    accepteLe: texte(e.sentAt, 40),
    nomRecu: (`${id.prenom} ${id.nom}`.trim() || reponses.map(x => x.answer).find(Boolean) || '').slice(0, 130),
  };
  const r = p.statusChangedVia === 'DISCORD' ? await creerDepuisCandidature(c)
    : (await ficheDuCompte(c.discordId)) ?? { resultat: 'attente', motif: 'Embauche constatée en jeu, sans validation dans Discord : à approuver.' };
  await consigner(c, r);
}

// approuver une embauche en attente, ou retraiter un ticket « à traiter », avec les réglages actuels
export async function traiterEnSuspens(id: number): Promise<Resultat> {
  const a = await prisma.arriveeBot.findUnique({ where: { id } });
  if (!a) throw new RefusRh('Candidature introuvable.', 404);
  if (!EN_SUSPENS.includes(a.resultat)) throw new RefusRh('Cette candidature a déjà été traitée.', 409);
  if (!a.reponses) throw new RefusRh('Les réponses de cette candidature ne sont plus conservées (30 jours) : créez la fiche à la main.', 410);
  const reponses = lireReponses(a.reponses);
  const id_ = identite(reponses, lireReglagesBot());
  const c: Candidature = { ticketId: a.ticketId, discordId: a.discordId, accepteLe: a.accepteLe, reponses, nomRecu: (`${id_.prenom} ${id_.nom}`.trim() || a.nomRecu).slice(0, 130) };
  const r = await creerDepuisCandidature(c);
  await consigner(c, r);
  return r;
}

export async function ecarter(id: number): Promise<void> {
  const { count } = await prisma.arriveeBot.updateMany({ where: { id, resultat: { in: EN_SUSPENS } }, data: { resultat: 'ecartee', motif: 'Écartée dans Ressources humaines.', reponses: Prisma.DbNull } });
  if (!count) {
    if (!await prisma.arriveeBot.findUnique({ where: { id } })) throw new RefusRh('Candidature introuvable.', 404);
    throw new RefusRh('Cette candidature a déjà été traitée.', 409);
  }
}

export async function arriveesBot() {
  const lignes = await prisma.arriveeBot.findMany({ orderBy: { id: 'desc' }, take: 50 });
  const fiches = new Map((await prisma.employe.findMany({ where: { id: { in: lignes.map(l => l.employeId).filter((x): x is number => x !== null) } } })).map(e => [e.id, e]));
  // libellés des questions vues dans les tickets en suspens (jamais les réponses), pour aider au réglage
  const questions = new Set<string>();
  for (const l of lignes) if (l.reponses) for (const r of lireReponses(l.reponses)) if (r.question) questions.add(r.question);
  return {
    reglages: lireReglagesBot(),
    questionsVues: [...questions].sort((a, b) => a.localeCompare(b, 'fr')),
    arrivees: lignes.map(l => {
      const f = l.employeId ? fiches.get(l.employeId) : undefined;
      return {
        id: l.id, ticketId: l.ticketId, discordId: l.discordId, nomRecu: l.nomRecu, resultat: l.resultat, motif: l.motif, recuLe: l.recuLe,
        traitable: EN_SUSPENS.includes(l.resultat) && !!l.reponses,
        ecartable: EN_SUSPENS.includes(l.resultat),
        employe: f ? { id: f.id, idEmploye: f.idEmploye, nomComplet: nomComplet(f), statut: f.statut } : null,
      };
    }),
  };
}

// réponses d'un ticket resté en suspens : effacées au-delà de 30 jours (elles peuvent contenir téléphone et RIB)
export async function purgerReponses(): Promise<void> {
  const { count } = await prisma.arriveeBot.updateMany({ where: { reponses: { not: Prisma.DbNull }, recuLe: { lt: new Date(Date.now() - 30 * 24 * 3600e3) } }, data: { reponses: Prisma.DbNull } });
  if (count) console.log(`RH : réponses de ${count} candidature(s) en suspens depuis plus de 30 jours effacées`);
}

// grades proposés pour une fiche (tous les grades du site, dans l'ordre de la page Grades)
export const gradesEmployes = () => tousLesGrades().map(g => ({ cle: g.cle, libelle: g.libelle, couleur: g.couleur }));
