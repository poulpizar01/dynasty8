// ENTREPRISE — membres en service, lus dans le salon Discord des prises / fins de service. Le bot des services publie un
// message par événement, avec un « ID service » unique :
//   🟢 Service démarré               Employé, Mode, Début, ID service
//   ⚫ Service terminé                Employé, Cause de fin, Durée réelle, Début, Fin, ID service
//   🟣 Service fermé pour inactivité (mêmes champs + Fermé par)
//   🔴 Service terminé en avance      (mêmes champs + Minimum requis, Justification)
// Début et Fin sont des horodatages Discord (<t:1791…:f>).
// Le site lit ce salon chaque minute (jeton du bot : DISCORD_BOT_TOKEN ; ID du salon : Paramètres), à partir du dernier
// message déjà lu, et tient la table services à jour : une ligne par ID service, fin vide tant que la personne est en
// service. Cas particuliers :
//   - fin sans début lu : ligne créée depuis le message de fin (son champ Début), anomalie « fin_sans_debut » ;
//   - double début : une nouvelle prise de service de la même personne ferme la précédente restée ouverte, à l'heure de
//     la nouvelle (« debut_en_double ») ;
//   - service jamais fermé : fermé N heures après son début (Paramètres, 12 par défaut) ; une vraie fin reçue plus tard
//     la remplace ;
//   - message relu : ignoré (ID service déjà connu).
// Rien n'est deviné : un message sans « ID service » ni titre reconnu est ignoré. Seuls les messages de bots et de
// webhooks sont lus : un membre ne peut pas imiter une prise de service en écrivant dans le salon.
import { config } from '../socle/config.js';
import { appelBot, ErreurDiscord } from '../socle/discord.js';
import { prisma } from '../socle/db.js';
import { entierRegle, parametre } from './parametres.js';
import { lireEmbedService, normaliser, type Embed, type EvenementService } from './services-messages.js';

const PAGES_MAX_PAR_PASSE = 10;   // 1 000 messages par minute au plus

// ---- lecture du salon ----
// messages propres à la lecture du salon ; les autres cas gardent celui du socle
const MESSAGES_SALON: Record<number, string> = {
  403: 'Le bot n’a pas accès à ce salon (droits « Voir le salon » et « Voir les anciens messages »).',
  404: 'Salon introuvable : vérifiez l’ID du salon des services.',
  429: 'Discord demande de ralentir : nouvelle tentative à la prochaine minute.',
};
async function appelDiscord(chemin: string): Promise<unknown> {
  try { return await appelBot('GET', chemin); }
  catch (e) { throw e instanceof ErreurDiscord && MESSAGES_SALON[e.statut] ? new ErreurDiscord(e.statut, MESSAGES_SALON[e.statut]) : e; }
}

export type MessageDiscord = { id: string; timestamp?: string; webhook_id?: string; author?: { bot?: boolean }; embeds?: Embed[] };
const comparer = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

// messages du salon après `apres` (ou les 100 derniers au premier passage), du plus ancien au plus récent
async function lireMessagesSalon(salonId: string, apres: string | null): Promise<MessageDiscord[]> {
  const messages: MessageDiscord[] = [];
  let curseur = apres;
  for (let page = 0; page < PAGES_MAX_PAR_PASSE; page++) {
    const lot = await appelDiscord(`/channels/${salonId}/messages?limit=100${curseur ? `&after=${curseur}` : ''}`);
    if (!Array.isArray(lot) || !lot.length) break;
    const tries = (lot as MessageDiscord[]).filter(m => /^\d{15,22}$/.test(String(m?.id))).sort((a, b) => comparer(a.id, b.id));
    messages.push(...tries);
    if (!curseur || lot.length < 100 || !tries.length) break;   // premier passage : les 100 derniers suffisent
    curseur = tries[tries.length - 1].id;
  }
  return messages;
}

// ---- enregistrement ----
type Fiche = { id: number; prenom: string; nom: string; discordId: string | null };
// fiche RH de la personne : par identifiant Discord, sinon par « Prénom Nom »
function trouverFiche(employes: Fiche[], ev: EvenementService): Fiche | null {
  if (ev.discordId) { const f = employes.find(e => e.discordId === ev.discordId); if (f) return f; }
  const nom = normaliser(ev.employe);
  return nom ? employes.find(e => normaliser(`${e.prenom} ${e.nom}`) === nom) ?? null : null;
}

