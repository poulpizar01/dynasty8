// ============================================================================
// Dynasty 8 — pages HTML servies avec la configuration du serveur
// ----------------------------------------------------------------------------
// Les pages de public/ ne contiennent aucune adresse écrite en dur :
//   - %ORIGINE_SITE% (balises de partage og:url, og:image, twitter:image, qui
//     exigent une URL absolue : les robots de partage n'exécutent pas le JS)
//     est remplacé par SITE_URL_PUBLIQUE (.env) si elle est réglée, sinon par
//     l'adresse par laquelle le visiteur est arrivé ;
//   - une balise <meta name="d8-folkos"> donne aux scripts l'hôte du SDK de
//     l'ordinateur en jeu (FOLKOS_SDK_ORIGINE, .env) ; vide = SDK non chargé.
// Les fichiers sont lus une fois puis gardés en mémoire (lecture seule : rien
// n'est jamais écrit sur le disque).
// ============================================================================

import fs from "node:fs/promises";
import path from "node:path";

const RE_HOTE = /^[A-Za-z0-9.-]{1,255}(:\d{1,5})?$/;

// Origine https://hote[:port] d'une adresse réglée dans le .env, ou "" si
// l'adresse est absente ou invalide (jamais une adresse devinée).
export function origineReglee(valeur) {
  const brut = String(valeur || "").trim();
  if (!brut) return "";
  try {
    const u = new URL(brut);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

// Adresse du site pour cette requête : SITE_URL_PUBLIQUE si réglée, sinon le
// protocole et l'hôte de la requête — seulement s'ils sont valides (un
// en-tête Host forgé ne doit rien pouvoir glisser dans la page).
export function origineDuSite({ siteUrlPublique, protocole, hote }) {
  const reglee = origineReglee(siteUrlPublique);
  if (reglee) return reglee;
  const proto = protocole === "https" ? "https" : protocole === "http" ? "http" : "";
  if (!proto || !RE_HOTE.test(String(hote || ""))) return "";
  return `${proto}://${hote}`;
}

function echapperAttribut(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function preparerPage(html, { origineSite, folkosOrigine }) {
  const avecOrigine = html.split("%ORIGINE_SITE%").join(echapperAttribut(origineSite || ""));
  const meta = `<meta name="d8-folkos" content="${echapperAttribut(folkosOrigine || "")}">`;
  return avecOrigine.replace(/<head([^>]*)>/i, (balise) => `${balise}\n${meta}`);
}

// Chemin de la page demandée dans public/ ("/" = index.html), ou null si la
// requête ne vise pas une page HTML existante de public/.
const cache = new Map();
export async function lirePage(racinePublic, cheminUrl) {
  let relatif;
  try { relatif = decodeURIComponent(cheminUrl); } catch { return null; }
  if (relatif === "/" || relatif === "") relatif = "/index.html";
  if (!relatif.endsWith(".html")) return null;
  const absolu = path.resolve(racinePublic, "." + relatif);
  if (!absolu.startsWith(path.resolve(racinePublic) + path.sep)) return null;
  if (cache.has(absolu)) return cache.get(absolu);
  try {
    const contenu = await fs.readFile(absolu, "utf8");
    cache.set(absolu, contenu);
    return contenu;
  } catch {
    return null;
  }
}
