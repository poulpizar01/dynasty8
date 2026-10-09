// ENTREPRISE — WebMap du serveur, relayée sur son propre sous-domaine (WEBMAP_HOTE, ex. carte.dynasty8.fbfa.fr), servi
// à part du site par le socle (entreprise.hotes). L'adresse réelle de la carte (WEBMAP_ORIGIN) n'apparaît jamais dans
// ce que reçoit le navigateur : ce serveur va la chercher et la réécrit au passage.
// Isolée du site : le cookie de session, lié au seul domaine du site, n'est jamais envoyé au sous-domaine, et une
// requête de la carte vers l'API du site est refusée (lecture bloquée par le navigateur, écriture par le contrôle
// d'origine du socle). Jamais sous le domaine du site : le code de la carte y tournerait avec les droits du site.
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, RequestHandler, Response } from 'express';
import { adresse, config, fail } from '../socle/config.js';
import { limiter } from '../socle/limites.js';

const origine = adresse('WEBMAP_ORIGIN');   // vide : carte désactivée
const hote = (process.env.WEBMAP_HOTE || '').trim().toLowerCase();
if (!!origine !== !!hote) fail('WEBMAP_ORIGIN et WEBMAP_HOTE vont ensemble dans .env : remplir les deux, ou aucun');
if (hote && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(hote)) fail(`WEBMAP_HOTE dans .env : un nom de domaine (ex. carte.monsite.fr) : ${hote}`);
const origineCarte = origine ? new URL(origine).origin : '';

// adresse publique de la carte : même protocole et même port que le site (en dev : http://carte.localhost:3010)
const base = new URL(config.baseUrl);
export const carte = hote ? { hote, url: `${base.protocol}//${hote}${base.port ? `:${base.port}` : ''}` } : null;

// pages autorisées à afficher la carte dans une iframe : le site (vitrine), et l'ordinateur en jeu s'il est réglé
const ancetres = ["'self'", base.origin, ...(config.folkos.hote ? [config.folkos.hote, 'https://cfx-nui-external-iframe', 'nui://game', 'nui:', ...config.folkos.cadres] : [])];
const DELAI_MS = 20_000, CORPS_MAX = 1024 * 1024;

const lireCorps = (req: Request) => new Promise<Buffer>((ok, ko) => {
  const morceaux: Buffer[] = [];
  let total = 0;
  req.on('data', (m: Buffer) => { total += m.length; if (total > CORPS_MAX) { req.destroy(); ko(new Error('corps trop lourd')); } else morceaux.push(m); });
  req.on('end', () => ok(Buffer.concat(morceaux)));
  req.on('error', ko);
});

// adresse de la carte (absolue ou relative à sa racine) → la même sur le sous-domaine
const versSousDomaine = (lien: string) => {
  try { const u = new URL(lien, origineCarte); if (u.origin === origineCarte) return `${carte!.url}${u.pathname}${u.search}${u.hash}`; } catch { /* laissé tel quel */ }
  return lien;
};

// Ce relais passe avant tout le socle, limites de requêtes comprises : il a les siennes. Par adresse (une carte charge
// beaucoup de tuiles d'un coup), et un nombre de relais en cours borné pour tout le site, chacun gardant au plus un
// texte de TEXTE_MAX en mémoire (les autres fichiers passent en flux).
const limite = limiter(1, 1200, 'Trop de requêtes vers la carte, réessaie dans une minute.');
const EN_COURS_MAX = 20, TEXTE_MAX = 5 * 1024 * 1024;
let enCours = 0;

export const relaisCarte: RequestHandler = (req, res, next) => limite(req, res, async err => {
  if (err) { next(err); return; }
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.status(405).type('text').send('Méthode refusée.'); return; }
  if (enCours >= EN_COURS_MAX) { res.status(503).set('Retry-After', '5').type('text').send('La carte est très demandée, réessaie dans quelques secondes.'); return; }
  enCours++;
  try { await relayer(req, res); }
  catch (e) {
    console.error('[carte] relais interrompu :', (e as Error).message);
    if (!res.headersSent) res.status(502).type('text').send('La carte est momentanément indisponible.');
    else res.destroy();
  } finally { enCours--; }
});

