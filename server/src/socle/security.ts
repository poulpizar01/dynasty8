// SOCLE — en-têtes de sécurité (helmet) et limites de requêtes (express-rate-limit).
import crypto from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { config, fail } from './config.js';
import { entreprise } from '../entreprise/index.js';

const https = config.baseUrl.startsWith('https');

// Jeton à usage unique (nonce) par réponse : seuls les <script> des pages du site, marqués par site.ts, s'exécutent.
// Un script injecté (contenu d'un utilisateur mal échappé, par exemple) n'a pas le jeton et reste inerte.
export const cspNonce: RequestHandler = (_req, res, next) => { res.locals.cspNonce = crypto.randomBytes(16).toString('base64'); next(); };

// origines supplémentaires déclarées par l'entreprise : https uniquement, origine seule (ni joker ni chemin)
const origines = (liste: string[] | undefined): string[] => (liste ?? []).map(o => {
  let u: URL | null = null;
  try { u = new URL(o); } catch { /* signalé ci-dessous */ }
  if (!u || u.protocol !== 'https:' || u.origin !== o.replace(/\/$/, '')) fail(`entreprise.csp : une origine https:// sans chemin est attendue, pas « ${o} »`);
  return u.origin;
});

// Politique de contenu : uniquement ce que les pages chargent réellement. Scripts, feuilles de style et polices
// viennent du site lui-même (aucun hébergeur tiers : un hôte de scripts autorisé en entier servirait de contournement
// au jeton) ; images : le site, les avatars Discord, le stockage d'images en prod. Scripts en ligne : seulement avec
// le jeton de la réponse ; styles en ligne autorisés (attributs style des pages, sans risque d'exécution de code).
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
      'style-src': ["'self'", "'unsafe-inline'"],
      'font-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https://cdn.discordapp.com', ...(config.storage.url ? [new URL(config.storage.url).origin] : []), ...origines(entreprise.csp?.img)],
      'connect-src': ["'self'", ...origines(entreprise.csp?.connect)],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': https ? [] : null,   // en dev (http://localhost), pas de passage forcé en https
    },
  },
  strictTransportSecurity: https ? { maxAge: 31536000 } : false,
  crossOriginEmbedderPolicy: false,
});

// Clé des limites : le compte connecté si possible (une adresse peut être partagée), sinon l'adresse IP.
export const parCompte = (req: Request) => (req.session?.compteId ? `c${req.session.compteId}` : ipKeyGenerator(req.ip ?? ''));
// limite réutilisable par les routes de l'entreprise : limiter(minutes, nombre, message, clé?, ignorer?)
export const limiter = (windowMin: number, limit: number, error: string, key?: (req: Request) => string, skip?: (req: Request) => boolean) => rateLimit({
  windowMs: windowMin * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  ...(key && { keyGenerator: key }),
  ...(skip && { skip }),
  message: { error },
});

export const limits = {
  // toute l'API : large, contre les scripts qui s'emballent
  api: limiter(1, 240, 'Trop de requêtes, réessaie dans une minute.', parCompte),
  // connexion Discord : par adresse
  auth: limiter(15, 30, 'Trop de tentatives de connexion, réessaie dans quelques minutes.'),
  // webhooks du bot : par adresse (le bot envoie par rafales ; ses nouvelles tentatives s'espacent d'elles-mêmes)
  webhooks: limiter(1, 120, 'Trop de webhooks reçus.'),
  // envoi de fichiers (images traitées en mémoire) : à poser sur chaque route d'envoi, avant multer
  upload: limiter(10, 20, 'Trop de fichiers envoyés d’un coup, réessaie dans quelques minutes.', parCompte),
};
