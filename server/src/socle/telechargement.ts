// SOCLE — téléchargement par le serveur d'un fichier dont un utilisateur a donné l'adresse (image collée par lien :
// indispensable dans l'ordinateur en jeu, qui n'a pas de sélecteur de fichiers). Utilisé par recevoirImageParLien
// (images.ts). Le serveur ne va jamais vers lui-même ni vers le réseau interne : sinon un lien bien choisi lui ferait
// lire une page qu'il est seul à pouvoir joindre (service de la machine, autre conteneur). L'adresse IP est contrôlée
// au moment même de la connexion (lookup ci-dessous), pas seulement avant : un nom qui changerait d'adresse entre les
// deux ne passe pas. https uniquement, port par défaut, taille et durée bornées, redirections contrôlées de même.
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns';

// refus à montrer tel quel à l'utilisateur
export class LienRefuse extends Error {}

const interdites = new BlockList();
for (const [reseau, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) {
  interdites.addSubnet(reseau, bits, 'ipv4');
}
for (const [reseau, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) {
  interdites.addSubnet(reseau, bits, 'ipv6');
}
export const adresseInterdite = (ip: string): boolean => {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];   // IPv4 écrite en IPv6
  if (v4) return interdites.check(v4, 'ipv4');
  const famille = isIP(ip);
  return famille === 0 || interdites.check(ip, famille === 6 ? 'ipv6' : 'ipv4');
};

const lookupSur: typeof lookup = ((nom: string, options: object, rappel: (e: Error | null, a?: unknown, f?: number) => void) => {
  lookup(nom, { ...options, all: true }, (err, adresses) => {
    if (err) return rappel(err);
    const liste = adresses as { address: string; family: number }[];
    if (!liste.length || liste.some(a => adresseInterdite(a.address))) return rappel(Object.assign(new Error('adresse interdite'), { code: 'ADRESSE_INTERDITE' }));
    if ((options as { all?: boolean }).all) rappel(null, liste);
    else rappel(null, liste[0].address, liste[0].family);
  });
}) as typeof lookup;

function adresseLien(brut: string): URL {
  let u: URL;
  try { u = new URL(brut); } catch { throw new LienRefuse('Lien illisible.'); }
  if (u.protocol !== 'https:') throw new LienRefuse('Le lien doit commencer par https://.');
  if (u.port && u.port !== '443') throw new LienRefuse('Lien refusé (port inhabituel).');
  if (u.username || u.password) throw new LienRefuse('Lien refusé (identifiants dans l’adresse).');
  // une adresse IP écrite telle quelle est contrôlée ici (le lookup ne serait pas appelé)
  const hote = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hote) && adresseInterdite(hote)) throw new LienRefuse('Lien refusé (adresse interne).');
  return u;
}

type Options = { octetsMax: number; delaiMs: number; redirections: number; types: RegExp; refusType: string };

function obtenir(u: URL, o: Options): Promise<{ statut: number; location?: string; type: string; corps: Buffer }> {
  return new Promise((ok, ko) => {
    const trop = () => new LienRefuse(`Fichier trop lourd (${Math.round(o.octetsMax / 1024 / 1024)} Mo max).`);
    const lent = () => new LienRefuse(`Le site du lien ne répond pas (${o.delaiMs / 1000} s).`);
    const req = https.get(u, { lookup: lookupSur, timeout: o.delaiMs, headers: { 'User-Agent': 'roxwood-site/1.0' } }, res => {
      const statut = res.statusCode ?? 0;
      if (statut >= 300 && statut < 400) { res.resume(); ok({ statut, location: res.headers.location, type: '', corps: Buffer.alloc(0) }); return; }
      if (Number(res.headers['content-length'] || 0) > o.octetsMax) { res.destroy(); ko(trop()); return; }
      const morceaux: Buffer[] = [];
      let total = 0;
      res.on('data', (m: Buffer) => {
        total += m.length;
        if (total > o.octetsMax) { res.destroy(); ko(trop()); return; }
        morceaux.push(m);
      });
      res.on('end', () => ok({ statut, type: String(res.headers['content-type'] || ''), corps: Buffer.concat(morceaux) }));
      res.on('error', ko);
    });
    // délai global (connexion + lecture complète), pas seulement d'inactivité
    const minuteur = setTimeout(() => req.destroy(lent()), o.delaiMs);
    req.on('close', () => clearTimeout(minuteur));
    req.on('timeout', () => req.destroy(lent()));
    req.on('error', e => ko((e as { code?: string }).code === 'ADRESSE_INTERDITE' ? new LienRefuse('Lien refusé (adresse interne).')
      : e instanceof LienRefuse ? e : new LienRefuse('Fichier injoignable à cette adresse.')));
  });
}

// Télécharge le fichier ; lève LienRefuse (message à montrer) pour tout refus ou échec. `types` : types de contenu
// annoncés acceptés (le contenu réel reste à contrôler par l'appelant : un serveur peut annoncer n'importe quoi).
export async function telecharger(brut: string, options: Partial<Options> = {}): Promise<Buffer> {
  const o: Options = { octetsMax: 15 * 1024 * 1024, delaiMs: 15_000, redirections: 3, types: /./, refusType: 'Ce lien ne mène pas au bon type de fichier.', ...options };
  let u = adresseLien(brut.trim());
  for (let i = 0; ; i++) {
    const r = await obtenir(u, o);
    if (r.statut >= 300 && r.statut < 400) {
      if (!r.location || i >= o.redirections) throw new LienRefuse('Trop de redirections.');
      u = adresseLien(new URL(r.location, u).toString());
      continue;
    }
    if (r.statut !== 200) throw new LienRefuse(`Rien à cette adresse (réponse ${r.statut}).`);
    if (r.type && !o.types.test(r.type)) throw new LienRefuse(o.refusType);
    return r.corps;
  }
}
