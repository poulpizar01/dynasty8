// ENTREPRISE — biens immobiliers : valeurs contrôlées et forme envoyée au navigateur.
// Le catalogue de la vitrine (assets/js/catalogue.js) et la gestion lisent les champs en snake_case (forme historique des pages,
// gardée pour ne pas les réécrire).
import type { Bien } from '../generated/prisma/client.js';

export const CATEGORIES = ['habitation', 'garage'] as const;
export const SOUS_CATEGORIES_HABITATION = [
  'Eclipse Tower', 'Tinsel Tower', 'Villa', 'Del Perro Heights', 'Richards Majestic',
  'Weazel Plaza', 'San Andreas', 'Alta Street', 'Maison', 'Entrepôt', 'Flat',
  'Bureau', 'Headquarter', 'Caravane', 'Motel', 'Appartement', 'Duplex', 'Bar', 'Autre',
];
export const COHERENCES = ['Habitation', 'Garage', 'Cayo Perico', 'Roxwood'];

export const bienPublic = (b: Bien) => ({
  id: b.id,
  categorie: b.categorie,
  sous_categorie: b.sousCategorie,
  titre: b.titre,
  zone: b.zone,
  prix: b.prix,
  prix_location: b.prixLocation,
  dispo_vente: b.dispoVente,
  dispo_location: b.dispoLocation,
  // déduit : un bien seulement à louer est une « location », tout le reste une « vente »
  transaction_type: b.dispoLocation && !b.dispoVente ? 'location' : 'vente',
  places: b.places,
  description: b.description,
  images: b.images,
  coup_de_coeur: b.coupDeCoeur,
  disponible: b.disponible,
  vendu: b.vendu,
  meuble: b.meuble,
  coherence: b.coherence,
  coffre_kg: b.coffreKg,
  vip: b.vip,
  standing: b.standing,
});
