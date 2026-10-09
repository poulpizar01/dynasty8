// ENTREPRISE — Google Sheets de la Direction (« Chiffres du tableur », primes de « Mon profil » et de la DOT).
// Lecture de l'export CSV public de l'onglet (classeur partagé « toute personne disposant
// du lien — lecteur ») : ni compte de service ni clé côté serveur. Colonne D = nom, E = grade, L = ventes, M = locations.
// Les MONTANTS de primes ne sont jamais lus dans le Sheet (colonnes N/O) : recalculés avec les barèmes du site
// (baremes_primes, réglables dans Comptabilité), le seul endroit où changer un montant.
import { prisma } from '../../socle/db.js';
import { gradeDe, tousLesGrades } from '../../socle/droits.js';
import { configEntreprise } from '../config.js';
import { nomComplet } from '../rh.js';
import { normaliserTexte } from '../texte.js';
import { montantPalier, semaineISO, type Palier } from './calcul.js';

export class TableurNonConfigure extends Error {
  constructor() { super('Synchronisation non configurée sur le serveur : renseignez GOOGLE_SHEET_ID dans le .env.'); }
}

// Analyseur CSV minimal mais correct (guillemets, virgules et retours à la ligne dans un champ, "" → ") : suffisant pour
// un export Google Sheets, sans dépendance.
export function analyserCSV(texte: string): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [], champ = '', dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else dansGuillemets = false; }
      else champ += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
    else if (c !== '\r') champ += c;   // \r : les fins de ligne \r\n sont gérées par le \n qui suit
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

