// ENTREPRISE — protections des événements de l’agenda, vérifiées sans base de données.
import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirTicket, droitsAgenda, droitsInclusDansConsultation, gradeAccordable, modifiable, parisVersDate, peutCreer, peutInviter, voit } from '../src/entreprise/agenda-regles.js';

const GRADES = ['direction', 'responsable', 'agent'];
const MOI = { id: 1, discordId: '411111111111111111' };
const evenement = (destination: string, destinationGrade: string | null = null, compteId: number | null = 99, invitesDiscordIds: string[] = []) =>
  ({ compteId, destination, destinationGrade, invitesDiscordIds });

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
  assert.equal(voit(evenement('perso', null, 99, [MOI.discordId]), MOI, d), true, 'une personne invitée voit l’événement');
  assert.equal(modifiable(evenement('perso', null, 99, [MOI.discordId]), MOI, d), false, 'une invitation ne donne pas le droit de modifier');
  assert.equal(voit(evenement('perso', null, 1), MOI, d), true);
  assert.equal(modifiable(evenement('perso', null, 1), MOI, d), true);
  assert.equal(modifiable(evenement('perso', null, 99), MOI, d), false);
});

test('les invitations respectent les droits exacts de création par grade', () => {
  const d = droitsAgenda(GRADES, 'responsable', false, {
    consulter: ['agent', 'responsable'], creer: ['agent'], modifier: [], consulterTous: false, gererTous: false,
  });
  assert.equal(peutInviter(d, 'agent', GRADES), true);
  assert.equal(peutInviter(d, 'responsable', GRADES), false);
  assert.equal(peutInviter(d, null, GRADES), false);
  assert.equal(peutInviter(droitsAgenda(GRADES, null, true, null), null, GRADES), true);
});

test('notifications Discord utilisent l’heure de Paris et le ticket le plus récent de la personne', () => {
  assert.equal(parisVersDate('2026-07-14', '14:30').toISOString(), '2026-07-14T12:30:00.000Z');
  const membre = '411111111111111111', categorie = '900000000000000001';
  const salon = (id: string) => ({
    id, type: 0, parent_id: categorie,
    permission_overwrites: [{ id: membre, type: 1 }],
  });
  assert.equal(choisirTicket([salon('1300000000000000001'), salon('1300000000000000005')], membre, [categorie]), '1300000000000000005');
  assert.equal(choisirTicket([salon('1300000000000000001')], '422222222222222222', [categorie]), null);
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
