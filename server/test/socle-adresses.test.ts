// SOCLE — adresses interdites (src/socle/adresses.ts) : une adresse réglée depuis la gestion ne doit jamais faire
// joindre au serveur une adresse interne. Une régression ici ne se voit pas à l'écran : elle ouvre une faille.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseInterdite, hoteInterdit, lookupSur } from '../src/socle/adresses.js';

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

test('hôtes d’URL', () => {
  for (const h of ['localhost', 'app.localhost', '127.0.0.1', '[::1]', '169.254.169.254']) assert.equal(hoteInterdit(h), true, h);
  for (const h of ['carte.exemple.fr', '1.1.1.1']) assert.equal(hoteInterdit(h), false, h);
});

test('résolution : un nom qui mène au réseau interne est refusé', async () => {
  const code = await new Promise(ok => lookupSur('localhost', {}, (e: NodeJS.ErrnoException | null) => ok(e?.code)));
  assert.equal(code, 'ADRESSE_INTERDITE');
});
