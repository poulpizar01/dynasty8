// ENTREPRISE — gestion des biens du catalogue (permission « biens ») : création, modification, suppression, photos.
// La lecture (publique) est dans vitrine.ts. Corps en snake_case, la forme qu'envoie la gestion (gestion/biens.js).
import { Router } from 'express';
import { prisma } from '../../socle/db.js';
import { body, intParam, permission, text } from '../../socle/http.js';
import { recevoirImage } from '../../socle/images.js';
import { CATEGORIES, COHERENCES, SOUS_CATEGORIES_HABITATION } from '../biens.js';
import { envoiPhoto, MAX_PHOTOS_BIEN, rattacherPhotosBien } from '../photos.js';

export const biens = Router();
const gerer = permission('biens');

// montant ou quantité saisi : entier positif ou nul, borné à la colonne INTEGER ; vide → null
const nombre = (v: unknown): number | null | undefined => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 2_147_483_647 ? Math.round(n) : undefined;   // undefined = invalide
};

// valide et met en forme un bien reçu ; renvoie un message d'erreur (à afficher tel quel) ou les données
function lireBien(b: Record<string, unknown>) {
  const titre = text(b.titre, 120);
  if (!titre) return 'Le nom du bien est obligatoire.';
  const categorie = String(b.categorie ?? 'habitation');
  if (!(CATEGORIES as readonly string[]).includes(categorie)) return 'Catégorie invalide.';
  const sousCategorie = categorie === 'habitation' ? String(b.sous_categorie ?? '') : '';
  if (sousCategorie && !SOUS_CATEGORIES_HABITATION.includes(sousCategorie)) return 'Sous-catégorie invalide pour un bien Habitation.';
  const coherence = b.coherence ? String(b.coherence) : categorie === 'garage' ? 'Garage' : 'Habitation';
  if (!COHERENCES.includes(coherence)) return 'Cohérence invalide.';
  const dispoVente = b.dispo_vente === true, dispoLocation = b.dispo_location === true;
  if (!dispoVente && !dispoLocation) return 'Le bien doit être proposé à la vente et/ou à la location.';
  const prix = nombre(b.prix), prixLocation = nombre(b.prix_location), places = nombre(b.places), coffreKg = nombre(b.coffre_kg);
  if (dispoVente && (prix === null || prix === undefined)) return 'Le prix de vente doit être un nombre positif.';
  if (dispoLocation && (prixLocation === null || prixLocation === undefined)) return 'Le prix de location doit être un nombre positif.';
  if (places === undefined) return 'Le nombre de places doit être un nombre positif.';
  if (coffreKg === undefined) return 'La capacité de coffre doit être un nombre positif.';
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length > MAX_PHOTOS_BIEN) return `${MAX_PHOTOS_BIEN} photos maximum par bien.`;
  if (images.some(u => typeof u !== 'string' || !u || u.length > 512)) return 'Une photo de l’annonce est invalide.';
  const vendu = b.vendu === true;
  return {
    titre, categorie, coherence, vendu,
    sousCategorie: sousCategorie || null,
    zone: text(b.zone, 80) || null,
    dispoVente, dispoLocation,
    prix: dispoVente ? prix! : 0,
    prixLocation: dispoLocation ? prixLocation! : null,
    places, coffreKg,
    description: text(b.description, 4000) || null,
    images: [...new Set(images as string[])],
    coupDeCoeur: b.coup_de_coeur === true,
    disponible: b.disponible !== false,
    // un garage n'est jamais « meublé »
    meuble: categorie === 'habitation' && b.meuble !== false,
    vip: b.vip === true || b.vip === 'vip',
    standing: b.standing === true,
  };
}

biens.post('/api/biens', ...gerer, async (req, res) => {
  const d = lireBien(body(req));
  if (typeof d === 'string') { res.status(400).json({ error: d }); return; }
  const auteur = req.compte.nom ?? req.compte.pseudo;
  const cree = await prisma.$transaction(async tx => {
    const bien = await tx.bien.create({ data: { ...d, venduLe: d.vendu ? new Date() : null, auteur, compteId: req.compte.id } });
    await rattacherPhotosBien(tx, bien.id, d.images);
    return bien;
  });
  res.status(201).json({ id: cree.id });
});

biens.put('/api/biens/:id', ...gerer, async (req, res) => {
  const d = lireBien(body(req));
  if (typeof d === 'string') { res.status(400).json({ error: d }); return; }
  const id = intParam(req, 'id');
  const trouve = await prisma.$transaction(async tx => {
    // verrou sur la ligne : deux enregistrements simultanés de la même annonce ne mélangent pas leurs photos
    const [existant] = await tx.$queryRaw<{ id: number; vendu: boolean }[]>`SELECT id, vendu FROM biens WHERE id = ${id} FOR UPDATE`;
    if (!existant) return false;
    await tx.bien.update({
      where: { id },
      data: { ...d, venduLe: d.vendu && !existant.vendu ? new Date() : d.vendu ? undefined : null },
    });
    await rattacherPhotosBien(tx, id, d.images);
    return true;
  });
  if (!trouve) { res.status(404).json({ error: 'Bien introuvable.' }); return; }
  res.json({ ok: true });
});

biens.delete('/api/biens/:id', ...gerer, async (req, res) => {
  const id = intParam(req, 'id');
  const supprime = await prisma.$transaction(async tx => {
    const { count } = await tx.bien.deleteMany({ where: { id } });
    if (count) await tx.photo.updateMany({ where: { bienId: id }, data: { statut: 'a_supprimer', bienId: null } });
    return count > 0;
  });
  if (!supprime) { res.status(404).json({ error: 'Bien introuvable.' }); return; }
  res.json({ ok: true });
});

// photo envoyée depuis l'ordinateur (champ « image » du formulaire) : renvoie son adresse, à mettre dans l'annonce
biens.post('/api/biens/photo', ...gerer, ...recevoirImage, envoiPhoto('bien'));


