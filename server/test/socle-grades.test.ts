// SOCLE — grade à la connexion (src/socle/grade-connexion.ts) : une erreur ici fait gagner ou perdre des droits à la
// connexion suivante, sans rien d'anormal à l'écran.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeALaConnexion } from '../src/socle/grade-connexion.js';

// du sommet à la base : direction attribuée à la main, responsable et agent liés à des rôles Discord
const GRADES = [
  { cle: 'direction', roleDiscordId: null },
  { cle: 'responsable', roleDiscordId: '1001' },
  { cle: 'agent', roleDiscordId: '1002' },
  { cle: 'stagiaire', roleDiscordId: null },
];
const grade = (roles: string[], actuel: string | null, exProprio = false) => gradeALaConnexion(GRADES, roles, actuel, exProprio).grade;

test('le plus haut grade dont le rôle est porté', () => {
  assert.equal(grade(['1002', '1001'], null), 'responsable');
  assert.equal(grade(['1002'], null), 'agent');
  assert.equal(grade(['999'], null), null);
});

test('un grade attribué à la main plus haut que celui du rôle l’emporte', () => {
  // un gestionnaire a lié « agent » au rôle que tout le monde porte : la direction ne tombe pas
  assert.equal(grade(['1002'], 'direction'), 'direction');
});

test('un grade attribué à la main plus bas cède à celui du rôle', () => {
  assert.equal(grade(['1001'], 'stagiaire'), 'responsable');
  assert.equal(grade([], 'stagiaire'), 'stagiaire');
});

test('un grade lié à un rôle que le compte ne porte plus est retiré', () => {
  assert.equal(grade([], 'responsable'), null);
  assert.equal(grade(['1002'], 'responsable'), 'agent');
});

test('un ancien propriétaire perd le grade attribué à la main, pas celui de son rôle', () => {
  assert.equal(grade([], 'direction', true), null);
  assert.equal(grade(['1002'], 'direction', true), 'agent');
  assert.equal(grade(['1001'], 'responsable', true), 'responsable');
});

test('parRole n’est rempli que par un rôle porté (validation d’office)', () => {
  assert.equal(gradeALaConnexion(GRADES, ['1002'], 'direction', false).parRole, 'agent');
  assert.equal(gradeALaConnexion(GRADES, [], 'direction', false).parRole, null);
});
