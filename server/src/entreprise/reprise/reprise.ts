// ENTREPRISE — reprise des données de l'ancien site Dynasty 8 (base PostgreSQL de l'ancienne version, schéma
// ancien/schema.postgres.sql), à jouer UNE fois, sur une base neuve, avant toute connexion. Mode d'emploi pour
// l'opérateur : docs propres à Dynasty 8 (deploy/REPRISE.md).
//   ANCIENNE_DATABASE_URL=postgres://… node dist/entreprise/reprise/reprise.js --essai   (contrôle, rien n'est écrit)
//   ANCIENNE_DATABASE_URL=postgres://… node dist/entreprise/reprise/reprise.js           (reprise)
// En dev : npx tsx src/entreprise/reprise/reprise.ts. Les identifiants sont conservés (adresses des biens, liens entre
// tables) ; tout est écrit dans une seule transaction : une erreur n'en laisse rien. Seules les photos hébergées ailleurs
// que sur storage.fbfa.fr sont recopiées sur le stockage du site avant la transaction (jamais en --essai).
import pg from 'pg';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../socle/db.js';
import { chargerGrades } from '../../socle/droits.js';
import { normaliserPseudo, normaliserTexte } from '../texte.js';
import { enregistrerPhoto, telechargerImage } from '../photos.js';

const ESSAI = process.argv.includes('--essai');
const url = process.env.ANCIENNE_DATABASE_URL;
if (!url) { console.error('ANCIENNE_DATABASE_URL manquante : l’adresse de la base de l’ancien site.'); process.exit(1); }
const ancienne = new pg.Pool({ connectionString: url, max: 2 });
// lignes de l'ancienne base : colonnes connues par son schéma (ancien/schema.postgres.sql), lues sans typage strict
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>;
const lire = async <T = Ligne>(sql: string): Promise<T[]> => (await ancienne.query(sql)).rows as T[];
// une table absente de l'ancienne base (version plus ancienne du site) : rien à reprendre, sans erreur
const lireSiPresente = async <T = Ligne>(table: string, sql: string): Promise<T[]> =>
  (await lire<{ ok: boolean }>(`SELECT to_regclass('public.${table}') IS NOT NULL AS ok`))[0].ok ? lire<T>(sql) : [];

const rapport: string[] = [];
const note = (ligne: string) => { rapport.push(ligne); console.log(ligne); };

