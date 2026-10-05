// ENTREPRISE — photos des agents (annonces, profils) : téléchargement d'une image donnée par lien, rattachement à une
// annonce, nettoyage du stockage. Le contrôle et le réencodage de l'image sont ceux du socle (socle/images.ts).
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns';
import type { RequestHandler } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../socle/db.js';
import { body, text } from '../socle/http.js';
import { limits } from '../socle/limites.js';
import { storage } from '../socle/storage.js';
import { enregistrerImage, ImageRefusee, retirerImage, type ImageEnregistree } from '../socle/images.js';

export const MAX_PHOTOS_BIEN = 10;
const OCTETS_MAX = 15 * 1024 * 1024;   // même plafond qu'un fichier envoyé (socle/images.ts)
const DELAI_MS = 15_000;
const REDIRECTIONS_MAX = 3;

// ---------- téléchargement d'une image par lien ----------
// Le serveur va chercher une adresse donnée par un utilisateur : jamais vers lui-même ni le réseau interne (sinon un
// lien bien choisi ferait lire au serveur une page qu'il est seul à pouvoir joindre). L'adresse IP est contrôlée au
// moment même de la connexion (lookup ci-dessous), pas seulement avant : un nom qui changerait d'adresse entre les deux
// ne passe pas. https uniquement, port par défaut, 15 Mo et 15 s au plus, 3 redirections contrôlées de la même façon.
const interdites = new BlockList();
for (const [reseau, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) {
  interdites.addSubnet(reseau, bits, 'ipv4');
}
for (const [reseau, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) {
  interdites.addSubnet(reseau, bits, 'ipv6');
}
export const adresseInterdite = (ip: string): boolean => {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];   // IPv4 écrite en IPv6
  if (v4) return interdites.check(v4, 'ipv4');
  const famille = isIP(ip);
  return famille === 0 || interdites.check(ip, famille === 6 ? 'ipv6' : 'ipv4');
};

const lookupSur: typeof lookup = ((nom: string, options: object, rappel: (e: Error | null, a?: unknown, f?: number) => void) => {
  lookup(nom, { ...options, all: true }, (err, adresses) => {
    if (err) return rappel(err);
    const liste = adresses as { address: string; family: number }[];
    if (!liste.length || liste.some(a => adresseInterdite(a.address))) return rappel(Object.assign(new Error('adresse interdite'), { code: 'ADRESSE_INTERDITE' }));
    if ((options as { all?: boolean }).all) rappel(null, liste);
    else rappel(null, liste[0].address, liste[0].family);
  });
}) as typeof lookup;

export class LienRefuse extends ImageRefusee {}

function adresseLien(brut: string): URL {
  let u: URL;
  try { u = new URL(brut); } catch { throw new LienRefuse('Lien illisible.'); }
  if (u.protocol !== 'https:') throw new LienRefuse('Le lien doit commencer par https://.');
  if (u.port && u.port !== '443') throw new LienRefuse('Lien refusé (port inhabituel).');
  if (u.username || u.password) throw new LienRefuse('Lien refusé (identifiants dans l’adresse).');
  // une adresse IP écrite telle quelle est contrôlée ici (le lookup ne serait pas appelé)
  const hote = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hote) && adresseInterdite(hote)) throw new LienRefuse('Lien refusé (adresse interne).');
  return u;
}

