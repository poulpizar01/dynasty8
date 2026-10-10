// SOCLE — appels au bot Discord (src/socle/discord.ts) : un message posté ne notifie que les personnes visées, quoi que
// contienne son texte, et une erreur de Discord garde son statut. Discord n'est jamais appelé (fetch remplacé).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DISCORD_BOT_TOKEN ||= 'jeton-de-test';
const { posterMessage, appelBot, ErreurDiscord } = await import('../src/socle/discord.js');

const appels: { url: string; init: RequestInit }[] = [];
let reponse = () => new Response(JSON.stringify({ id: '1300000000000000001' }), { status: 200 });
globalThis.fetch = (async (url: string, init: RequestInit) => { appels.push({ url, init }); return reponse(); }) as typeof fetch;

test('message posté : mentions limitées aux personnes visées', async () => {
  const id = await posterMessage('1200000000000000001', { content: '@everyone <@&1100000000000000001> réunion' }, ['411111111111111111']);
  assert.equal(id, '1300000000000000001');
  const corps = JSON.parse(String(appels.at(-1)!.init.body));
  assert.deepEqual(corps.allowed_mentions, { parse: [], users: ['411111111111111111'] });
  assert.match(appels.at(-1)!.url, /\/channels\/1200000000000000001\/messages$/);
});

test('identifiant invalide : refusé avant tout appel', async () => {
  const avant = appels.length;
  await assert.rejects(posterMessage('../guilds/1', { content: 'x' }));
  await assert.rejects(posterMessage('1200000000000000001', { content: 'x' }, ['everyone']));
  assert.equal(appels.length, avant);
});

test('erreur de Discord : statut gardé', async () => {
  reponse = () => new Response('{}', { status: 403 });
  await assert.rejects(appelBot('GET', '/guilds/1200000000000000001/channels'), (e: unknown) => e instanceof ErreurDiscord && e.statut === 403);
});
