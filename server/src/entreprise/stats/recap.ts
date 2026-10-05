// ENTREPRISE — récapitulatif d'une semaine par employé (quota, salaire fixe, primes), utilisé par la DOT. Repris de
// l'ancien serveur (calculerRecapSemaine, primesSheetParPseudo, remplacerPrimesParSheet).
// Les primes affichées partout (« Mon profil », chiffres du tableur, DOT) sont celles du TABLEUR de la Direction
// (ventes/locations de sa ligne, barèmes du site) : le calcul par semaine depuis les ventes du bot n'est gardé ici que
// pour le salaire fixe et le classement — jamais deux sources mélangées dans un même montant.
import { prisma } from '../../socle/db.js';
import { gradeDe } from '../../socle/droits.js';
import { reglage } from '../../socle/reglages.js';
import { normaliserTexte } from '../texte.js';
import { calculerFinances, compterAchats, compterLocations, montantPalier, sommeFacture } from './calcul.js';
import { lireBaremes } from './tableur.js';
import { lireLignes } from './ventes.js';

// rémunération d'un grade du site ; un grade sans réglage : taux 0,48, pas de salaire, primes actives
export async function remunerations() {
  const lignes = await prisma.remunerationGrade.findMany();
  const parCle = new Map(lignes.map(l => [l.gradeCle, l]));
  return (cle: string | null | undefined) => {
    const r = cle ? parCle.get(cle) : undefined;
    return { taux: r?.taux ?? 0.48, salaireFixe: r?.salaireFixe ?? 0, salaireActif: r?.salaireActif ?? false, primeVenteActive: r?.primeVenteActive ?? true, primeLocationActive: r?.primeLocationActive ?? true };
  };
}

export async function recapSemaine(semaine: string) {
  const [{ lignes }, employes, baremes, remu] = await Promise.all([lireLignes(true), prisma.employe.findMany(), lireBaremes(), remunerations()]);
  const formateurDansQuota = reglage('stats.formateur_dans_quota') === '1';
  const parCle = new Map(employes.map(e => [`e:${e.id}`, e]));
  // toute l'équipe ACTIVE, même sans vente (0 partout), plus quiconque a vendu cette semaine (un inactif qui a encore
  // une vente y figure, un vendeur sans fiche apparaît sous le pseudo reçu)
  const cles = new Set([...employes.filter(e => e.statut === 'actif').map(e => `e:${e.id}`), ...lignes.filter(l => l.semaine === semaine).map(l => l.cleAgent)]);
  const agents = [...cles].map(cle => {
    const fiche = parCle.get(cle) ?? null;
    const r = remu(fiche?.gradeCle);
    const nbAchats = compterAchats(lignes, 'cleAgent', cle, semaine), nbLocations = compterLocations(lignes, 'cleAgent', cle, semaine);
    const facture = sommeFacture(lignes, cle, semaine, 'cleAgent');
    const finances = calculerFinances({
      nbAchats, nbLocations, facture,
      formateurNbAchats: compterAchats(lignes, 'cleFormateur', cle, semaine), formateurNbLocations: compterLocations(lignes, 'cleFormateur', cle, semaine),
      formateurComptesDansQuota: formateurDansQuota, baremeVentes: baremes.ventes, baremeLocations: baremes.locations,
      tauxCommission: r.taux, salaireFixe: r.salaireFixe ?? 0, salaireActif: r.salaireActif, primeVenteActive: r.primeVenteActive, primeLocationActive: r.primeLocationActive,
    });
    return {
      employeId: fiche?.id ?? null, idEmploye: fiche?.idEmploye ?? '', statut: fiche?.statut ?? '',
      identite: fiche ? fiche.discordPseudo : cle.slice(2), identiteRp: fiche ? `${fiche.prenom} ${fiche.nom}`.trim() : '',
      gradeCle: fiche?.gradeCle ?? null, grade: fiche ? gradeDe(fiche.gradeCle)?.libelle ?? fiche.gradeCle : '—', gradeConnu: !!fiche,
      nbAchats, nbLocations, facture, salaireFixe: r.salaireFixe ?? 0, ...finances,
    };
  });
  const rang = (cle: string | null) => gradeDe(cle)?.position ?? Number.MAX_SAFE_INTEGER;
  return agents.sort((a, b) => rang(a.gradeCle) - rang(b.gradeCle) || b.totalGagne - a.totalGagne);
}

// Primes du tableur : par fiche RH pour une ligne rattachée, par nom écrit pour une ligne sans fiche (personnes du
// relevé Tablettes qui n'ont pas — encore — de fiche).
export async function primesTableur() {
  const [lignes, baremes] = await Promise.all([prisma.ligneTableur.findMany(), lireBaremes()]);
  type Primes = { ventes: number; locations: number; primeVente: number; primeLocations: number; primeTotale: number };
  const parEmploye = new Map<number, Primes>(), parNomSansFiche = new Map<string, Primes>();
  for (const l of lignes) {
    const primeVente = montantPalier(baremes.ventes, l.nbVentes), primeLocations = montantPalier(baremes.locations, l.nbLocations);
    const v = { ventes: l.nbVentes, locations: l.nbLocations, primeVente, primeLocations, primeTotale: primeVente + primeLocations };
    if (l.employeId) parEmploye.set(l.employeId, v);
    else if (l.nomNormalise && !parNomSansFiche.has(l.nomNormalise)) parNomSansFiche.set(l.nomNormalise, v);
  }
  const zero: Primes = { ventes: 0, locations: 0, primeVente: 0, primeLocations: 0, primeTotale: 0 };
  return (employeId: number | null, ...noms: string[]): Primes => {
    if (employeId) return parEmploye.get(employeId) ?? zero;
    for (const n of noms) { const v = parNomSansFiche.get(normaliserTexte(n)); if (v) return v; }
    return zero;
  };
}

// récapitulatif dont les primes « par semaine » sont remplacées par celles du tableur ; le salaire fixe reste. Un agent
// sans ligne du tableur retombe sur 0 (jamais sur le calcul par semaine).
export async function recapAvecPrimesTableur(semaine: string) {
  const [agents, primePour] = await Promise.all([recapSemaine(semaine), primesTableur()]);
  return agents.map(a => {
    const p = primePour(a.employeId, a.identite, a.identiteRp);
    return {
      ...a, nbAchats: p.ventes, nbLocations: p.locations, primeVente: p.primeVente, primeLocations: p.primeLocations, primeTotale: p.primeTotale,
      totalAVerser: a.totalAVerser - a.primeTotale + p.primeTotale, totalGagne: a.totalGagne - a.primeTotale + p.primeTotale,
    };
  });
}
