// Membres en service (src/entreprise/services-messages.ts) : lecture des messages du bot des services. Les messages
// reproduisent ceux des captures du 8 octobre 2026 ; Discord n'est jamais appelé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { discordIdDepuisAvatar, lireEmbedService, lireHorodatageDiscord } from '../src/entreprise/services-messages.js';

const t = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const quand = (iso: string) => `<t:${t(iso)}:f>\n<t:${t(iso)}:R>`;
const AVATAR = 'https://cdn.discordapp.com/avatars/411111111111111111/a1b2c3.png';

const embedDebut = () => ({
  title: '🟢 Service démarré',
  author: { name: 'Grey Brook', icon_url: AVATAR },
  fields: [
    { name: 'Employé', value: 'Grey Brook' }, { name: 'Mode', value: 'Autonome' },
    { name: 'Début', value: quand('2026-10-08T12:57:00Z') }, { name: 'ID service', value: '`cmuzjk6sl04ql3ao1asdrh25z`' },
  ],
});
const embedFin = (titre: string, cause: string) => ({
  title: titre,
  author: { name: 'Grey Brook', icon_url: AVATAR },
  fields: [
    { name: 'Employé', value: 'Grey Brook' }, { name: 'Cause de fin', value: cause }, { name: 'Durée réelle', value: '54m' },
    { name: 'Début', value: quand('2026-10-08T12:57:00Z') }, { name: 'Fin', value: quand('2026-10-08T13:51:00Z') },
    { name: 'ID service', value: '`cmuzjk6sl04ql3ao1asdrh25z`' },
  ],
});

test('horodatages et identifiant Discord', () => {
  assert.equal(lireHorodatageDiscord(quand('2026-10-08T12:57:00Z'))?.toISOString(), '2026-10-08T12:57:00.000Z');
  assert.equal(lireHorodatageDiscord('8 octobre 2026 14:57'), null, 'un texte n’est jamais interprété comme une date');
  assert.equal(discordIdDepuisAvatar(AVATAR), '411111111111111111');
  assert.equal(discordIdDepuisAvatar('https://cdn.discordapp.com/guilds/1/users/422222222222222222/avatars/x.png'), '422222222222222222');
  assert.equal(discordIdDepuisAvatar('https://cdn.discordapp.com/embed/avatars/0.png'), null);
});

test('prise de service', () => {
  const d = lireEmbedService(embedDebut())!;
  assert.deepEqual([d.type, d.serviceId, d.employe, d.mode, d.discordId, d.debut?.toISOString()],
    ['debut', 'cmuzjk6sl04ql3ao1asdrh25z', 'Grey Brook', 'Autonome', '411111111111111111', '2026-10-08T12:57:00.000Z']);
});

test('fins de service : normale, inactivité, en avance', () => {
  for (const [titre, cause] of [['⚫ Service terminé', 'Fin normale'], ['🟣 Service fermé pour inactivité', 'Inactivité'], ['🔴 Service terminé en avance', 'Fin anticipée']]) {
    const f = lireEmbedService(embedFin(titre, cause))!;
    assert.equal(f.type, 'fin', titre);
    assert.equal(f.cause, cause);
    assert.equal(f.fin?.toISOString(), '2026-10-08T13:51:00.000Z');
  }
});

test('rien n’est deviné', () => {
  assert.equal(lireEmbedService({ title: 'Nouvelle annonce', fields: [] }), null);
  assert.equal(lireEmbedService({ ...embedDebut(), fields: embedDebut().fields.filter(f => f.name !== 'ID service') }), null, 'sans ID service : ignoré');
});