// ---------- conversions ----------
// horodatage de l'ancien site : texte « AAAA-MM-JJ HH:MM:SS » en UTC (parfois ISO 8601) ; vide → null
const instant = (v: unknown): Date | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? `${s.replace(' ', 'T')}Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const jour = (v: unknown): Date | null => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? new Date(`${String(v).trim()}T00:00:00Z`) : null);
const texte = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const entierOuNul = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const json = <T>(v: unknown, defaut: T): T => { try { return typeof v === 'string' ? JSON.parse(v) : (v as T) ?? defaut; } catch { return defaut; } };

// ---------- grades ----------
// Les 11 grades de l'ancien site, du sommet à la base, avec leurs droits d'alors : « direction » (comptes, annonces,
// statistiques, comptabilité), « commercial » (annonces), « membre » (son profil). Le Patron, le Co Patron et le
// Développeur web avaient en plus tous les droits RH et le réglage des grades. Les droits RH des autres grades viennent
// de leur matrice (rh_permissions). Aucun rôle Discord n'est lié : à faire dans la page Grades après la reprise.
const GRADES = [
  ['Développeur web', 'direction'], ['Patron', 'direction'], ['Co Patron', 'direction'], ['Manager', 'direction'],
  ['DRH', 'direction'], ['Secrétaire de Direction', 'direction'], ['Référent Immobilier', 'commercial'],
  ['Agent Expert', 'commercial'], ['Agent', 'commercial'], ['Agent Novice', 'commercial'], ['Stagiaire', 'membre'],
] as const;
const ADMINS_RH = ['Patron', 'Co Patron', 'Développeur web'];
// clés courtes et lisibles (20 caractères au plus), fixées une fois pour toutes
const CLES: Record<string, string> = { 'Développeur web': 'developpeur-web', 'Patron': 'patron', 'Co Patron': 'co-patron', 'Manager': 'manager', 'DRH': 'drh', 'Secrétaire de Direction': 'secretaire-direction', 'Référent Immobilier': 'referent-immobilier', 'Agent Expert': 'agent-expert', 'Agent': 'agent', 'Agent Novice': 'agent-novice', 'Stagiaire': 'stagiaire' };
const cleDe = (nom: string) => CLES[nom] ?? normaliserTexte(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
const cleGrade = new Map(GRADES.map(([nom]) => [normaliserTexte(nom), cleDe(nom)]));
const gradeCle = (nom: unknown) => cleGrade.get(normaliserTexte(nom)) ?? null;

async function main() {
  // base neuve uniquement : la reprise conserve les identifiants, elle ne fusionne pas
  const deja = await prisma.$queryRaw<{ n: bigint }[]>`SELECT (SELECT count(*) FROM comptes) + (SELECT count(*) FROM biens) + (SELECT count(*) FROM employes) + (SELECT count(*) FROM ventes) AS n`;
  if (Number(deja[0].n) > 0) throw new Error('La nouvelle base contient déjà des comptes, des biens, des employés ou des ventes : la reprise se joue sur une base neuve, avant toute connexion.');

  const [membres, biens, messages, presences, agenda, employes, rhPermissions, rhReglages, arrivees, ventes, doublons, baremes, taux, config, lignesTableur, etatTableur, archives, lignesArchives, imports, ecritures, baremeDot] = await Promise.all([
    lire('SELECT * FROM membres ORDER BY id'),
    lire('SELECT * FROM biens ORDER BY id'),
    lireSiPresente('messages_chat', 'SELECT * FROM messages_chat ORDER BY id'),
    lireSiPresente('presence', 'SELECT * FROM presence'),
    lireSiPresente('evenements_agenda', 'SELECT * FROM evenements_agenda ORDER BY id'),
    lireSiPresente('employes', 'SELECT * FROM employes ORDER BY id'),
    lireSiPresente('rh_permissions', 'SELECT * FROM rh_permissions'),
    lireSiPresente('rh_reglages', 'SELECT * FROM rh_reglages'),
    lireSiPresente('rh_arrivees_bot', 'SELECT * FROM rh_arrivees_bot ORDER BY id'),
    lireSiPresente('stats_logs_ventes', 'SELECT * FROM stats_logs_ventes ORDER BY id'),
    lireSiPresente('stats_ventes_doublons_marques', 'SELECT * FROM stats_ventes_doublons_marques ORDER BY id'),
    lireSiPresente('stats_baremes_primes', 'SELECT * FROM stats_baremes_primes ORDER BY type, seuil'),
    lireSiPresente('stats_taux_commission', 'SELECT * FROM stats_taux_commission'),
    lireSiPresente('stats_config', 'SELECT * FROM stats_config'),
    lireSiPresente('sync_sheet_agents', 'SELECT * FROM sync_sheet_agents ORDER BY id'),
    lireSiPresente('sync_sheet_etat', 'SELECT * FROM sync_sheet_etat'),
    lireSiPresente('tableur_archives', 'SELECT * FROM tableur_archives ORDER BY id'),
    lireSiPresente('tableur_archives_lignes', 'SELECT * FROM tableur_archives_lignes ORDER BY id'),
    lireSiPresente('comptabilite_imports', 'SELECT * FROM comptabilite_imports ORDER BY id'),
    lireSiPresente('compta_dot_ecritures', 'SELECT * FROM compta_dot_ecritures ORDER BY id'),
    lireSiPresente('dot_bareme_imposition', 'SELECT * FROM dot_bareme_imposition ORDER BY seuil_min'),
  ]);
  note(`Ancienne base : ${membres.length} membre(s), ${biens.length} bien(s), ${employes.length} fiche(s) RH, ${ventes.length} vente(s), ${messages.length} message(s), ${agenda.length} événement(s) d’agenda.`);

  // ---------- grades et droits ----------
  const rhParGrade = new Map<string, Set<string>>();
  for (const p of rhPermissions) {
    const g = normaliserTexte(p.grade);
    if (!rhParGrade.has(g)) rhParGrade.set(g, new Set());
    rhParGrade.get(g)!.add(`rh-${p.permission}`);
  }
  const grades = GRADES.map(([nom, niveau], position) => {
    const droits = new Set<string>(niveau === 'direction' ? ['comptes', 'biens', 'ventes', 'ventes-gerer', 'compta'] : niveau === 'commercial' ? ['biens'] : []);
    if (ADMINS_RH.includes(nom)) for (const d of ['grades', 'rh-voir', 'rh-creer', 'rh-modifier', 'rh-desactiver', 'rh-reactiver', 'rh-sensible', 'rh-parametrer']) droits.add(d);
    for (const d of rhParGrade.get(normaliserTexte(nom)) ?? []) droits.add(d);
    // toute permission RH suppose de consulter les fiches
    if ([...droits].some(d => d.startsWith('rh-'))) droits.add('rh-voir');
    return { cle: cleDe(nom), libelle: nom, position, permissions: [...droits] };
  });

  // ---------- comptes et profils ----------
  // Un compte sans ID Discord (pré-autorisé « invite » jamais connecté, ou héritage des codes d'accès) ne peut pas être
  // repris : la connexion se fait par Discord. Statut : validé et actif → validé ; en attente → en attente ; suspendu ou
  // désactivé → refusé (le compte reste, sans accès).
  const comptes: Prisma.CompteCreateManyInput[] = [], profils: Prisma.ProfilCreateManyInput[] = [];
  const compteDeMembre = new Map<number, number>();
  const discordVus = new Set<string>();
  for (const m of membres) {
    const discordId = texte(m.discord_id, 32);
    if (!/^\d{5,32}$/.test(discordId) || discordVus.has(discordId)) { note(`  Compte non repris (sans ID Discord) : ${texte(m.pseudo, 64)} [${m.statut}]`); continue; }
    discordVus.add(discordId);
    const avatar = /\/avatars\/\d+\/((?:a_)?[0-9a-f]{32})/.exec(String(m.discord_avatar ?? ''))?.[1] ?? null;
    const statut = m.statut === 'attente' ? 'attente' : m.statut === 'valide' && Number(m.actif) === 1 ? 'valide' : 'refuse';
    comptes.push({
      id: Number(m.id), discordId, pseudo: texte(m.discord_pseudo || m.pseudo, 64) || discordId, avatar, nom: texte(m.pseudo, 64) || null,
      gradeCle: gradeCle(m.grade), statut, creeLe: instant(m.cree_le) ?? new Date(), connecteLe: instant(m.derniere_visite),
      valideLe: statut === 'valide' ? instant(m.cree_le) ?? new Date() : null,
    });
    compteDeMembre.set(Number(m.id), Number(m.id));
    if (m.poste || m.specialite || m.bio || m.photo) {
      profils.push({ compteId: Number(m.id), poste: texte(m.poste, 80) || null, specialite: texte(m.specialite, 100) || null, bio: texte(m.bio, 1000) || null, photo: String(m.photo ?? '').trim() || null });
    }
  }
  const compte = (membreId: unknown) => (membreId == null ? null : compteDeMembre.get(Number(membreId)) ?? null);

  // ---------- photos : celles hébergées ailleurs sont recopiées sur le stockage du site ----------
  // storage.fbfa.fr : gardées telles quelles (le site les affiche, l'annonce peut les conserver). Ailleurs (lien collé,
  // image base64 d'avant le stockage) : téléchargées et traitées comme un envoi ; un lien mort est retiré et signalé.
  const recopies = new Map<string, string | null>();
  const aRecopier = (u: string) => !/^https:\/\/storage\.fbfa\.fr\//.test(u);
  async function recopier(u: string, usage: 'bien' | 'profil', ou: string): Promise<string | null> {
    if (!aRecopier(u)) return u;
    const cle = `${usage} ${u}`;   // une même image utilisée par une annonce et un profil : deux copies, une par usage
    if (recopies.has(cle)) return recopies.get(cle)!;
    let nouvelle: string | null = null;
    if (ESSAI) { note(`  Photo à recopier (${ou}) : ${u.slice(0, 80)}`); recopies.set(cle, u); return u; }
    try {
      const data = /^data:image\/[a-z+]+;base64,/i.exec(u);
      const octets = data ? Buffer.from(u.slice(data[0].length), 'base64') : await telechargerImage(u.replace(/^http:\/\//i, 'https://'));
      nouvelle = (await enregistrerPhoto(usage, null, octets)).url;
    } catch (e) { note(`  Photo perdue (${ou}) : ${u.slice(0, 80)} — ${(e as Error).message}`); }
    recopies.set(cle, nouvelle);
    return nouvelle;
  }
  const biensRepris: { b: Ligne; images: string[] }[] = [];
  for (const b of biens) {
    const images: string[] = [];
    for (const u of json<unknown[]>(b.images, []).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 10)) {
      const n = await recopier(u.trim(), 'bien', `bien ${b.id} « ${texte(b.titre, 40)} »`);
      if (n) images.push(n);
    }
    biensRepris.push({ b, images });
  }
  for (const p of profils) if (p.photo) p.photo = await recopier(p.photo, 'profil', `profil du compte ${p.compteId}`);

  // ---------- écriture, en une seule transaction ----------
  const parMembrePseudo = new Map(membres.map(m => [normaliserTexte(m.pseudo), compte(m.id)]));
  await prisma.$transaction(async tx => {
    for (const g of grades) await tx.grade.upsert({ where: { cle: g.cle }, create: g, update: { permissions: g.permissions, position: g.position } });
    await tx.compte.createMany({ data: comptes });
    await tx.profil.createMany({ data: profils });
    // photos recopiées : rattachées à leur profil (sinon le nettoyage les effacerait comme envois abandonnés)
    for (const p of profils) if (p.photo) await tx.photo.updateMany({ where: { url: p.photo, usage: 'profil' }, data: { statut: 'attachee', compteId: p.compteId } });

    await tx.bien.createMany({
      data: biensRepris.map(({ b, images }) => ({
        id: Number(b.id), categorie: b.categorie === 'garage' ? 'garage' : 'habitation', sousCategorie: texte(b.sous_categorie, 40) || null,
        titre: texte(b.titre, 120) || `Bien ${b.id}`, zone: texte(b.zone, 80) || null, prix: entierOuNul(b.prix) ?? 0, prixLocation: entierOuNul(b.prix_location),
        dispoVente: Number(b.dispo_vente) === 1, dispoLocation: Number(b.dispo_location) === 1, places: entierOuNul(b.places), description: texte(b.description, 4000) || null,
        images, coupDeCoeur: Number(b.coup_de_coeur) === 1, disponible: Number(b.disponible) === 1, vendu: Number(b.vendu) === 1, venduLe: instant(b.vendu_le),
        meuble: Number(b.meuble) === 1, coherence: texte(b.coherence, 20) || null, coffreKg: entierOuNul(b.coffre_kg), vip: b.vip === 'vip', standing: Number(b.standing) === 1,
        auteur: texte(b.auteur, 64) || null, compteId: parMembrePseudo.get(normaliserTexte(b.auteur)) ?? null,
        creeLe: instant(b.cree_le) ?? new Date(), majLe: instant(b.maj) ?? new Date(),
      })),
    });

    for (const { b, images } of biensRepris) await tx.photo.updateMany({ where: { url: { in: images }, usage: 'bien' }, data: { statut: 'attachee', bienId: Number(b.id) } });

    // messagerie et agenda : seulement entre comptes repris
    const msgs = messages.filter(m => compte(m.expediteur_id) && compte(m.destinataire_id));
    await tx.message.createMany({ data: msgs.map(m => ({ id: Number(m.id), expediteurId: compte(m.expediteur_id)!, destinataireId: compte(m.destinataire_id)!, type: m.type === 'clin_oeil' ? 'clin_oeil' : 'texte', contenu: texte(m.contenu, 1000), lu: Number(m.lu) === 1, envoyeLe: instant(m.envoye_le) ?? new Date() })) });
    await tx.statutMessagerie.createMany({ data: presences.filter(p => compte(p.membre_id) && ['disponible', 'absent', 'occupe', 'invisible'].includes(p.statut)).map(p => ({ compteId: compte(p.membre_id)!, statut: p.statut })) });
    const evts = agenda.filter(e => compte(e.membre_id) && jour(e.jour));
    await tx.evenementAgenda.createMany({ data: evts.map(e => ({ id: Number(e.id), compteId: compte(e.membre_id)!, titre: texte(e.titre, 80), jour: jour(e.jour)!, heureDebut: texte(e.heure_debut, 5), heureFin: texte(e.heure_fin, 5), notes: texte(e.notes, 500), creeLe: instant(e.cree_le) ?? new Date() })) });

    // ressources humaines
    await tx.employe.createMany({
      data: employes.map(e => ({
        id: Number(e.id), idEmploye: texte(e.id_employe, 40), idEmployeNormalise: texte(e.id_employe, 40).toLowerCase(), idProvisoire: Number(e.id_provisoire) === 1,
        prenom: texte(e.prenom, 60), nom: texte(e.nom, 60), telephone: texte(e.telephone, 30), rib: texte(e.rib, 60),
        discordId: /^\d{15,22}$/.test(texte(e.discord_id, 22)) ? texte(e.discord_id, 22) : null, discordPseudo: texte(e.discord_pseudo, 100),
        discordPseudoNormalise: e.discord_pseudo_normalise ? normaliserPseudo(e.discord_pseudo_normalise) : null,
        gradeCle: gradeCle(e.grade) ?? cleDe('Agent'), statut: e.statut === 'inactif' ? 'inactif' : 'actif',
        dateArrivee: jour(e.date_arrivee), dateDepart: jour(e.date_depart), creeLe: instant(e.cree_le) ?? new Date(), majLe: instant(e.maj) ?? new Date(),
      })),
    });
    const champsReglage: Record<string, string> = { bot_grade_arrivee: 'rh.grade_arrivee', question_identite: 'rh.question_identite', question_prenom: 'rh.question_prenom', question_nom: 'rh.question_nom', question_telephone: 'rh.question_telephone', question_rib: 'rh.question_rib', question_id_employe: 'rh.question_id_employe' };
    for (const r of rhReglages) {
      const cle = champsReglage[r.cle];
      const valeur = r.cle === 'bot_grade_arrivee' ? gradeCle(r.valeur) : texte(r.valeur, 200);
      if (cle && valeur) await tx.reglage.upsert({ where: { cle }, create: { cle, valeur }, update: { valeur } });
    }
    await tx.arriveeBot.createMany({
      data: arrivees.map(a => ({
        id: Number(a.id), ticketId: texte(a.ticket_id, 100), discordId: texte(a.discord_id, 30), nomRecu: texte(a.nom_recu, 130), resultat: texte(a.resultat, 10), motif: texte(a.motif, 400),
        employeId: entierOuNul(a.employe_id), reponses: a.charge ? ((json<unknown>(a.charge, null) ?? Prisma.DbNull) as Prisma.InputJsonValue) : Prisma.DbNull, accepteLe: texte(a.accepte_le, 40), recuLe: instant(a.recu_le) ?? new Date(),
      })),
    });

    // ventes, primes, rémunération
    for (let i = 0; i < ventes.length; i += 1000) {
      await tx.vente.createMany({
        data: ventes.slice(i, i + 1000).map(v => ({
          id: Number(v.id), numeroVente: texte(v.numero_vente, 200), dateVente: texte(v.date_vente, 10), identite: texte(v.identite, 200), formateur: texte(v.formateur, 200),
          identiteClient: texte(v.identite_client, 200), numeroTel: texte(v.numero_tel, 200), interieur: texte(v.interieur, 200), garage: texte(v.garage, 200),
          garageIndispo: texte(v.garage_indispo, 200), garageRefus: texte(v.garage_refus, 200), entrepriseIdentite: texte(v.entreprise_identite, 200), idEntreprise: texte(v.id_entreprise, 200),
          type: texte(v.type, 10), loc: entierOuNul(v.loc), achat: entierOuNul(v.achat) ?? 0, semaine: texte(v.semaine, 8), compteId: compte(v.cree_par),
          eventId: v.event_id ? texte(v.event_id, 200) : null, employeId: entierOuNul(v.employe_id), formateurEmployeId: entierOuNul(v.formateur_employe_id), creeLe: instant(v.cree_le) ?? new Date(),
        })),
      });
    }
    await tx.venteDoublon.createMany({ data: doublons.map(d => ({ id: Number(d.id), ligneDoublonId: Number(d.ligne_doublon_id), ligneOriginaleId: Number(d.ligne_originale_id), classification: texte(d.classification, 100), justification: String(d.justification ?? ''), marqueLe: instant(d.marque_le) ?? new Date(), marquePar: texte(d.marque_par, 100) })) });
    if (baremes.length) {
      await tx.baremePrime.deleteMany();   // les paliers de départ de la migration cèdent la place à ceux réglés sur l'ancien site
      await tx.baremePrime.createMany({ data: baremes.map(b => ({ type: b.type === 'location' ? 'location' : 'vente', seuil: Number(b.seuil), montant: Number(b.montant) })), skipDuplicates: true });
    }
    await tx.remunerationGrade.createMany({
      data: taux.filter(t => gradeCle(t.grade)).map(t => ({ gradeCle: gradeCle(t.grade)!, taux: Number(t.taux ?? 0.48), salaireFixe: entierOuNul(t.salaire_fixe), salaireActif: Number(t.salaire_actif) === 1, primeVenteActive: Number(t.prime_vente_active ?? 1) === 1, primeLocationActive: Number(t.prime_location_active ?? 1) === 1 })),
    });
    const formateur = config.find(c => c.cle === 'formateur_compte_dans_quota');
    if (formateur?.valeur === '1') await tx.reglage.upsert({ where: { cle: 'stats.formateur_dans_quota' }, create: { cle: 'stats.formateur_dans_quota', valeur: '1' }, update: { valeur: '1' } });

    // tableur de la Direction (la prochaine synchronisation le relira de toute façon) et ses archives
    await tx.ligneTableur.createMany({ data: lignesTableur.map(l => ({ ligneSheet: entierOuNul(l.ligne_sheet), nomSheet: texte(l.nom_sheet, 200), nomNormalise: texte(l.nom_normalise, 200), gradeSheet: texte(l.grade_sheet, 40), nbVentes: entierOuNul(l.nb_ventes) ?? 0, nbLocations: entierOuNul(l.nb_locations) ?? 0, employeId: entierOuNul(l.employe_id), compteId: compte(l.membre_id), majLe: instant(l.maj) ?? new Date() })) });
    const etat = etatTableur[0];
    if (etat) await tx.tableurEtat.create({ data: { id: 1, derniereSync: instant(etat.derniere_sync), statut: texte(etat.statut, 10), erreur: texte(etat.erreur, 500), nbLignes: entierOuNul(etat.nb_lignes) ?? 0, nbApparies: entierOuNul(etat.nb_apparies) ?? 0 } });
    await tx.tableurArchive.createMany({ data: archives.map(a => ({ id: Number(a.id), semaine: texte(a.semaine, 8), archiveLe: instant(a.archive_le) ?? new Date(), donneesDu: instant(a.donnees_du) ?? new Date(), enRetard: Number(a.en_retard) === 1 })) });
    await tx.tableurArchiveLigne.createMany({ data: lignesArchives.map(l => ({ id: Number(l.id), archiveId: Number(l.archive_id), ligneSheet: entierOuNul(l.ligne_sheet), nom: texte(l.nom, 200), grade: texte(l.grade, 40), ventes: entierOuNul(l.ventes) ?? 0, locations: entierOuNul(l.locations) ?? 0, primeVente: entierOuNul(l.prime_vente) ?? 0, primeLocations: entierOuNul(l.prime_locations) ?? 0, compte: texte(l.compte, 100) || null, employeId: entierOuNul(l.employe_id) })) });

    // comptabilité
    await tx.importCompta.createMany({ data: imports.map(i => ({ id: Number(i.id), type: texte(i.type, 20) || 'tablettes', colonnes: json(i.colonnes, []) as Prisma.InputJsonValue, lignes: json(i.lignes, []) as Prisma.InputJsonValue, compteId: compte(i.importe_par), importeLe: instant(i.importe_le) ?? new Date() })) });
    await tx.ecritureDot.createMany({ data: ecritures.filter(e => e.type === 'depense' || e.type === 'retrait').map(e => ({ id: Number(e.id), type: e.type, dateEcriture: texte(e.date_ecriture, 10), justificatif: texte(e.justificatif, 200) || '—', montant: entierOuNul(e.montant) ?? 0, compteId: compte(e.cree_par), creeLe: instant(e.cree_le) ?? new Date() })) });
    if (baremeDot.length) {
      await tx.baremeImposition.deleteMany();
      await tx.baremeImposition.createMany({ data: baremeDot.map(t => ({ seuilMin: Number(t.seuil_min), seuilMax: Number(t.seuil_max), taux: Number(t.taux), salaireMaxEmploye: Number(t.salaire_max_employe), salaireMaxPatron: Number(t.salaire_max_patron), primeMaxEmploye: Number(t.prime_max_employe), primeMaxPatron: Number(t.prime_max_patron) })) });
    }

    // identifiants conservés : les compteurs repartent après le plus grand repris
    for (const table of ['comptes', 'biens', 'messages', 'evenements_agenda', 'employes', 'rh_arrivees_bot', 'ventes', 'ventes_doublons', 'tableur_archives', 'tableur_archives_lignes', 'compta_imports', 'compta_dot_ecritures']) {
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT max(id) FROM "${table}"), 1), (SELECT max(id) IS NOT NULL FROM "${table}"))`);
    }
    note(`Repris : ${grades.length} grades, ${comptes.length} compte(s), ${profils.length} profil(s), ${biensRepris.length} bien(s), ${msgs.length} message(s), ${evts.length} événement(s), ${employes.length} fiche(s) RH, ${arrivees.length} candidature(s) du bot, ${ventes.length} vente(s), ${archives.length} semaine(s) archivée(s), ${imports.length} relevé(s), ${ecritures.length} écriture(s).`);
    if (ESSAI) throw new Error('ESSAI');   // contrôle seulement : la transaction est annulée
  }, { timeout: 10 * 60_000, maxWait: 60_000 });
}

await chargerGrades();
try {
  await main();
  note('Reprise terminée. Ensuite : le propriétaire du serveur Discord se connecte le premier, puis lie chaque grade à son rôle Discord (page Grades).');
} catch (e) {
  if ((e as Error).message === 'ESSAI') note('Essai terminé : rien n’a été écrit. Relancer sans --essai pour reprendre les données.');
  else { console.error(`Reprise interrompue, rien n'a été écrit : ${(e as Error).message}`); process.exitCode = 1; }
} finally {
  await ancienne.end();
  await prisma.$disconnect();
}
