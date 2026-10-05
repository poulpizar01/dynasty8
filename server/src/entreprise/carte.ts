// ENTREPRISE — WebMap du serveur, relayée sur son propre sous-domaine (WEBMAP_HOTE, ex. carte.dynasty8.fbfa.fr), servi
// à part du site par le socle (entreprise.hotes). L'adresse réelle de la carte (WEBMAP_ORIGIN) n'apparaît jamais dans
// ce que reçoit le navigateur : ce serveur va la chercher et la réécrit au passage.
// Isolée du site : le cookie de session, lié au seul domaine du site, n'est jamais envoyé au sous-domaine, et une
// requête de la carte vers l'API du site est refusée (lecture bloquée par le navigateur, écriture par le contrôle
// d'origine du socle). L'ancien site relayait la carte sous /api/carte/ de son propre domaine : son code tournait alors
// avec les droits du site.
import type { Request, RequestHandler, Response } from 'express';
import { adresse, config, fail } from '../socle/config.js';

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

export const relaisCarte: RequestHandler = async (req: Request, res: Response) => {
  res.set({ 'Content-Security-Policy': `frame-ancestors ${ancetres.join(' ')}`, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  const entetes = new Headers();
  for (const nom of ['accept', 'accept-language', 'content-type', 'range', 'if-none-match', 'if-modified-since']) {
    const v = req.get(nom);
    if (v) entetes.set(nom, v);
  }
  // cookies : ceux de la carte seulement — jamais celui de la session du site, même s'il arrivait ici par erreur
  const cookies = (req.get('cookie') ?? '').split(';').map(c => c.trim()).filter(c => c && !c.startsWith('site.sid='));
  if (cookies.length) entetes.set('cookie', cookies.join('; '));
  entetes.set('user-agent', req.get('user-agent') || 'Mozilla/5.0');
  let distante: globalThis.Response;
  try {
    const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : new Uint8Array(await lireCorps(req));
    distante = await fetch(origineCarte + req.originalUrl, { method: req.method, headers: entetes, body: corps, redirect: 'manual', signal: AbortSignal.timeout(DELAI_MS) });
  } catch (e) {
    console.error('[carte] injoignable :', (e as Error).message);
    res.status(502).type('text').send('La carte est momentanément indisponible.');
    return;
  }
  // redirection de la carte : suivie vers son équivalent sur le sous-domaine, jamais l'adresse réelle
  if ([301, 302, 303, 307, 308].includes(distante.status)) { res.redirect(distante.status, versSousDomaine(distante.headers.get('location') || '/')); return; }
  const type = distante.headers.get('content-type') || 'application/octet-stream';
  res.status(distante.status).type(type);
  for (const nom of ['cache-control', 'etag', 'last-modified', 'content-range', 'accept-ranges']) { const v = distante.headers.get(nom); if (v) res.set(nom, v); }
  // cookies de la carte : reposés sur le sous-domaine (sans Domain, qui viserait celui de la carte réelle)
  for (const c of distante.headers.getSetCookie()) res.append('Set-Cookie', c.split(';').filter(a => !/^\s*domain\s*=/i.test(a)).join(';'));
  if (/text\/html|javascript|text\/css|json/i.test(type)) {
    // l'adresse réelle de la carte n'apparaît pas dans ce que reçoit le navigateur
    res.send((await distante.text()).split(origineCarte).join(carte!.url));
    return;
  }
  res.send(Buffer.from(await distante.arrayBuffer()));
};