function obtenir(u: URL): Promise<{ statut: number; location?: string; type: string; corps: Buffer }> {
  return new Promise((ok, ko) => {
    const req = https.get(u, { lookup: lookupSur, timeout: DELAI_MS, headers: { 'User-Agent': 'Dynasty8-photos/1.0', Accept: 'image/*' } }, res => {
      const statut = res.statusCode ?? 0;
      if (statut >= 300 && statut < 400) { res.resume(); ok({ statut, location: res.headers.location, type: '', corps: Buffer.alloc(0) }); return; }
      const annonce = Number(res.headers['content-length'] || 0);
      if (annonce > OCTETS_MAX) { res.destroy(); ko(new LienRefuse('Image trop lourde (15 Mo max).')); return; }
      const morceaux: Buffer[] = [];
      let total = 0;
      res.on('data', (m: Buffer) => {
        total += m.length;
        if (total > OCTETS_MAX) { res.destroy(); ko(new LienRefuse('Image trop lourde (15 Mo max).')); return; }
        morceaux.push(m);
      });
      res.on('end', () => ok({ statut, type: String(res.headers['content-type'] || ''), corps: Buffer.concat(morceaux) }));
      res.on('error', ko);
    });
    // délai global (connexion + lecture complète), pas seulement d'inactivité
    const minuteur = setTimeout(() => req.destroy(new LienRefuse('Le site de l’image ne répond pas (15 s).')), DELAI_MS);
    req.on('close', () => clearTimeout(minuteur));
    req.on('timeout', () => req.destroy(new LienRefuse('Le site de l’image ne répond pas (15 s).')));
    req.on('error', e => ko((e as { code?: string }).code === 'ADRESSE_INTERDITE' ? new LienRefuse('Lien refusé (adresse interne).') : e instanceof LienRefuse ? e : new LienRefuse('Image injoignable à cette adresse.')));
  });
}

