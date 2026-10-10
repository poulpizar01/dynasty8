// SOCLE — adresses que le serveur ne doit jamais joindre : lui-même et le réseau interne (service de la machine, autre
// conteneur, métadonnées de l'hébergeur). Pour tout appel ou relais vers une adresse réglée depuis la gestion (le site
// n'appelle jamais une adresse donnée par un simple utilisateur). Le contrôle se fait au moment de la connexion
// (lookupSur, à passer à http(s).request ou à un agent) et pas seulement à la saisie : un nom qui changerait d'adresse
// entre les deux ne passe pas.
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns';

const interdites = new BlockList();
for (const [reseau, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) {
  interdites.addSubnet(reseau, bits, 'ipv4');
}
for (const [reseau, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32]] as const) {
  interdites.addSubnet(reseau, bits, 'ipv6');
}

// adresse IP (texte) interne ou illisible
export const adresseInterdite = (ip: string): boolean => {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];   // IPv4 écrite en IPv6
  if (v4) return interdites.check(v4, 'ipv4');
  const famille = isIP(ip);
  return famille === 0 || interdites.check(ip, famille === 6 ? 'ipv6' : 'ipv4');
};

// nom d'hôte d'une URL écrit comme une adresse IP interne (« localhost » compris) ; un nom ordinaire est contrôlé à la
// connexion par lookupSur
export const hoteInterdit = (hostname: string): boolean => {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || (isIP(h) !== 0 && adresseInterdite(h));
};

// résolution DNS qui refuse un nom pointant vers une adresse interne (erreur code ADRESSE_INTERDITE)
export const lookupSur: typeof lookup = ((nom: string, options: object, rappel: (e: Error | null, a?: unknown, f?: number) => void) => {
  lookup(nom, { ...options, all: true }, (err, adresses) => {
    if (err) return rappel(err);
    const liste = adresses as { address: string; family: number }[];
    if (!liste.length || liste.some(a => adresseInterdite(a.address))) return rappel(Object.assign(new Error('adresse interdite'), { code: 'ADRESSE_INTERDITE' }));
    if ((options as { all?: boolean }).all) rappel(null, liste);
    else rappel(null, liste[0].address, liste[0].family);
  });
}) as typeof lookup;
