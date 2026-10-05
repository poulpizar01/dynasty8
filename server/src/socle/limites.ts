// SOCLE — limites de requêtes (express-rate-limit), à part de security.ts : ce fichier n'importe rien du code de
// l'entreprise, si bien qu'une route de l'entreprise peut l'importer (directement ou via socle/images.ts) sans créer de
// dépendance circulaire — security.ts, lui, lit entreprise.csp, et l'entreprise n'y serait pas encore chargée.
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

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
