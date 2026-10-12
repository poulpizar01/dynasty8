// ENTREPRISE (exemple commun) — calculs de la comptabilité (src/entreprise/compta/releve.ts) : une erreur s'y paie en
// argent RP sans rien d'anormal à l'écran. À relancer après toute modification de ces calculs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { caBrut, corrigerLigneTotale, dureeEnMinutes, resumeDot, salariesDuReleve, type RemunerationGrade } from '../src/entreprise/compta/releve.js';

const colonnes = ['Nom', 'Rang', 'Heures de service', 'Total entreprise'];
const lignes = [
  ['Ana Silva', 'Patron', '5h30min', '12 000 $'],
  ['Léo Martin', 'Stagiaire', '2h15', '3000'],
  ['Inconnu Total', 'Mécano', 'n/a', '500'],
  ['TOTAL', '7h45', '15500'],   // ligne récap de la tablette : sans case « Rang »
];

test('durées : formats de la tablette, rien de deviné', () => {
  assert.equal(dureeEnMinutes('0h52min'), 52);
  assert.equal(dureeEnMinutes('12h05'), 725);
  assert.equal(dureeEnMinutes('45min'), 45);
  assert.equal(dureeEnMinutes('1:05'), 65);
  assert.equal(dureeEnMinutes('2h75'), null);
  assert.equal(dureeEnMinutes('beaucoup'), null);
  assert.equal(dureeEnMinutes('-'), null);
});

test('ligne TOTAL recalée, et jamais comptée dans le chiffre d’affaires', () => {
  const corrigees = corrigerLigneTotale(colonnes, lignes);
  assert.deepEqual(corrigees[3], ['TOTAL', '-', '7h45', '15500']);
  assert.equal(caBrut(colonnes, corrigees), 15500);
  assert.equal(caBrut(['Nom', 'Rang'], corrigees), null);
});

test('salaires : fixe si versé, paie à l’heure, part variable, rang inconnu sans rien d’automatique', () => {
  const grades = new Map<string, RemunerationGrade>([
    ['Patron', { libelle: 'Patron', salaireFixe: 8000, salaireActif: true, tauxHoraire: 0 }],
    ['Stagiaire', { libelle: 'Stagiaire', salaireFixe: 5000, salaireActif: false, tauxHoraire: 1000 }],
  ]);
  const { salaries, total } = salariesDuReleve({ colonnes, lignes: corrigerLigneTotale(colonnes, lignes), grades, partVariable: l => (l.nom === 'Ana Silva' ? 250 : 0) });
  assert.equal(salaries.length, 3);   // la ligne TOTAL n'est pas une personne
  assert.deepEqual(salaries.map(s => [s.nom, s.salaireFixe, s.paieHoraire, s.partVariable, s.total]), [
    ['Ana Silva', 8000, 0, 250, 8250],
    ['Léo Martin', 0, 2250, 0, 2250],   // salaire fixe coupé : rien ; 2 h 15 × 1 000 $
    ['Inconnu Total', 0, 0, 0, 0],
  ]);
  assert.equal(salaries[2].grade, null);
  assert.equal(total, 10500);
});

test('DOT : tranche du barème, pas d’impôt sous la première, bénéfice net après retraits', () => {
  const bareme = [
    { seuilMin: 100, seuilMax: 9999, taux: 0.07, salaireMaxEmploye: 1, salaireMaxPatron: 1, primeMaxEmploye: 1, primeMaxPatron: 1 },
    { seuilMin: 10000, seuilMax: 29999, taux: 0.09, salaireMaxEmploye: 1, salaireMaxPatron: 1, primeMaxEmploye: 1, primeMaxPatron: 1 },
  ];
  const r = resumeDot({ ca: 15500, depenses: 500, retraits: 1000, salaires: 10500, bareme });
  assert.equal(r.beneficeImposable, 15000);
  assert.equal(r.taux, 0.09);
  assert.equal(r.impots, 1350);
  assert.equal(r.apresImpots, 13650);
  assert.equal(r.apresSalaires, 3150);
  assert.equal(r.net, 12650);
  assert.equal(resumeDot({ ca: 50, depenses: 0, retraits: 0, salaires: 0, bareme }).impots, 0);
  assert.equal(resumeDot({ ca: 99999, depenses: 0, retraits: 0, salaires: 0, bareme }).taux, 0.09);   // au-delà du barème : dernière tranche
  assert.equal(resumeDot({ ca: null, depenses: 0, retraits: 0, salaires: 0, bareme }).impots, null);
});
