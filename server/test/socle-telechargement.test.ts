// SOCLE — téléchargement par lien (src/socle/telechargement.ts) : un lien donné par un utilisateur ne doit jamais faire
// joindre au serveur une adresse interne. Une régression ici ne se voit pas à l'écran : elle ouvre une faille.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseInterdite, LienRefuse, telecharger } from '../src/socle/telechargement.js';

test('adresses internes refusées, IPv4 et IPv6', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.17.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'pas une ip']) {
    assert.equal(adresseInterdite(ip), true, ip);
  }
});

test('adresses publiques acceptées', () => {
  for (const ip of ['1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(adresseInterdite(ip), false, ip);
  }
});

// refusés avant toute connexion (ou au moment de la résolution du nom, sans réseau extérieur)
test('liens refusés', async () => {
  for (const lien of ['http://exemple.fr/a.png', 'ftp://exemple.fr/a.png', 'https://exemple.fr:8443/a.png', 'https://moi:secret@exemple.fr/a.png',
    'https://127.0.0.1/a.png', 'https://[::1]/a.png', 'https://169.254.169.254/latest', 'https://localhost/a.png', 'pas un lien', '']) {
    await assert.rejects(telecharger(lien), LienRefuse, lien);
  }
});
