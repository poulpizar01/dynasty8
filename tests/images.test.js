// Validation réelle des fichiers image (src/images.js) : signature ET
// structure, jamais le seul type annoncé.
import test from "node:test";
import assert from "node:assert/strict";
import { analyserImage, decoderDataUrl } from "../src/images.js";
import { jpegReel, jpegMinimal, pngValide, webpValide, dataUrl } from "./aide-medias.js";

test("accepte un vrai JPEG, un PNG et un WebP valides, avec leurs dimensions", () => {
  const jpeg = analyserImage(jpegReel());
  assert.equal(jpeg.ok, true);
  assert.equal(jpeg.mime, "image/jpeg");
  assert.ok(jpeg.largeur > 0 && jpeg.hauteur > 0);

  assert.deepEqual(analyserImage(jpegMinimal(4, 3)), { ok: true, mime: "image/jpeg", extension: "jpg", largeur: 4, hauteur: 3 });
  assert.deepEqual(analyserImage(pngValide(2, 5)), { ok: true, mime: "image/png", extension: "png", largeur: 2, hauteur: 5 });
  assert.deepEqual(analyserImage(webpValide()), { ok: true, mime: "image/webp", extension: "webp", largeur: 1, hauteur: 1 });
});

test("refuse un fichier texte, un GIF, un SVG et un fichier vide", () => {
  assert.equal(analyserImage(new TextEncoder().encode("<html>pas une image</html>")).ok, false);
  assert.equal(analyserImage(new TextEncoder().encode("GIF89a\x01\x00\x01\x00")).ok, false);
  assert.equal(analyserImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).ok, false);
  assert.equal(analyserImage(new Uint8Array()).ok, false);
});

test("refuse les fichiers tronqués ou dont seule la signature est correcte", () => {
  const jpeg = jpegReel();
  assert.equal(analyserImage(jpeg.subarray(0, Math.floor(jpeg.length / 2))).ok, false, "JPEG coupé en deux");
  assert.equal(analyserImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])).ok, false, "signature JPEG seule");
  const sansEOI = jpegMinimal().subarray(0, jpegMinimal().length - 2);
  assert.equal(analyserImage(sansEOI).ok, false, "JPEG sans fin d'image");

  const png = pngValide();
  assert.equal(analyserImage(png.subarray(0, png.length - 12)).ok, false, "PNG sans IEND");
  assert.equal(analyserImage(png.subarray(0, 8)).ok, false, "signature PNG seule");

  const webp = webpValide();
  assert.equal(analyserImage(webp.subarray(0, 20)).ok, false, "WebP tronqué");
});

test("refuse les dimensions démesurées", () => {
  const r = analyserImage(jpegMinimal(20000, 20000));
  assert.equal(r.ok, false);
  assert.match(r.raison, /trop grande/);
});

test("décode les anciennes data URL et refuse celles mal formées", () => {
  const d = decoderDataUrl(dataUrl(jpegMinimal()));
  assert.equal(d.mimeDeclare, "image/jpeg");
  assert.equal(analyserImage(d.octets).ok, true);
  assert.equal(decoderDataUrl("data:image/jpeg;base64,@@@"), null);
  assert.equal(decoderDataUrl("data:text/html;base64,PGh0bWw+"), null);
  assert.equal(decoderDataUrl("https://exemple.fr/a.jpg"), null);
});
