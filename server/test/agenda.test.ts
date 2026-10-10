// Agenda partagé (src/entreprise/agenda-regles.ts) : qui voit et crée quoi, heure de Paris, ticket de la personne.
// Une erreur ici ouvrirait un événement de direction à tout le monde sans rien d'anormal à l'écran.
import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirTicket, droitsAgenda, parisVersDate } from '../src/entreprise/agenda-regles.js';

const REGLES: Record<string, string[]> = {
  agenda_roles_patrons: ['100000000000000001'], agenda_roles_direction: ['100000000000000001', '100000000000000002'],
  agenda_role_tous: ['100000000000000003'], agenda_createurs_tous: ['100000000000000002'], agenda_createurs_perso: ['100000000000000002'],
};
const ids = (cle: string) => REGLES[cle] ?? [];
const liste = (s: Set<string>) => [...s].sort();

test('droits selon les rôles Discord', () => {
  const employe = droitsAgenda(['100000000000000003'], false, ids);
  assert.deepEqual(liste(employe.voit), ['perso', 'tous']);
  assert.deepEqual(liste(employe.cree), ['perso'], 'voir « Tous » ne permet pas d’en créer');
  assert.equal(employe.persoAutrui, false);

  const manager = droitsAgenda(['100000000000000002', '100000000000000003'], false, ids);
  assert.deepEqual(liste(manager.voit), ['direction', 'perso', 'tous']);
  assert.deepEqual(liste(manager.cree), ['perso', 'tous']);
  assert.equal(manager.persoAutrui, true);

  const sansRole = droitsAgenda([], false, ids);
  assert.deepEqual(liste(sansRole.voit), ['perso']);
  assert.deepEqual(liste(sansRole.cree), ['perso']);
});

test('la permission « parametres » crée tout, mais ne voit que selon ses rôles', () => {
  const admin = droitsAgenda([], true, ids);
  assert.deepEqual(liste(admin.cree), ['direction', 'patrons', 'perso', 'tous']);
  assert.deepEqual(liste(admin.voit), ['perso']);
  assert.equal(admin.persoAutrui, true);
  assert.deepEqual(liste(droitsAgenda([], false, () => []).cree), ['perso'], 'rien de réglé : seul « Perso »');
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
