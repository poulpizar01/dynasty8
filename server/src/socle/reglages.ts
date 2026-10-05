// SOCLE — réglages modifiables depuis la gestion (table reglages), clé → texte. Gardés en mémoire (lus à chaque
// requête par certaines routes), rechargés après chaque modification. Le site y range ses propres clés : les préfixer
// par le nom de leur domaine (« stocks.seuil ») pour ne jamais croiser une clé du socle.
import { prisma } from './db.js';

let reglages = new Map<string, string>();

export async function chargerReglages(): Promise<void> {
  reglages = new Map((await prisma.reglage.findMany()).map(r => [r.cle, r.valeur]));
}

export const reglage = (cle: string): string | null => reglages.get(cle) ?? null;

// valeur null ou vide : réglage retiré
export async function definirReglage(cle: string, valeur: string | null): Promise<void> {
  if (valeur) await prisma.reglage.upsert({ where: { cle }, update: { valeur }, create: { cle, valeur } });
  else await prisma.reglage.deleteMany({ where: { cle } });
  await chargerReglages();
}
