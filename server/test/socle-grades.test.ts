// SOCLE — grade à la connexion (src/socle/grade-connexion.ts) : une erreur ici fait gagner ou perdre des droits à la
// connexion suivante, sans rien d'anormal à l'écran.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeALaConnexion, synchroCompte } from '../src/socle/grade-connexion.js';

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

// relecture par le bot entre deux connexions (synchro-discord.ts) : mêmes règles qu'à la connexion
const relu = (compte: { gradeCle: string | null; statut: string; rolesDiscord: string[] }, roles: string[] | null) => synchroCompte(GRADES, compte, roles);

test('relecture : rôle retiré, grade lié retiré aussitôt', () => {
  const d = relu({ gradeCle: 'responsable', statut: 'valide', rolesDiscord: ['1001'] }, ['1002']);
  assert.deepEqual([d.parti, d.gradeCle, d.change], [false, 'agent', true]);
});

test('relecture : grade attribué à la main gardé, rien à changer si rien n’a bougé', () => {
  assert.deepEqual(relu({ gradeCle: 'direction', statut: 'valide', rolesDiscord: ['1002'] }, ['1002']), { parti: false, gradeCle: 'direction', valider: false, change: false });
});

test('relecture : compte en attente qui reçoit un rôle lié, validé', () => {
  const d = relu({ gradeCle: null, statut: 'attente', rolesDiscord: [] }, ['1002']);
  assert.deepEqual([d.gradeCle, d.valider, d.change], ['agent', true, true]);
});

test('relecture : membre parti du serveur, grades liés retirés, grade manuel gardé', () => {
  assert.deepEqual([relu({ gradeCle: 'agent', statut: 'valide', rolesDiscord: ['1002'] }, null).gradeCle, relu({ gradeCle: 'agent', statut: 'valide', rolesDiscord: ['1002'] }, null).parti], [null, true]);
  assert.equal(relu({ gradeCle: 'stagiaire', statut: 'valide', rolesDiscord: [] }, null).gradeCle, 'stagiaire');
});
