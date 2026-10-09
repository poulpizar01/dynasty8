// ENTREPRISE — photos des agents (annonces, profils) : enregistrement, rattachement à une annonce ou un profil,
// nettoyage du stockage. Réception (fichier ou lien), contrôle et réencodage : socle (socle/images.ts).
import type { Request, Response } from 'express';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../socle/db.js';
import { enregistrerImage, ImageRefusee, retirerImage, type ImageEnregistree } from '../socle/images.js';

export const MAX_PHOTOS_BIEN = 10;

// ---------- enregistrement ----------
// Après ...recevoirImage : enregistre la photo, encore « temporaire » tant
// que l'annonce ou le profil ne l'a pas prise, et renvoie son adresse.
export const envoiPhoto = (usage: 'bien' | 'profil') => async (req: Request, res: Response): Promise<void> => {
  const image = await enregistrerPhoto(usage, req.compte.id, req.file);
  res.status(201).json({ url: image.url });
};
async function enregistrerPhoto(usage: 'bien' | 'profil', compteId: number, fichier: Express.Multer.File | undefined): Promise<ImageEnregistree> {
  const image = await enregistrerImage(usage === 'bien' ? 'biens' : 'profils', fichier);
  // base indisponible après le dépôt : le fichier est retiré du stockage, sinon il y resterait sans trace en base
  try { await prisma.photo.create({ data: { usage, cle: image.cle, url: image.url, cleMini: image.cleMini, urlMini: image.urlMini, compteId } }); }
  catch (e) { await retirerImage(image).catch(() => {}); throw e; }
  return image;
}

// Photos d'une annonce, dans la transaction qui l'enregistre. Accepte : une photo envoyée par ce site encore libre
// (temporaire) ou déjà sur cette annonce. Toute autre adresse est refusée : une annonce n'affiche jamais une image
// hébergée ailleurs. Les photos retirées de l'annonce partent au nettoyage.
export async function rattacherPhotosBien(tx: Prisma.TransactionClient, bienId: number, urls: string[]): Promise<void> {
  const connues = await tx.photo.findMany({ where: { url: { in: urls }, usage: 'bien' } });
  const parUrl = new Map(connues.map(p => [p.url, p]));
  for (const url of urls) {
    const p = parUrl.get(url);
    const libre = p && (p.statut === 'temporaire' || (p.statut === 'attachee' && p.bienId === bienId));
    if (libre) continue;
    throw new ImageRefusee(p?.statut === 'attachee' ? 'Une photo est déjà utilisée par une autre annonce : ajoute-la à nouveau (« Parcourir »).'
      : p ? 'Une photo a expiré avant l’enregistrement de l’annonce : ajoute-la à nouveau.'
      : 'Une photo de l’annonce n’a pas été envoyée par ce site : ajoute-la avec « Parcourir ».');
  }
  await tx.photo.updateMany({ where: { url: { in: urls }, usage: 'bien' }, data: { statut: 'attachee', bienId } });
  await tx.photo.updateMany({ where: { bienId, usage: 'bien', url: { notIn: urls } }, data: { statut: 'a_supprimer', bienId: null } });
}

// Photo du profil public d'un agent, dans la transaction qui l'enregistre. Accepte : une photo de profil encore libre
// envoyée par l'auteur de la modification (l'agent lui-même, ou la Direction pour lui), ou celle déjà sur ce profil.
// L'ancienne photo part au nettoyage.
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
// un passage peut durer (stockage lent : jusqu'à 30 s par fichier) : le suivant ne le chevauche pas
let nettoyageEnCours = false;
async function nettoyer(): Promise<void> {
  if (nettoyageEnCours) return;
  nettoyageEnCours = true;
  try { await nettoyerUneFois(); } finally { nettoyageEnCours = false; }
}
async function nettoyerUneFois(): Promise<void> {
  // d'abord rendue impossible à rattacher (rattacherPhotosBien n'accepte que « temporaire »), ensuite seulement retirée
  // du stockage : une annonce enregistrée au même instant ne peut pas garder une photo dont le fichier disparaît
  await prisma.photo.updateMany({ where: { statut: 'temporaire', creeLe: { lt: new Date(Date.now() - GARDE_TEMPORAIRE_MS) } }, data: { statut: 'a_supprimer' } });
  // les plus anciennes d'abord ; un échec enregistre l'erreur, ce qui renvoie la ligne en fin de file (majLe) : 50
  // suppressions qui échouent durablement ne bloquent pas les autres
  const aEffacer = await prisma.photo.findMany({ where: { statut: 'a_supprimer' }, orderBy: { majLe: 'asc' }, take: 50 });
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