// sans délai, une lecture bloquée resterait en vol, et les passes suivantes s'empileraient
const DELAI_MS = 20_000;
async function lireCSV(sheet: { id: string; gid: string }): Promise<string[][]> {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${sheet.gid}`, { signal: AbortSignal.timeout(DELAI_MS) });
  const texte = await r.text();
  // un classeur non partagé renvoie la page de connexion Google (HTML, statut 200 après redirection)
  if (!r.ok || /^\s*<(!doctype|html)/i.test(texte)) throw new Error('Impossible de lire le Google Sheets. Vérifiez que son partage est réglé sur « Tous les utilisateurs disposant du lien — Lecteur ».');
  return analyserCSV(texte);
}

const nombreEntier = (v: unknown) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[  \s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

// Lignes d'agents du Sheet : un nom en colonne D et un grade du site en colonne E (libellé, sans casse ni accents). Les
// titres de section et la ligne d'en-tête n'ont pas de grade connu : ignorés.
export function analyserLignesSheet(brutes: string[][], libelles: string[] = tousLesGrades().map(g => g.libelle)) {
  const gradeParLibelle = new Map(libelles.map(l => [normaliserTexte(l), l]));
  return brutes.flatMap((ligne, index) => {
    const nom = String(ligne[3] ?? '').trim();
    const grade = gradeParLibelle.get(normaliserTexte(ligne[4] ?? ''));
    if (!nom || !grade) return [];
    return [{ ligneSheet: index + 2, nom, nomNormalise: normaliserTexte(nom), grade, nbVentes: nombreEntier(ligne[11]), nbLocations: nombreEntier(ligne[12]) }];
  });
}

// Synchronisation complète : relit tout le Sheet et REMPLACE le contenu de tableur_lignes. RH fait foi : chaque ligne est
// rattachée à la fiche dont le « Prénom Nom » est EXACTEMENT le nom écrit (sans casse ni accents, jamais de
// ressemblance ; deux fiches au même nom : aucune). Une ligne sans fiche est signalée dans RH « À rattacher ».
// Compte du site relié (« Mon profil ») : celui de l'employé (même ID Discord que sa fiche, sinon même pseudo
// Discord) ; à défaut, le compte dont le nom RP est exactement le nom écrit.
// Deux synchronisations ne tournent jamais en même temps : la seconde attend la première.
let enCours: Promise<Awaited<ReturnType<typeof synchroniserUneFois>>> | null = null;
export function synchroniser() {
  enCours ??= synchroniserUneFois().finally(() => { enCours = null; });
  return enCours;
}

async function synchroniserUneFois() {
  const sheet = configEntreprise.sheet;
  if (!sheet) throw new TableurNonConfigure();
  // une semaine terminée et pas encore archivée (serveur arrêté dimanche soir…) est figée AVANT que la nouvelle lecture
  // n'écrase ses chiffres ; pas pendant la minute de 23:59 elle-même : la tâche d'archivage s'en charge alors
  await archiverSiDue({ grace: 60_000 });
  const lignes = analyserLignesSheet((await lireCSV(sheet)).slice(1));

  const [employes, comptes] = await Promise.all([
    prisma.employe.findMany({ select: { id: true, prenom: true, nom: true, discordId: true, discordPseudoNormalise: true } }),
    prisma.compte.findMany({ where: { statut: 'valide' }, select: { id: true, discordId: true, pseudo: true } }),
  ]);
  const employeParNom = new Map<string, typeof employes[number] | null>();
  for (const e of employes) {
    const cle = normaliserTexte(`${e.prenom} ${e.nom}`);
    if (cle) employeParNom.set(cle, employeParNom.has(cle) ? null : e);   // homonymes : ambigu, aucune
  }
  const compteParDiscord = new Map(comptes.map(c => [c.discordId, c.id]));
  const compteParPseudo = new Map(comptes.map(c => [normaliserTexte(c.pseudo), c.id]));
  // compte du site relié : par la fiche RH (ID Discord, sinon pseudo Discord), jamais par le nom RP du compte, que
  // chacun change librement (un agent prendrait le nom d'un collègue pour voir ses chiffres et ses primes)
  const compteDe = (e: typeof employes[number] | null | undefined) =>
    !e ? null : e.discordId ? compteParDiscord.get(e.discordId) ?? null : e.discordPseudoNormalise ? compteParPseudo.get(normaliserTexte(e.discordPseudoNormalise)) ?? null : null;

  const donnees = lignes.map(l => {
    const e = employeParNom.get(l.nomNormalise) ?? null;
    return {
      ligneSheet: l.ligneSheet, nomSheet: l.nom, nomNormalise: l.nomNormalise, gradeSheet: l.grade, nbVentes: l.nbVentes, nbLocations: l.nbLocations,
      employeId: e?.id ?? null, compteId: compteDe(e),
    };
  });
  await prisma.$transaction([prisma.ligneTableur.deleteMany(), prisma.ligneTableur.createMany({ data: donnees })]);
  const etat = { derniereSync: new Date(), statut: 'ok', erreur: '', nbLignes: donnees.length, nbApparies: donnees.filter(d => d.compteId !== null).length };
  await prisma.tableurEtat.upsert({ where: { id: 1 }, create: { id: 1, ...etat }, update: etat });
  const sansFiche = donnees.filter(d => d.employeId === null).length;
  if (sansFiche) console.log(`[tableur] ${sansFiche} ligne(s) du tableur sans fiche RH (voir RH → À rattacher)`);
  return { ...etat, sansFicheRh: sansFiche };
}

// Pour la synchronisation automatique : jamais d'exception. L'échec est journalisé et enregistré (visible dans la page).
export async function synchroniserSansErreur() {
  try { return await synchroniser(); }
  catch (e) {
    // réglage absent : ce n'est pas une panne, pas la peine de remplir les journaux toutes les 20 minutes
    const nonConfigure = e instanceof TableurNonConfigure;
    const etat = { derniereSync: new Date(), statut: nonConfigure ? 'desactive' : 'erreur', erreur: String((e as Error)?.message ?? e).slice(0, 500), nbLignes: 0, nbApparies: 0 };
    await prisma.tableurEtat.upsert({ where: { id: 1 }, create: { id: 1, ...etat }, update: etat }).catch(e2 => console.error('[tableur] état non enregistré :', e2));
    if (!nonConfigure) console.error('[tableur] échec de la synchronisation :', e);
    return { ...etat, sansFicheRh: 0 };
  }
}

// ---------- « Chiffres du tableur » : vue actuelle et archives ----------

export const lireBaremes = async () => {
  const b = await prisma.baremePrime.findMany();
  return { ventes: b.filter(x => x.type === 'vente') as Palier[], locations: b.filter(x => x.type === 'location') as Palier[] };
};

const employeResume = (e: { id: number; idEmploye: string; prenom: string; nom: string; discordPseudo: string; gradeCle: string; statut: string } | null | undefined) =>
  e ? { id: e.id, idEmploye: e.idEmploye, nomComplet: nomComplet(e), grade: gradeDe(e.gradeCle)?.libelle ?? e.gradeCle, statut: e.statut } : null;

// Chiffres actuels : chaque ligne lue, ses primes (barèmes du site), sa fiche RH et le compte relié. Nom et grade
// viennent de RH quand la ligne a sa fiche (RH fait foi). Sert à l'écran ET à l'archive.
export async function lireActuel() {
  const [lignes, baremes] = await Promise.all([prisma.ligneTableur.findMany({ orderBy: { ligneSheet: 'asc' } }), lireBaremes()]);
  const [employes, comptes] = await Promise.all([
    prisma.employe.findMany({ where: { id: { in: lignes.map(l => l.employeId).filter((x): x is number => x !== null) } } }),
    prisma.compte.findMany({ where: { id: { in: lignes.map(l => l.compteId).filter((x): x is number => x !== null) } }, select: { id: true, nom: true, pseudo: true } }),
  ]);
  const employeDe = new Map(employes.map(e => [e.id, e])), compteDe = new Map(comptes.map(c => [c.id, c.nom ?? c.pseudo]));
  let lueLe: Date | null = null;
  const resultat = lignes.map(l => {
    if (!lueLe || l.majLe > lueLe) lueLe = l.majLe;
    const primeVente = montantPalier(baremes.ventes, l.nbVentes), primeLocations = montantPalier(baremes.locations, l.nbLocations);
    const employe = employeResume(l.employeId ? employeDe.get(l.employeId) : null);
    return {
      ligneSheet: l.ligneSheet, nom: employe?.nomComplet ?? l.nomSheet, nomTableur: l.nomSheet, grade: employe?.grade ?? l.gradeSheet,
      ventes: l.nbVentes, locations: l.nbLocations, primeVente, primeLocations, primeTotale: primeVente + primeLocations,
      employe, compte: l.compteId ? compteDe.get(l.compteId) ?? null : null,
    };
  });
  return { lignes: resultat, lueLe: lueLe as Date | null };
}

// ---------- semaines à l'heure de Paris (lundi 00:00 → dimanche 23:59, été comme hiver) ----------
const FORMAT_PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const JOURS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
function partiesParis(date: Date) {
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(date).map(x => [x.type, x.value]));
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour, minute: +p.minute, jourSemaine: JOURS[p.weekday] };
}
// instant correspondant à une date et une heure de Paris
function instantParis(annee: number, mois: number, jour: number, heure: number, minute: number) {
  const commeSiUtc = Date.UTC(annee, mois - 1, jour, heure, minute);
  const p = partiesParis(new Date(commeSiUtc));
  return new Date(commeSiUtc - (Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute) - commeSiUtc));
}
// semaine (heure de Paris) qui contient cet instant : { code: "S41-26", debut: lundi 00:00, fin: dimanche 23:59 }
export function semaineParis(date: Date) {
  const p = partiesParis(date);
  const jourCivil = new Date(Date.UTC(p.annee, p.mois - 1, p.jour));
  const { numero, anneeIso } = semaineISO(jourCivil);
  const decaler = (jours: number) => { const d = new Date(jourCivil); d.setUTCDate(d.getUTCDate() + jours); return d; };
  const lundi = decaler(1 - p.jourSemaine), dimanche = decaler(7 - p.jourSemaine);
  return {
    code: `S${numero}-${String(anneeIso).slice(-2)}`,
    debut: instantParis(lundi.getUTCFullYear(), lundi.getUTCMonth() + 1, lundi.getUTCDate(), 0, 0),
    fin: instantParis(dimanche.getUTCFullYear(), dimanche.getUTCMonth() + 1, dimanche.getUTCDate(), 23, 59),
  };
}
// dernière semaine dont l'heure d'archivage est passée : la semaine en cours à partir du dimanche 23:59, sinon la précédente
export function semaineArchivable(maintenant: Date) {
  const enCours = semaineParis(maintenant);
  return maintenant >= enCours.fin ? enCours : semaineParis(new Date(enCours.debut.getTime() - 60_000));
}

// Fige les chiffres de la semaine écoulée, une seule fois. Seulement des chiffres lus pendant cette semaine-là : sinon
// (premier démarrage en milieu de semaine, synchro désactivée…) rien n'est archivé, plutôt que d'enregistrer les
// chiffres d'une semaine sous le numéro d'une autre. grace : délai minimal après dimanche 23:59 avant d'agir.
export async function archiverSiDue({ maintenant = new Date(), grace = 0 } = {}) {
  const semaine = semaineArchivable(maintenant);
  if (maintenant.getTime() - semaine.fin.getTime() < grace) return { archivee: false, semaine: semaine.code, raison: 'pas encore' };
  if (await prisma.tableurArchive.findUnique({ where: { semaine: semaine.code }, select: { id: true } })) return { archivee: false, semaine: semaine.code, raison: 'déjà archivée' };
  const { lignes, lueLe } = await lireActuel();
  if (!lignes.length || !lueLe) return { archivee: false, semaine: semaine.code, raison: 'tableur jamais lu' };
  if (semaineParis(lueLe).code !== semaine.code) return { archivee: false, semaine: semaine.code, raison: 'chiffres d’une autre semaine' };
  const enRetard = maintenant.getTime() - semaine.fin.getTime() > 5 * 60_000;
  try {
    await prisma.tableurArchive.create({
      data: {
        semaine: semaine.code, archiveLe: maintenant, donneesDu: lueLe, enRetard,
        lignes: { create: lignes.map(l => ({ ligneSheet: l.ligneSheet, nom: l.nom, grade: l.grade || '', ventes: l.ventes, locations: l.locations, primeVente: l.primeVente, primeLocations: l.primeLocations, compte: l.compte, employeId: l.employe?.id ?? null })) },
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { archivee: false, semaine: semaine.code, raison: 'déjà archivée' };   // archivée entre-temps
    throw e;
  }
  console.log(`[tableur] semaine ${semaine.code} archivée (${lignes.length} agent(s))${enRetard ? ' — en retard' : ''}`);
  return { archivee: true, semaine: semaine.code };
}

// archive d'une semaine, au format de lireActuel ; chiffres, primes et grade figés, nom relu dans la fiche RH
export async function lireArchive(code: string) {
  const a = await prisma.tableurArchive.findUnique({ where: { semaine: code }, include: { lignes: { orderBy: [{ ligneSheet: 'asc' }, { id: 'asc' }] } } });
  if (!a) return null;
  const employes = new Map((await prisma.employe.findMany({ where: { id: { in: a.lignes.map(l => l.employeId).filter((x): x is number => x !== null) } } })).map(e => [e.id, e]));
  return {
    semaine: a.semaine, archiveLe: a.archiveLe, donneesDu: a.donneesDu, enRetard: a.enRetard,
    lignes: a.lignes.map(l => {
      const employe = employeResume(l.employeId ? employes.get(l.employeId) : null);
      return { ligneSheet: l.ligneSheet, nom: employe?.nomComplet ?? l.nom, grade: l.grade, ventes: l.ventes, locations: l.locations, primeVente: l.primeVente, primeLocations: l.primeLocations, primeTotale: l.primeVente + l.primeLocations, employe, compte: l.compte };
    }),
  };
}

// Synchronisation toutes les 20 minutes ; contrôle de l'archivage toutes les 30 s (dimanche 23:59 heure de Paris : une
// dernière lecture puis l'archive ; si le serveur était arrêté à cette heure-là, archive au redémarrage).
export function planifierTableur(): void {
  if (!configEntreprise.sheet) { console.log('[tableur] GOOGLE_SHEET_ID absent : synchronisation du tableur désactivée'); return; }
  synchroniserSansErreur();
  setInterval(synchroniserSansErreur, 20 * 60_000).unref();
  let derniereArchivee: string | null = null;
  setInterval(async () => {
    try {
      const semaine = semaineParis(new Date()), t = Date.now();
      if (t >= semaine.fin.getTime() && t - semaine.fin.getTime() < 60_000 && derniereArchivee !== semaine.code) await synchroniserSansErreur();
      const r = await archiverSiDue();
      if (r.archivee || r.raison === 'déjà archivée') derniereArchivee = r.semaine;
    } catch (e) { console.error('[tableur] échec de l’archivage hebdomadaire :', e); }
  }, 30_000).unref();
}
