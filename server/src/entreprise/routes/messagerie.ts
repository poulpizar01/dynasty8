// ENTREPRISE — messagerie interne (widget « façon MSN » de la gestion, gestion/messagerie.js) : conversations privées
// entre deux agents validés, quel que soit leur grade. L'expéditeur est toujours le compte de la session, jamais une
// valeur envoyée par le navigateur. Le widget interroge le serveur toutes les 4 s : la présence (« vu il y a moins de
// 25 s ») et l'indicateur « en train d'écrire » sont éphémères et restent en mémoire — un seul processus sert le site.
import { Router } from 'express';
import { prisma } from '../../socle/db.js';
import { body, entier, text, valide } from '../../socle/http.js';

export const messagerie = Router();

const STATUTS = ['disponible', 'absent', 'occupe', 'invisible'];
const EN_LIGNE_MS = 25_000, FRAPPE_MS = 4_000;
const vuLe = new Map<number, number>();             // compte → dernier signe de vie
const frappe = new Map<string, number>();           // « expéditeur:destinataire » → jusqu'à quand
const signeDeVie = (id: number) => vuLe.set(id, Date.now());
// purge des entrées périmées (un compte supprimé ne reste pas en mémoire)
setInterval(() => {
  const t = Date.now();
  for (const [id, v] of vuLe) if (t - v > EN_LIGNE_MS) vuLe.delete(id);
  for (const [cle, v] of frappe) if (v < t) frappe.delete(cle);
}, 60_000).unref();

// statut vu par les autres : « invisible » et absence de signe de vie récent → hors ligne
const statutVisible = (id: number, choisi: string | undefined) =>
  choisi === 'invisible' || Date.now() - (vuLe.get(id) ?? 0) > EN_LIGNE_MS ? 'hors_ligne' : choisi ?? 'disponible';

const avatarDe = (c: { discordId: string; avatar: string | null }, photo: string | null | undefined) =>
  photo || (c.avatar ? `https://cdn.discordapp.com/avatars/${c.discordId}/${c.avatar}.webp?size=64` : '');

messagerie.get('/api/messagerie/contacts', ...valide, async (req, res) => {
  const moi = req.compte.id;
  signeDeVie(moi);
  const [comptes, statuts, derniers, nonLus] = await Promise.all([
    prisma.compte.findMany({ where: { statut: 'valide', id: { not: moi } }, select: { id: true, nom: true, pseudo: true, discordId: true, avatar: true } }),
    prisma.statutMessagerie.findMany(),
    // dernier message de chaque conversation où je suis
    prisma.$queryRaw<{ autre: number; type: string; contenu: string; envoye_le: Date }[]>`
      SELECT DISTINCT ON (autre) autre, type, contenu, envoye_le FROM (
        SELECT CASE WHEN expediteur_id = ${moi} THEN destinataire_id ELSE expediteur_id END AS autre, type, contenu, envoye_le, id
        FROM messages WHERE expediteur_id = ${moi} OR destinataire_id = ${moi}) m
      ORDER BY autre, id DESC`,
    prisma.message.groupBy({ by: ['expediteurId'], where: { destinataireId: moi, lu: false }, _count: true }),
  ]);
  const photos = new Map((await prisma.profil.findMany({ where: { compteId: { in: comptes.map(c => c.id) } }, select: { compteId: true, photo: true } })).map(p => [p.compteId, p.photo]));
  const statutDe = new Map(statuts.map(s => [s.compteId, s.statut]));
  const dernierDe = new Map(derniers.map(d => [d.autre, d]));
  const nonLusDe = new Map(nonLus.map(n => [n.expediteurId, n._count]));
  const contacts = comptes.map(c => {
    const d = dernierDe.get(c.id);
    return {
      id: c.id, pseudo: c.nom ?? c.pseudo, avatar: avatarDe(c, photos.get(c.id)),
      statut: statutVisible(c.id, statutDe.get(c.id)),
      dernier_message: d ? (d.type === 'clin_oeil' ? '👋 Clin d’œil' : d.contenu) : '',
      dernier_message_le: d?.envoye_le ?? null,
      non_lus: nonLusDe.get(c.id) ?? 0,
    };
  }).sort((a, b) => (b.dernier_message_le?.getTime() ?? 0) - (a.dernier_message_le?.getTime() ?? 0) || a.pseudo.localeCompare(b.pseudo, 'fr', { sensitivity: 'base' }));
  res.json({ statut: statutDe.get(moi) ?? 'disponible', contacts });
});

