// WebMap (src/entreprise/carte-masque.ts) : l'adresse réelle de la carte ne parvient jamais au navigateur, sous aucune
// écriture, et le navigateur ne peut joindre aucun autre site depuis la carte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cspCarte, estTexte, masquerAdresse } from '../src/entreprise/carte-masque.js';

const REELLE = 'https://webmap.exemple.fr', PUBLIQUE = 'https://carte.monsite.fr';
const masquer = (t: string) => masquerAdresse(t, REELLE, PUBLIQUE);

test('toutes les écritures de l’adresse réelle sont remplacées', () => {
  const cas: [string, string][] = [
    ['<script src="https://webmap.exemple.fr/_next/a.js">', '<script src="https://carte.monsite.fr/_next/a.js">'],
    ['fetch("http://webmap.exemple.fr/api")', 'fetch("https://carte.monsite.fr/api")'],
    ['{"url":"https:\/\/webmap.exemple.fr\/api"}', '{"url":"https:\/\/carte.monsite.fr\/api"}'],
    ['/_next/image?url=https%3A%2F%2Fwebmap.exemple.fr%2Fx.png', '/_next/image?url=https%3A%2F%2Fcarte.monsite.fr%2Fx.png'],
    ['"https:\u002F\u002Fwebmap.exemple.fr"', '"https:\u002F\u002Fcarte.monsite.fr"'],
    ['url(//webmap.exemple.fr/f.woff2)', 'url(//carte.monsite.fr/f.woff2)'],
    ['{"hostname":"webmap.exemple.fr"}', '{"hostname":"carte.monsite.fr"}'],
    ['HTTPS://WEBMAP.EXEMPLE.FR/', 'https://carte.monsite.fr/'],
  ];
  for (const [avant, apres] of cas) assert.equal(masquer(avant), apres, avant);
  // rien d'autre n'est touché ; un hôte qui ne fait que ressembler reste tel quel
  assert.equal(masquer('webmapXexemple.fr et exemple.fr'), 'webmapXexemple.fr et exemple.fr');
});

test('aucune trace de l’adresse réelle dans un texte mélangé', () => {
  const texte = 'a https://webmap.exemple.fr b http:\/\/webmap.exemple.fr c https%3a%2f%2fwebmap.exemple.fr d //webmap.exemple.fr e webmap.exemple.fr';
  assert.ok(!masquer(texte).toLowerCase().includes('webmap.exemple.fr'));
});

test('en dev : sous-domaine en http avec port', () => {
  assert.equal(masquerAdresse('https://webmap.exemple.fr/x', REELLE, 'http://carte.localhost:3010'), 'http://carte.localhost:3010/x');
  assert.equal(masquerAdresse('{"h":"webmap.exemple.fr"}', REELLE, 'http://carte.localhost:3010'), '{"h":"carte.localhost:3010"}');
});

test('types réécrits : tout ce qui est du texte, y compris SVG et flux Next.js', () => {
  for (const t of ['text/html; charset=utf-8', 'text/x-component', 'text/plain', 'application/javascript', 'application/json', 'application/manifest+json', 'application/ld+json', 'image/svg+xml', 'application/xml'])
    assert.ok(estTexte(t), t);
  for (const t of ['image/png', 'font/woff2', 'application/octet-stream', 'application/wasm']) assert.ok(!estTexte(t), t);
});

test('politique de contenu : rien en dehors du sous-domaine', () => {
  const csp = cspCarte(["'self'", 'https://monsite.fr']);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'self' https:\/\/monsite\.fr/);
  assert.ok(!/https?:\/\/(?!monsite\.fr)/.test(csp), 'aucune autre origine permise');
});
