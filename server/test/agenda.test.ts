// Agenda partagé (src/entreprise/agenda-regles.ts) : qui voit, crée et modifie quoi, heure de Paris, ticket de la personne.
// Une erreur ici ouvrirait un événement de direction à tout le monde sans rien d'anormal à l'écran.
import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirTicket, droitsAgenda, modifiable, parisVersDate, peutCreer, peutCreerPour, plafondAccordable, voit } from '../src/entreprise/agenda-regles.js';

const GRADES = ['patron', 'directeur', 'manager', 'agent'];   // du sommet à la base
const ev = (destination: string, destinationGrade: string | null = null, compteId: number | null = 99, cibleDiscordId: string | null = null) =>
  ({ compteId, destination, destinationGrade, cibleDiscordId });
const MOI = { id: 1, discordId: '411111111111111111' };

test('par défaut : son grade et ceux en dessous', () => {
  const d = droitsAgenda(GRADES, 'manager', false, null);
  assert.equal(voit(ev('grade', 'manager'), MOI, d, GRADES), true);
  assert.equal(voit(ev('grade', 'agent'), MOI, d, GRADES), true);
  assert.equal(voit(ev('grade', 'directeur'), MOI, d, GRADES), false, 'un événement de direction reste fermé');
  assert.equal(voit(ev('tous'), MOI, d, GRADES), true);
  assert.equal(modifiable(ev('grade', 'agent'), MOI, d, GRADES), true);
  assert.equal(peutCreer(d, 'grade', 'directeur', GRADES), false);
  assert.equal(peutCreer(d, 'tous', null, GRADES), true);
});

test('plafonds réglés : plus haut, plus bas, aucun', () => {
  const d = droitsAgenda(GRADES, 'agent', false, { consulter: 'directeur', creer: '', modifier: 'agent' });
  assert.equal(voit(ev('grade', 'directeur'), MOI, d, GRADES), true);
  assert.equal(voit(ev('grade', 'patron'), MOI, d, GRADES), false);
  assert.equal(peutCreer(d, 'tous', null, GRADES), false, '« aucun » : pas même « Tout le monde »');
  assert.equal(peutCreer(d, 'perso', null, GRADES), true, 'son agenda personnel reste à soi');
  assert.equal(modifiable(ev('grade', 'manager'), MOI, d, GRADES), false);
  assert.equal(modifiable(ev('grade', 'agent'), MOI, d, GRADES), true);
});

test('perso, sans grade, grade disparu, propriétaire', () => {
  const d = droitsAgenda(GRADES, 'patron', false, null);
  assert.equal(voit(ev('perso'), MOI, d, GRADES), false, 'le Perso d’un autre reste privé, même au sommet');
  assert.equal(voit(ev('perso', null, 99, MOI.discordId), MOI, d, GRADES), true, 'créé pour moi : je le vois');
  assert.equal(modifiable(ev('perso', null, 99, MOI.discordId), MOI, d, GRADES), false, 'seul son auteur le gère');
  assert.equal(modifiable(ev('grade', 'patron', MOI.id), MOI, droitsAgenda(GRADES, 'agent', false, { consulter: '', creer: '', modifier: '' }), GRADES), true, 'ses propres événements : toujours');

  const sans = droitsAgenda(GRADES, null, false, null);
  assert.equal(voit(ev('tous'), MOI, sans, GRADES), true);
  assert.equal(voit(ev('grade', 'agent'), MOI, sans, GRADES), false);
  assert.equal(peutCreer(sans, 'tous', null, GRADES), false);

  assert.equal(voit(ev('grade', 'disparu'), MOI, droitsAgenda(GRADES, 'directeur', false, null), GRADES), false, 'grade supprimé : compté comme le sommet');
  assert.equal(droitsAgenda(GRADES, 'agent', false, { consulter: 'disparu', creer: 'agent', modifier: 'agent' }).consulter, 3, 'plafond vers un grade disparu : son propre grade');

  const proprio = droitsAgenda(GRADES, null, true, null);
  assert.equal(voit(ev('grade', 'patron'), MOI, proprio, GRADES), true);
  assert.equal(peutCreerPour(proprio, 'patron', GRADES), true);
});

test('Perso pour quelqu’un d’autre : dans la limite de ce qu’on crée', () => {
  const d = droitsAgenda(GRADES, 'manager', false, null);
  assert.equal(peutCreerPour(d, 'agent', GRADES), true);
  assert.equal(peutCreerPour(d, 'directeur', GRADES), false);
  assert.equal(peutCreerPour(d, null, GRADES), true, 'fiche sans grade connu : le bas de l’échelle');
  assert.equal(peutCreerPour(droitsAgenda(GRADES, 'manager', false, { consulter: 'manager', creer: '', modifier: 'manager' }), 'agent', GRADES), false);
});

test('anti-escalade : on ne donne pas un plafond au-dessus de son grade', () => {
  assert.equal(plafondAccordable('manager', GRADES, 'manager', false), true);
  assert.equal(plafondAccordable('agent', GRADES, 'manager', false), true);
  assert.equal(plafondAccordable('directeur', GRADES, 'manager', false), false);
  assert.equal(plafondAccordable('', GRADES, 'manager', false), true);
  assert.equal(plafondAccordable('patron', GRADES, null, true), true);
  assert.equal(plafondAccordable('inconnu', GRADES, null, true), false);
});

test('heure de Paris, été comme hiver et jours de changement d’heure', () => {
  assert.equal(parisVersDate('2026-07-14', '14:30').toISOString(), '2026-07-14T12:30:00.000Z');
  assert.equal(parisVersDate('2026-12-24', '20:00').toISOString(), '2026-12-24T19:00:00.000Z');
  assert.equal(parisVersDate('2026-03-29', '12:00').toISOString(), '2026-03-29T10:00:00.000Z');
  assert.equal(parisVersDate('2026-10-25', '12:00').toISOString(), '2026-10-25T11:00:00.000Z');
});

test('ticket de la personne : catégorie réglée, permission à son nom, le plus récent', () => {
  const moi = '411111111111111111', autre = '422222222222222222', cat = '900000000000000001';
  const salon = (id: string, parent: string, membre: string, type = 0) => ({ id, type, parent_id: parent, permission_overwrites: [{ id: membre, type: 1 }, { id: '900000000000000009', type: 0 }] });
  const salons = [
    salon('1300000000000000001', cat, moi),
    salon('1300000000000000005', cat, moi),
    salon('1300000000000000009', cat, autre),                         // ticket d'un autre
    salon('1300000000000000010', '900000000000000002', moi),          // hors des catégories réglées
    salon('1300000000000000011', cat, moi, 2),                        // salon vocal
    { id: '1300000000000000012', type: 0, parent_id: cat, permission_overwrites: [{ id: moi, type: 0 }] }, // rôle, pas membre
  ];
  assert.equal(choisirTicket(salons, moi, [cat]), '1300000000000000005');
  assert.equal(choisirTicket(salons, '433333333333333333', [cat]), null);
  assert.equal(choisirTicket(salons, moi, []), null);
  assert.equal(choisirTicket({ message: 'erreur' }, moi, [cat]), null, 'réponse inattendue : aucun ticket');
});
