// SOCLE — Paramètres (src/socle/parametres.ts) : une saisie de la gestion n'est enregistrée que sous sa forme attendue.
// Une origine est appelée par le serveur : une adresse interne acceptée ici ouvrirait le réseau du serveur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { declarerParametres, validerParametre } from '../src/socle/parametres.js';
import type { DefinitionParametre } from '../src/socle/contrat.js';

const def = (type: DefinitionParametre['type'], extra: Partial<DefinitionParametre> = {}): DefinitionParametre => ({ cle: 'essai', type, libelle: 'Essai', aide: '', ...extra });
const valeur = (d: DefinitionParametre, saisie: string) => { const r = validerParametre(d, saisie); return 'valeur' in r ? r.valeur : null; };

test('lien : https seulement, vide accepté', () => {
  assert.equal(valeur(def('lien'), ' https://boutique.exemple.fr/a?b=1 '), 'https://boutique.exemple.fr/a?b=1');
  assert.equal(valeur(def('lien'), ''), '');
  for (const s of ['http://exemple.fr', 'javascript:alert(1)', 'https://moi:secret@exemple.fr', 'exemple.fr']) assert.equal(valeur(def('lien'), s), null, s);
});

test('origine : réduite à l’origine, jamais le serveur ni le réseau interne', () => {
  assert.equal(valeur(def('origine'), 'https://carte.exemple.fr/chemin?x=1'), 'https://carte.exemple.fr');
  for (const s of ['https://127.0.0.1', 'https://localhost', 'https://[::1]', 'https://169.254.169.254', 'https://10.0.0.2:8443',
    'https://db', 'https://carte.local', 'https://host.docker.internal', 'https://app.localhost']) {
    assert.equal(valeur(def('origine'), s), null, s);
  }
});

test('entier, identifiants Discord, saisie propre au site', () => {
  const entier = def('entier', { min: 1, max: 72, defaut: 12 });
  assert.equal(valeur(entier, '24'), '24');
  for (const s of ['0', '73', '1.5', 'douze']) assert.equal(valeur(entier, s), null, s);
  assert.equal(valeur(def('id-discord'), '123456789012345678'), '123456789012345678');
  assert.equal(valeur(def('id-discord'), '<@123456789012345678>'), null);
  assert.equal(valeur(def('ids-discord'), '123456789012345678, 223456789012345678 123456789012345678'), '123456789012345678 223456789012345678');
  assert.equal(valeur(def('ids-discord'), '123456789012345678 @everyone'), null);
  const propre = def('texte', { lire: s => (s.startsWith('ok:') ? s.slice(3) : { erreur: 'refusé' }) });
  assert.equal(valeur(propre, 'ok:abc'), 'abc');
  assert.deepEqual(validerParametre(propre, 'non'), { erreur: 'Essai : refusé' });
});

test('déclarations contrôlées au démarrage', () => {
  assert.throws(() => declarerParametres([{ titre: 'x', reglages: [def('lien', { cle: 'Mauvaise-Clé' })] }]));
  assert.throws(() => declarerParametres([{ titre: 'x', reglages: [def('lien'), def('texte')] }]), /deux fois/);
  assert.throws(() => declarerParametres([{ titre: 'x', reglages: [def('texte', { public: true })] }]), /public/);
  assert.throws(() => declarerParametres([{ titre: 'x', reglages: [def('entier')] }]), /min, max/);
  assert.doesNotThrow(() => declarerParametres([{ titre: 'x', reglages: [def('lien', { public: true })] }]));
});
