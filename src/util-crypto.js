// ============================================================================
// Dynasty 8 — petits outils bas niveau partagés (encodage base64url)
// ----------------------------------------------------------------------------
// Extrait de src/index.js pour être réutilisable par d'autres modules (ex :
// src/stats-sheets.js, qui signe ses propres jetons JWT pour Google) sans
// dépendre d'index.js (qui, lui, importe ces autres modules — un import dans
// l'autre sens créerait une dépendance circulaire).
// ============================================================================

export const enc = new TextEncoder();

export function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