messagerie.put('/api/messagerie/statut', ...valide, async (req, res) => {
  const statut = String(body(req).statut ?? '');
  if (!STATUTS.includes(statut)) { res.status(400).json({ error: 'Statut invalide.' }); return; }
  await prisma.statutMessagerie.upsert({ where: { compteId: req.compte.id }, create: { compteId: req.compte.id, statut }, update: { statut } });
  signeDeVie(req.compte.id);
  res.json({ ok: true });
});

messagerie.post('/api/messagerie/frappe', ...valide, (req, res) => {
  const avec = entier(body(req).avec);
  if (!avec) { res.status(400).json({ error: 'Destinataire manquant.' }); return; }
  frappe.set(`${req.compte.id}:${avec}`, Date.now() + FRAPPE_MS);
  res.json({ ok: true });
});

// messages d'une conversation après un identifiant donné ; les lire vaut lecture de ce qu'on a reçu
messagerie.get('/api/messagerie/messages', ...valide, async (req, res) => {
  const moi = req.compte.id, avec = entier(req.query.avec), apres = entier(req.query.apres_id) ?? 0;
  if (!avec) { res.status(400).json({ error: 'Destinataire manquant.' }); return; }
  signeDeVie(moi);
  await prisma.message.updateMany({ where: { expediteurId: avec, destinataireId: moi, lu: false }, data: { lu: true } });
  const [messages, statut] = await Promise.all([
    prisma.message.findMany({
      where: { id: { gt: apres }, OR: [{ expediteurId: moi, destinataireId: avec }, { expediteurId: avec, destinataireId: moi }] },
      orderBy: { id: 'asc' }, take: 200,
    }),
    prisma.statutMessagerie.findUnique({ where: { compteId: avec } }),
  ]);
  res.json({
    messages: messages.map(m => ({ id: m.id, expediteur_id: m.expediteurId, destinataire_id: m.destinataireId, type: m.type, contenu: m.contenu, envoye_le: m.envoyeLe })),
    statut: statutVisible(avec, statut?.statut),
    frappe: (frappe.get(`${avec}:${moi}`) ?? 0) > Date.now(),
  });
});

messagerie.post('/api/messagerie/messages', ...valide, async (req, res) => {
  const b = body(req), moi = req.compte.id, avec = entier(b.avec);
  if (!avec) { res.status(400).json({ error: 'Destinataire invalide.' }); return; }
  if (avec === moi) { res.status(400).json({ error: 'Impossible de vous envoyer un message à vous-même.' }); return; }
  const type = b.type === 'clin_oeil' ? 'clin_oeil' : 'texte';
  const contenu = type === 'clin_oeil' ? '' : text(b.contenu, 1000);
  if (type === 'texte' && !contenu) { res.status(400).json({ error: 'Le message ne peut pas être vide.' }); return; }
  const cible = await prisma.compte.findFirst({ where: { id: avec, statut: 'valide' }, select: { id: true } });
  if (!cible) { res.status(404).json({ error: 'Ce membre est introuvable.' }); return; }
  const m = await prisma.message.create({ data: { expediteurId: moi, destinataireId: avec, type, contenu } });
  frappe.delete(`${moi}:${avec}`);
  signeDeVie(moi);
  res.status(201).json({ id: m.id });
});
