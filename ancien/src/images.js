// ============================================================================
// Validation des fichiers image importés (JPEG, PNG, WebP)
// ----------------------------------------------------------------------------
// Le type annoncé par le navigateur (Content-Type, nom de fichier) ne prouve
// rien : on lit les octets eux-mêmes. Pour chaque format, on vérifie la
// signature, on parcourt la structure jusqu'aux dimensions et on contrôle
// que le fichier n'est pas tronqué. Aucune dépendance externe, aucun
// décodage complet de l'image.
// ============================================================================

export const TYPES_IMAGE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Au-delà, l'image serait inutilement lourde à afficher (le navigateur de
// l'espace agents réduit déjà les photos à 1280 px de large avant l'envoi).
export const COTE_MAX_PX = 10_000;
export const PIXELS_MAX = 40_000_000;

function lireU16BE(o, i) { return (o[i] << 8) | o[i + 1]; }
function lireU32BE(o, i) { return ((o[i] << 24) >>> 0) + (o[i + 1] << 16) + (o[i + 2] << 8) + o[i + 3]; }
function lireU32LE(o, i) { return o[i] + (o[i + 1] << 8) + (o[i + 2] << 16) + ((o[i + 3] << 24) >>> 0); }
function lireU24LE(o, i) { return o[i] + (o[i + 1] << 8) + (o[i + 2] << 16); }
function ascii(o, i, n) { return String.fromCharCode(...o.subarray(i, i + n)); }

function analyserJpeg(o) {
  const n = o.length;
  if (n < 4 || o[0] !== 0xff || o[1] !== 0xd8 || o[2] !== 0xff) return null;
  let i = 2;
  let largeur = 0;
  let hauteur = 0;
  let debutDonnees = -1;
  while (i < n) {
    if (o[i] !== 0xff) return { erreur: "structure JPEG invalide" };
    while (i < n && o[i] === 0xff) i++; // octets de remplissage
    if (i >= n) break;
    const marqueur = o[i++];
    if (marqueur === 0xd9) return { erreur: "image JPEG sans données" };
    if (marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) continue; // marqueurs sans longueur
    if (i + 2 > n) break;
    const longueur = lireU16BE(o, i);
    if (longueur < 2 || i + longueur > n) return { erreur: "fichier JPEG tronqué" };
    const estSOF = marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc;
    if (estSOF) {
      if (longueur < 8) return { erreur: "en-tête JPEG invalide" };
      hauteur = lireU16BE(o, i + 3);
      largeur = lireU16BE(o, i + 5);
    }
    if (marqueur === 0xda) {
      debutDonnees = i + longueur;
      break;
    }
    i += longueur;
  }
  if (debutDonnees < 0) return { erreur: "fichier JPEG tronqué" };
  if (!largeur || !hauteur) return { erreur: "dimensions JPEG absentes" };
  // Fin d'image (FF D9) obligatoire après les données compressées.
  let fin = -1;
  for (let k = n - 2; k >= debutDonnees; k--) {
    if (o[k] === 0xff && o[k + 1] === 0xd9) { fin = k; break; }
  }
  if (fin < 0) return { erreur: "fichier JPEG tronqué" };
  return { mime: "image/jpeg", largeur, hauteur };
}

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function analyserPng(o) {
  const n = o.length;
  if (n < 8 || !SIGNATURE_PNG.every((b, k) => o[k] === b)) return null;
  if (n < 33 || lireU32BE(o, 8) !== 13 || ascii(o, 12, 4) !== "IHDR") return { erreur: "en-tête PNG invalide" };
  const largeur = lireU32BE(o, 16);
  const hauteur = lireU32BE(o, 20);
  let i = 8;
  let idat = false;
  let iend = false;
  while (i + 12 <= n) {
    const longueur = lireU32BE(o, i);
    const type = ascii(o, i + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return { erreur: "structure PNG invalide" };
    if (i + 12 + longueur > n) return { erreur: "fichier PNG tronqué" };
    if (type === "IDAT") idat = true;
    i += 12 + longueur;
    if (type === "IEND") { iend = true; break; }
  }
  if (!iend || !idat) return { erreur: "fichier PNG tronqué" };
  if (!largeur || !hauteur) return { erreur: "dimensions PNG absentes" };
  return { mime: "image/png", largeur, hauteur };
}

function analyserWebp(o) {
  const n = o.length;
  if (n < 12 || ascii(o, 0, 4) !== "RIFF" || ascii(o, 8, 4) !== "WEBP") return null;
  const tailleRiff = lireU32LE(o, 4);
  if (tailleRiff + 8 > n || n < 30) return { erreur: "fichier WebP tronqué" };
  const bloc = ascii(o, 12, 4);
  const tailleBloc = lireU32LE(o, 16);
  if (20 + tailleBloc > tailleRiff + 8) return { erreur: "fichier WebP tronqué" };
  let largeur = 0;
  let hauteur = 0;
  if (bloc === "VP8X") {
    largeur = 1 + lireU24LE(o, 24);
    hauteur = 1 + lireU24LE(o, 27);
  } else if (bloc === "VP8 ") {
    if (o[23] !== 0x9d || o[24] !== 0x01 || o[25] !== 0x2a) return { erreur: "en-tête WebP invalide" };
    largeur = (o[26] | (o[27] << 8)) & 0x3fff;
    hauteur = (o[28] | (o[29] << 8)) & 0x3fff;
  } else if (bloc === "VP8L") {
    if (o[20] !== 0x2f) return { erreur: "en-tête WebP invalide" };
    largeur = 1 + (((o[22] & 0x3f) << 8) | o[21]);
    hauteur = 1 + (((o[24] & 0x0f) << 10) | (o[23] << 2) | ((o[22] & 0xc0) >> 6));
  } else {
    return { erreur: "format WebP non reconnu" };
  }
  if (!largeur || !hauteur) return { erreur: "dimensions WebP absentes" };
  return { mime: "image/webp", largeur, hauteur };
}

// Renvoie { ok: true, mime, extension, largeur, hauteur } ou
// { ok: false, raison } (raison affichable telle quelle, en français).
export function analyserImage(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets || []);
  if (!o.length) return { ok: false, raison: "Fichier vide." };
  const resultat = analyserJpeg(o) || analyserPng(o) || analyserWebp(o);
  if (!resultat) return { ok: false, raison: "Format non pris en charge : seules les images JPEG, PNG et WebP sont acceptées." };
  if (resultat.erreur) return { ok: false, raison: `Image invalide (${resultat.erreur}).` };
  const { mime, largeur, hauteur } = resultat;
  if (largeur > COTE_MAX_PX || hauteur > COTE_MAX_PX || largeur * hauteur > PIXELS_MAX) {
    return { ok: false, raison: `Image trop grande (${largeur} × ${hauteur} px).` };
  }
  return { ok: true, mime, extension: TYPES_IMAGE[mime], largeur, hauteur };
}

// Décode une ancienne image « data:image/…;base64,… » (photos enregistrées
// directement en base avant le stockage externe). Renvoie null si la chaîne
// n'est pas une data URL base64 d'image bien formée.
const RE_DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i;

export function decoderDataUrl(texte) {
  if (typeof texte !== "string") return null;
  const m = RE_DATA_URL.exec(texte);
  if (!m || m[2].length % 4 !== 0) return null;
  const octets = Buffer.from(m[2], "base64");
  if (!octets.length) return null;
  return { mimeDeclare: m[1].toLowerCase(), octets: new Uint8Array(octets.buffer, octets.byteOffset, octets.length) };
}

export function estDataUrlImage(texte) {
  return typeof texte === "string" && /^data:image\//i.test(texte);
}
