// ENTREPRISE — protections des événements de l’agenda, vérifiées sans base de données.
import test from 'node:test';
import assert from 'node:assert/strict';
import { droitsAgenda, droitsInclusDansConsultation, gradeAccordable, modifiable, peutCreer, voit } from '../src/entreprise/agenda-regles.js';

const GRADES = ['direction', 'responsable', 'agent'];
const MOI = { id: 1 };
const evenement = (destination: string, destinationGrade: string | null = null, compteId: number | null = 99) =>
  ({ compteId, destination, destinationGrade });

test('aucun droit ciblé par grade n’est accordé par défaut', () => {
  const d = droitsAgenda(GRADES, 'responsable', false, null);
  assert.equal(voit(evenement('grade', 'responsable'), MOI, d), false);
  assert.equal(voit(evenement('tous'), MOI, d), false);
  assert.equal(modifiable(evenement('tous'), MOI, d), false);
  assert.equal(peutCreer(d, 'grade', 'agent'), false);
  assert.equal(peutCreer(d, 'perso', null), true);
});

test('les droits par grade visent uniquement la clé explicitement cochée', () => {
  const d = droitsAgenda(GRADES, 'agent', false, {
    consulter: ['responsable'], creer: ['responsable'], modifier: ['responsable'], consulterTous: false, gererTous: false,
  });
  assert.equal(voit(evenement('grade', 'responsable'), MOI, d), true);
  assert.equal(voit(evenement('grade', 'agent'), MOI, d), false);
  assert.equal(voit(evenement('grade', 'direction'), MOI, d), false);
  assert.equal(peutCreer(d, 'grade', 'responsable'), true);
  assert.equal(modifiable(evenement('grade', 'responsable'), MOI, d), true);
});

test('modifier et créer par grade restent sous-ensembles des grades consultables', () => {
  assert.equal(droitsInclusDansConsultation(['responsable', 'agent'], ['agent']), true);
  assert.equal(droitsInclusDansConsultation(['responsable'], ['agent']), false);
  const d = droitsAgenda(GRADES, 'agent', false, {
    consulter: ['responsable'], creer: ['agent'], modifier: [], consulterTous: false, gererTous: false,
  });
  assert.deepEqual(d.creer, ['agent']);
});

test('consultation d’équipe et gestion d’équipe sont indépendantes', () => {
  const lecture = droitsAgenda(GRADES, 'responsable', false, {
    consulter: [], creer: [], modifier: [], consulterTous: true, gererTous: false,
  });
  assert.equal(voit(evenement('tous'), MOI, lecture), true);
  assert.equal(modifiable(evenement('tous'), MOI, lecture), false);
  assert.equal(peutCreer(lecture, 'tous', null), false);
  const gestion = droitsAgenda(GRADES, 'responsable', false, {
    consulter: [], creer: [], modifier: [], consulterTous: true, gererTous: true,
  });
  assert.equal(modifiable(evenement('tous'), MOI, gestion), true);
  assert.equal(peutCreer(gestion, 'tous', null), true);
});

test('les événements personnels restent privés et modifiables par leur auteur', () => {
  const d = droitsAgenda(GRADES, 'agent', false, null);
  assert.equal(voit(evenement('perso', null, 99), MOI, d), false);
  assert.equal(voit(evenement('perso', null, 1), MOI, d), true);
  assert.equal(modifiable(evenement('perso', null, 1), MOI, d), true);
  assert.equal(modifiable(evenement('perso', null, 99), MOI, d), false);
});

test('grade supprimé ignoré et gestionnaire limité aux grades sous le sien', () => {
  const d = droitsAgenda(GRADES, 'agent', false, {
    consulter: ['supprime', 'agent'], creer: [], modifier: [], consulterTous: false, gererTous: false,
  });
  assert.deepEqual(d.consulter, ['agent']);
  assert.equal(gradeAccordable('agent', GRADES, 'responsable', false), true);
  assert.equal(gradeAccordable('direction', GRADES, 'responsable', false), false);
  assert.equal(gradeAccordable('direction', GRADES, null, true), true);
});
