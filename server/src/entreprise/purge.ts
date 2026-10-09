// ENTREPRISE — durées de conservation de Dynasty 8 (annoncées dans confidentialite.html), appliquées chaque jour.
// Les ventes ne sont jamais purgées : elles font l'historique des primes et de la paie. Les événements du bot et les
// sessions relèvent du socle (socle/purge.ts).
import { prisma } from '../socle/db.js';
import { purgerReponses } from './rh.js';

const JOUR = 24 * 3600e3;
const MESSAGES_JOURS = 183, AGENDA_JOURS = 365, CANDIDATURES_JOURS = 365, RELEVES_GARDES = 20;

async function purger(): Promise<void> {
  await purgerReponses();
  const avant = (jours: number) => new Date(Date.now() - jours * JOUR);
  const [messages, agenda, candidatures] = await Promise.all([
    prisma.message.deleteMany({ where: { envoyeLe: { lt: avant(MESSAGES_JOURS) } } }),
    prisma.evenementAgenda.deleteMany({ where: { jour: { lt: avant(AGENDA_JOURS) } } }),
    // une candidature encore à traiter (en attente, ou refusée faute de réglage) reste, quel que soit son âge
    prisma.arriveeBot.deleteMany({ where: { resultat: { notIn: ['attente', 'refusee'] }, recuLe: { lt: avant(CANDIDATURES_JOURS) } } }),
  ]);
  // relevés Tablettes : chaque retrait d'une ligne en enregistre une nouvelle copie ; seuls les plus récents servent
  const gardes = await prisma.importCompta.findMany({ where: { type: 'tablettes' }, orderBy: [{ importeLe: 'desc' }, { id: 'desc' }], take: RELEVES_GARDES, select: { id: true } });
  const releves = gardes.length < RELEVES_GARDES ? { count: 0 } : await prisma.importCompta.deleteMany({ where: { type: 'tablettes', id: { notIn: gardes.map(g => g.id) } } });
  const effaces = { messages: messages.count, agenda: agenda.count, candidatures: candidatures.count, releves: releves.count };
  if (Object.values(effaces).some(Boolean)) console.log('[purge] effacés :', JSON.stringify(effaces));
}

// au démarrage puis une fois par jour ; unref : ce minuteur ne retient pas l'arrêt du serveur
export function planifierPurge(): void {
  const run = () => purger().catch(e => console.error('[purge]', e));
  run();
  setInterval(run, JOUR).unref();
}
