// ENTREPRISE — ce que les bots de Dynasty 8 feraient dans le faux Discord du développement (DISCORD_BOT_TOKEN=simulation,
// socle/discord-simulation.ts) : un ticket par employé relié à Discord (agenda « Perso » pour quelqu'un d'autre), et des
// prises / fins de service inventées dans le salon des services réglé dans Paramètres, au format du bot des services
// (services.ts), pour voir vivre l'encadré « En service ». Ne tourne qu'avec la simulation.
import { config } from '../socle/config.js';
import { prisma } from '../socle/db.js';
import { ajouterPersonnesSimulees, idSimule, publierMessageSimule } from '../socle/discord-simulation.js';
import { parametre } from './parametres.js';

const MODES = ['Agence', 'Terrain', 'Visites'];
const t = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:f>`;
const enService = new Map<string, { serviceId: string; debut: Date; mode: string }>();   // par ID Discord

const employes = async () => (await prisma.employe.findMany({ where: { statut: 'actif', discordId: { not: null } }, select: { discordId: true, prenom: true, nom: true } }))
  .filter(e => /^\d{15,21}$/.test(e.discordId!)).map(e => ({ discordId: e.discordId!, nom: `${e.prenom} ${e.nom}` }));

// debut : heure de prise de service affichée (au démarrage, dans le passé) ; le message, lui, est daté de maintenant,
// sinon il passerait avant le dernier message déjà lu et ne serait jamais relu
function annoncer(e: { discordId: string; nom: string }, maintenant: Date, debut = maintenant) {
  const salon = parametre('services_salon_id');
  if (!/^\d{15,21}$/.test(salon)) return;
  const auteur = { name: e.nom, icon_url: `https://cdn.discordapp.com/avatars/${e.discordId}/simule.png` };
  const ouvert = enService.get(e.discordId);
  if (ouvert) {
    const minutes = Math.round((maintenant.getTime() - ouvert.debut.getTime()) / 60_000);
    publierMessageSimule(salon, { embeds: [{ title: '⚫ Service terminé', author: auteur, fields: [
      { name: 'Employé', value: e.nom }, { name: 'Cause de fin', value: 'Fin normale' }, { name: 'Durée réelle', value: `${Math.floor(minutes / 60)} h ${minutes % 60} min` },
      { name: 'Début', value: t(ouvert.debut) }, { name: 'Fin', value: t(maintenant) }, { name: 'ID service', value: ouvert.serviceId },
    ] }] });
    enService.delete(e.discordId);
  } else {
    const s = { serviceId: `SIM${idSimule()}`, debut, mode: MODES[Math.floor(Math.random() * MODES.length)] };
    publierMessageSimule(salon, { embeds: [{ title: '🟢 Service démarré', author: auteur, fields: [
      { name: 'Employé', value: e.nom }, { name: 'Mode', value: s.mode }, { name: 'Début', value: t(s.debut) }, { name: 'ID service', value: s.serviceId },
    ] }] });
    enService.set(e.discordId, s);
  }
}

// toutes les 2 minutes, une personne prend ou quitte son service ; au démarrage, une partie de l'équipe est déjà en service
export function simulerBotsDiscord(): void {
  if (!config.discord.simulation) return;
  ajouterPersonnesSimulees(employes);
  let premier = true;
  const tic = async () => {
    try {
      const liste = await employes();
      if (!liste.length) return;
      if (premier && /^\d{15,21}$/.test(parametre('services_salon_id'))) {
        premier = false;
        // pas pour qui est déjà en service en base (lancement précédent) : un début antidaté ne fermerait pas le sien,
        // plus récent, et la personne apparaîtrait deux fois
        const ouverts = new Set((await prisma.service.findMany({ where: { fin: null }, select: { discordId: true } })).map(x => x.discordId));
        liste.filter(e => !ouverts.has(e.discordId)).slice(0, Math.ceil(liste.length / 2))
          .forEach((e, i) => annoncer(e, new Date(), new Date(Date.now() - (90 - i * 15) * 60_000)));
        return;
      }
      annoncer(liste[Math.floor(Math.random() * liste.length)], new Date());
    } catch (e) { console.error('[discord simulé]', e); }
  };
  setTimeout(tic, 10_000).unref();
  setInterval(tic, 120_000).unref();
}