async function enregistrerEvenement(ev: EvenementService, messageId: string, employes: Fiche[]): Promise<'debut' | 'fin' | 'ignore' | 'deja_connu'> {
  const fiche = trouverFiche(employes, ev);
  return prisma.$transaction(async tx => {
    const existant = await tx.service.findUnique({ where: { serviceId: ev.serviceId } });
    if (ev.type === 'debut') {
      if (existant) return 'deja_connu';
      if (!ev.debut) return 'ignore';
      // double début : la prise de service précédente de la même personne, jamais fermée, s'arrête à l'heure de la nouvelle
      const memePersonne = fiche ? { employeId: fiche.id } : ev.discordId ? { discordId: ev.discordId } : { employeNom: ev.employe };
      await tx.service.updateMany({
        where: { fin: null, debut: { lt: ev.debut }, ...memePersonne },
        data: { fin: ev.debut, causeFin: 'Nouvelle prise de service sans fin', finSource: 'doublon', anomalie: 'debut_en_double' },
      });
      await tx.service.create({ data: { serviceId: ev.serviceId, employeNom: ev.employe, discordId: ev.discordId, employeId: fiche?.id ?? null, mode: ev.mode, debut: ev.debut, messageDebut: messageId } });
      return 'debut';
    }
    // fin : la vraie fin du bot l'emporte toujours, même sur une clôture automatique
    if (!ev.fin) return 'ignore';
    if (existant) {
      if (existant.finSource === 'bot') return 'deja_connu';
      await tx.service.update({ where: { id: existant.id }, data: { fin: ev.fin, causeFin: ev.cause, finSource: 'bot', messageFin: messageId, anomalie: existant.anomalie === 'cloture_auto' ? '' : existant.anomalie } });
      return 'fin';
    }
    // fin sans début lu (début publié avant la première lecture, message supprimé…)
    await tx.service.create({ data: { serviceId: ev.serviceId, employeNom: ev.employe, discordId: ev.discordId, employeId: fiche?.id ?? null, debut: ev.debut ?? ev.fin, fin: ev.fin, causeFin: ev.cause, finSource: 'bot', messageFin: messageId, anomalie: 'fin_sans_debut' } });
    return 'fin';
  });
}

// services ouverts depuis plus de `heures` : fermés à début + heures
async function cloturerServicesOublies(heures: number, maintenant = new Date()): Promise<number> {
  const ouverts = await prisma.service.findMany({ where: { fin: null, debut: { lte: new Date(maintenant.getTime() - heures * 3600e3) } }, select: { id: true, debut: true } });
  for (const o of ouverts) {
    await prisma.service.updateMany({
      where: { id: o.id, fin: null },
      data: { fin: new Date(o.debut.getTime() + heures * 3600e3), causeFin: `Clôture automatique (${heures} h sans fin de service)`, finSource: 'auto', anomalie: 'cloture_auto' },
    });
  }
  return ouverts.length;
}

const ecrireEtat = (data: { statut: string; erreur?: string; dernierMessageId?: string | null; nbLus?: number; nbReconnus?: number }) => {
  const champs = { derniereLecture: new Date(), statut: data.statut, erreur: (data.erreur ?? '').slice(0, 300), nbLus: data.nbLus ?? 0, nbReconnus: data.nbReconnus ?? 0, ...(data.dernierMessageId && { dernierMessageId: data.dernierMessageId }) };
  return prisma.serviceEtat.upsert({ where: { id: 1 }, create: { id: 1, ...champs }, update: champs });
};

export const lectureReglee = () => !!config.discord.botToken && /^\d{15,21}$/.test(parametre('services_salon_id'));

// une passe : lit les nouveaux messages, les enregistre, ferme les oubliés
async function lireServices(): Promise<void> {
  if (!lectureReglee()) return;
  const salonId = parametre('services_salon_id');
  const etat = await prisma.serviceEtat.findUnique({ where: { id: 1 } });
  // salon changé dans Paramètres : on repart de ses derniers messages
  if (etat?.salonId !== salonId) await prisma.serviceEtat.upsert({ where: { id: 1 }, create: { id: 1, salonId }, update: { salonId, dernierMessageId: null } });
  const apres = etat?.salonId === salonId ? etat.dernierMessageId : null;
  let messages: MessageDiscord[];
  try { messages = await lireMessagesSalon(salonId, apres); }
  catch (e) {
    if (!(e instanceof ErreurDiscord)) throw e;
    await ecrireEtat({ statut: 'erreur', erreur: e.message });
    return;
  }
  const reconnus = await traiterMessages(messages);
  await ecrireEtat({ statut: 'ok', dernierMessageId: messages.at(-1)?.id ?? null, nbLus: messages.length, nbReconnus: reconnus });
}

// messages lus (du plus ancien au plus récent) → table services, puis clôture des oubliés ; renvoie le nombre reconnu
export async function traiterMessages(messages: MessageDiscord[], maintenant = new Date()): Promise<number> {
  const employes = await prisma.employe.findMany({ select: { id: true, prenom: true, nom: true, discordId: true } });
  let reconnus = 0;
  for (const message of messages) {
    if (!message.author || !(message.author.bot || message.webhook_id)) continue;
    for (const embed of message.embeds ?? []) {
      const ev = lireEmbedService(embed, message.timestamp);
      if (!ev) continue;
      const r = await enregistrerEvenement(ev, message.id, employes);
      if (r === 'debut' || r === 'fin') reconnus++;
    }
  }
  await cloturerServicesOublies(entierRegle('services_cloture_heures'), maintenant);
  return reconnus;
}

// chaque minute ; une passe ne commence pas tant que la précédente tourne
let enCours = false;
export function planifierServices(): void {
  const run = async () => {
    if (enCours) return;
    enCours = true;
    try { await lireServices(); } catch (e) { console.error('[services]', e); } finally { enCours = false; }
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 60_000).unref();
}