export async function telechargerImage(brut: string): Promise<Buffer> {
  let u = adresseLien(brut.trim());
  for (let i = 0; ; i++) {
    const r = await obtenir(u);
    if (r.statut >= 300 && r.statut < 400) {
      if (!r.location || i >= REDIRECTIONS_MAX) throw new LienRefuse('Trop de redirections.');
      u = adresseLien(new URL(r.location, u).toString());
      continue;
    }
    if (r.statut !== 200) throw new LienRefuse(`Image introuvable à cette adresse (réponse ${r.statut}).`);
    // le contenu réel est contrôlé ensuite par le socle ; ceci écarte d'emblée une page web
    if (r.type && !/^image\//i.test(r.type) && !/octet-stream/i.test(r.type)) throw new LienRefuse('Ce lien ne mène pas à une image (copie l’adresse de l’image elle-même).');
    return r.corps;
  }
}

// ---------- enregistrement ----------
export async function enregistrerPhoto(usage: 'bien' | 'profil', compteId: number, octets: Buffer | undefined): Promise<ImageEnregistree> {
  // enregistrerImage ne lit que le contenu du fichier
  const image = await enregistrerImage(usage === 'bien' ? 'biens' : 'profils', octets ? { buffer: octets } as Express.Multer.File : undefined);
  await prisma.photo.create({ data: { usage, cle: image.cle, url: image.url, cleMini: image.cleMini, urlMini: image.urlMini, compteId } });
  return image;
}

// Photos d'une annonce, dans la transaction qui l'enregistre. Accepte : une photo envoyée par ce site encore libre
// (temporaire) ou déjà sur cette annonce, ou une adresse que l'annonce avait déjà (photos reprises de l'ancien site).
// Toute autre adresse est refusée : une annonce n'affiche jamais une image hébergée ailleurs. Les photos retirées de
// l'annonce partent au nettoyage.
export async function rattacherPhotosBien(tx: Prisma.TransactionClient, bienId: number, urls: string[], anciennes: string[]): Promise<void> {
  const connues = await tx.photo.findMany({ where: { url: { in: urls }, usage: 'bien' } });
  const parUrl = new Map(connues.map(p => [p.url, p]));
  for (const url of urls) {
    const p = parUrl.get(url);
    const libre = p && (p.statut === 'temporaire' || (p.statut === 'attachee' && p.bienId === bienId));
    if (libre || (!p && anciennes.includes(url))) continue;
    throw new ImageRefusee(p?.statut === 'attachee' ? 'Une photo est déjà utilisée par une autre annonce : ajoute-la à nouveau (« Parcourir » ou par lien).'
      : p ? 'Une photo a expiré avant l’enregistrement de l’annonce : ajoute-la à nouveau.'
      : 'Une photo de l’annonce n’a pas été envoyée par ce site : ajoute-la avec « Parcourir » ou par lien.');
  }
  await tx.photo.updateMany({ where: { url: { in: urls }, usage: 'bien' }, data: { statut: 'attachee', bienId } });
  await tx.photo.updateMany({ where: { bienId, usage: 'bien', url: { notIn: urls } }, data: { statut: 'a_supprimer', bienId: null } });
}

// Photo du profil public d'un agent, dans la transaction qui l'enregistre. Accepte : une photo de profil encore libre
// envoyée par l'auteur de la modification (l'agent lui-même, ou la Direction pour lui), celle déjà sur ce profil, ou
// l'adresse que le profil avait déjà (photo reprise de l'ancien site). L'ancienne photo part au nettoyage.
export async function rattacherPhotoProfil(tx: Prisma.TransactionClient, compteId: number, auteurId: number, url: string | null, ancienne: string | null): Promise<void> {
  if (url && url !== ancienne) {
    const p = await tx.photo.findUnique({ where: { url } });
    if (!p || p.usage !== 'profil' || p.statut !== 'temporaire' || p.compteId !== auteurId) {
      throw new ImageRefusee(p?.statut === 'temporaire' || !p ? 'La photo n’a pas été envoyée par ce site, ou a expiré : choisis-la à nouveau.' : 'Cette photo est déjà utilisée ailleurs : choisis-la à nouveau.');
    }
    await tx.photo.update({ where: { id: p.id }, data: { statut: 'attachee', compteId } });
  }
  if (ancienne && ancienne !== url) await tx.photo.updateMany({ where: { url: ancienne, usage: 'profil' }, data: { statut: 'a_supprimer' } });
}

// ---------- nettoyage ----------
// Une photo envoyée mais jamais enregistrée dans une annonce reste « temporaire » : gardée 24 h (l'agent peut encore
// enregistrer son annonce), puis effacée. Une photo « a_supprimer » est effacée au passage suivant. Un échec du
// stockage garde la ligne (réessai au passage suivant) : jamais un fichier en ligne sans trace en base.
const GARDE_TEMPORAIRE_MS = 24 * 3600e3;
async function nettoyer(): Promise<void> {
  // d'abord rendue impossible à rattacher (rattacherPhotosBien n'accepte que « temporaire »), ensuite seulement retirée
  // du stockage : une annonce enregistrée au même instant ne peut pas garder une photo dont le fichier disparaît
  await prisma.photo.updateMany({ where: { statut: 'temporaire', creeLe: { lt: new Date(Date.now() - GARDE_TEMPORAIRE_MS) } }, data: { statut: 'a_supprimer' } });
  const aEffacer = await prisma.photo.findMany({ where: { statut: 'a_supprimer' }, orderBy: { id: 'asc' }, take: 50 });
  let effacees = 0;
  for (const p of aEffacer) {
    try {
      await retirerImage(p);
      await prisma.photo.delete({ where: { id: p.id } });
      effacees++;
    } catch (e) {
      await prisma.photo.update({ where: { id: p.id }, data: { erreur: String((e as Error).message).slice(0, 300) } }).catch(() => {});
    }
  }
  if (effacees) console.log(`Photos : ${effacees} photo(s) inutilisée(s) retirée(s) du stockage`);
}

export function planifierNettoyagePhotos(): void {
  const run = () => nettoyer().catch(e => console.error('[photos]', e));
  setTimeout(run, 60_000).unref();
  setInterval(run, 15 * 60_000).unref();
}

// ---------- route « photo par lien » (annonces, profils) ----------
// lien collé (indispensable dans l'ordinateur en jeu, sans sélecteur de fichiers) : le serveur télécharge l'image et la
// traite comme un fichier envoyé — seule l'adresse de ce site est gardée, jamais le lien. À placer après la garde.
export const photoParLien = (usage: 'bien' | 'profil'): RequestHandler[] => [limits.upload, async (req, res) => {
  const lien = text(body(req).url, 2048);
  if (!lien) { res.status(400).json({ error: 'Colle l’adresse d’une image.' }); return; }
  if (!storage.accepte) { res.status(503).json({ error: 'L’envoi d’images n’est pas encore configuré sur ce site.' }); return; }
  let octets: Buffer;
  try { octets = await telechargerImage(lien); }
  catch (e) { if (e instanceof ImageRefusee) throw e; throw new ImageRefusee('Image injoignable à cette adresse.'); }
  const image = await enregistrerPhoto(usage, req.compte.id, octets);
  res.status(201).json({ url: image.url });
}];