async function relayer(req: Request, res: Response): Promise<void> {
  res.set({ 'Content-Security-Policy': `frame-ancestors ${ancetres.join(' ')}`, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  // Cible : un chemin de la carte, rien d'autre. Concaténée telle quelle, une cible de requête en forme absolue
  // (« GET pany://x/y ») rallongerait le nom d'hôte de la carte et ferait aller ce serveur vers un autre domaine.
  if (!req.originalUrl.startsWith('/') || req.originalUrl.startsWith('//')) { res.status(400).type('text').send('Adresse refusée.'); return; }
  const cible = new URL(req.originalUrl, origineCarte);
  if (cible.origin !== origineCarte) { res.status(400).type('text').send('Adresse refusée.'); return; }
  const entetes = new Headers();
  for (const nom of ['accept', 'accept-language', 'content-type', 'range', 'if-none-match', 'if-modified-since']) {
    const v = req.get(nom);
    if (v) entetes.set(nom, v);
  }
  // cookies : ceux de la carte seulement — jamais celui de la session du site, même s'il arrivait ici par erreur
  const cookies = (req.get('cookie') ?? '').split(';').map(c => c.trim()).filter(c => c && !c.startsWith('site.sid='));
  if (cookies.length) entetes.set('cookie', cookies.join('; '));
  entetes.set('user-agent', req.get('user-agent') || 'Mozilla/5.0');
  // délai global : connexion ET lecture complète de la réponse (une erreur de lecture remonte au catch de relaisCarte)
  const corps = req.method === 'POST' ? new Uint8Array(await lireCorps(req)) : undefined;
  const distante = await fetch(cible, { method: req.method, headers: entetes, body: corps, redirect: 'manual', signal: AbortSignal.timeout(DELAI_MS) });
  // redirection de la carte : suivie vers son équivalent sur le sous-domaine, jamais l'adresse réelle
  if ([301, 302, 303, 307, 308].includes(distante.status)) { res.redirect(distante.status, versSousDomaine(distante.headers.get('location') || '/')); return; }
  const type = distante.headers.get('content-type') || 'application/octet-stream';
  const texte = /text\/html|javascript|text\/css|json/i.test(type);
  // l'adresse réelle de la carte n'apparaît pas dans ce que reçoit le navigateur : un texte est lu en entier (borné)
  // pour la réécrire, avant d'envoyer quoi que ce soit
  const contenu = texte && distante.body ? (await lireBorne(distante.body, TEXTE_MAX)).toString('utf8').split(origineCarte).join(carte!.url) : null;
  res.status(distante.status).type(type);
  for (const nom of ['cache-control', 'etag', 'last-modified', 'content-range', 'accept-ranges', ...(texte ? [] : ['content-length'])]) { const v = distante.headers.get(nom); if (v) res.set(nom, v); }
  // cookies de la carte : reposés sur le sous-domaine (sans Domain, qui viserait celui de la carte réelle)
  for (const c of distante.headers.getSetCookie()) res.append('Set-Cookie', c.split(';').filter(a => !/^\s*domain\s*=/i.test(a)).join(';'));
  if (contenu !== null) { res.send(contenu); return; }
  if (!distante.body || req.method === 'HEAD') { res.end(); return; }
  // tuiles, images, polices : transmises en flux, jamais gardées entières en mémoire
  await pipeline(Readable.fromWeb(distante.body as import('node:stream/web').ReadableStream), res);
}

// lit un flux jusqu'au bout, refusé au-delà de max octets
async function lireBorne(flux: ReadableStream<Uint8Array>, max: number): Promise<Buffer> {
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for await (const m of flux as unknown as AsyncIterable<Uint8Array>) {
    total += m.length;
    if (total > max) throw new Error(`réponse de la carte trop lourde (plus de ${max} octets)`);
    morceaux.push(m);
  }
  return Buffer.concat(morceaux);
}
