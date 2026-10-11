/* GESTION — ventes & statistiques : la semaine lue dans le Google Sheets de la Direction (en cours, ou archivée le
   dimanche), ses chiffres clés et son classement, les totaux des ventes reçues du bot, et la lecture du Google Sheets.
   Serveur : server/src/entreprise/routes/stats.ts. */

const $st = id => document.getElementById(id);
const dateHeureStats = d => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');
// séparateur de milliers comme formaterPrix (layout.js), sans « HT » : les primes ne sont pas des prix du catalogue
function formaterArgentStats(valeur) {
  const n = Math.round(Number(valeur) || 0);
  return `${n < 0 ? '-' : ''}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`;
}
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const carteStat = (libelle, valeur, precision, accent) => `<div class="compta-chiffre${accent ? ' accent' : ''}">
  <span class="compta-chiffre-libelle">${libelle}</span><strong>${valeur}</strong>${precision ? `<small>${precision}</small>` : ''}</div>`;

// totaux des ventes reçues du bot (toutes semaines) : une ligne discrète, ce n'est pas la source des primes
async function chargerStatistiques() {
  try {
    const r = await socle.api('/api/stats/semaines');
    $st('stats-bot').textContent = r.semaines.some(s => s.lignes > 0)
      ? `Reçu du bot de ventes depuis le début : ${pluriel(r.totalVentes ?? 0, 'vente', 'ventes')}, ${pluriel(r.totalLocations ?? 0, 'location', 'locations')}.`
      : 'Aucune vente reçue du bot de ventes pour le moment.';
  } catch { $st('stats-bot').textContent = ''; }
}

// la semaine : en cours (chiffres actuels) ou archivée (figée le dimanche à 23:59)
async function chargerTableur(semaine) {
  gestion.message('zone-message-tableur', '');
  const etatLigne = $st('tableur-etat'), select = $st('select-semaine-tableur');
  const choisie = semaine === undefined ? select.value : semaine;
  try {
    const r = await socle.api(`/api/stats/tableur${choisie ? `?semaine=${encodeURIComponent(choisie)}` : ''}`);
    select.innerHTML = [`<option value="">${r.semaineEnCours ? `${echapper(r.semaineEnCours)} (en cours)` : 'En cours'}</option>`]
      .concat((r.archives || []).map(a => `<option value="${echapper(a.semaine)}">${echapper(a.semaine)} (archivée)</option>`)).join('');
    select.value = choisie || '';
    ameliorerSelect(select);
    if (r.archive) {
      etatLigne.textContent = `Semaine archivée le ${dateHeureStats(r.archive.archiveLe)}, chiffres lus le ${dateHeureStats(r.archive.donneesDu)}`
        + (r.archive.enRetard ? ' (après coup : le site était arrêté dimanche à 23:59).' : '.');
    } else {
      etatLigne.textContent = !r.configure ? 'Le Google Sheets de la Direction n’est pas encore réglé.'
        : r.derniereSync ? `Chiffres lus le ${dateHeureStats(r.derniereSync)}${r.statut === 'erreur' ? ' ; la dernière lecture a échoué, voir plus bas.' : '.'}`
          : 'Le Google Sheets n’a pas encore été lu.';
      if (!r.configure) lienReglage(etatLigne);
    }

    const lignes = [...r.lignes].sort((a, b) => (b.ventes + b.locations) - (a.ventes + a.locations) || b.ventes - a.ventes);
    const total = k => lignes.reduce((t, l) => t + (Number(l[k]) || 0), 0);
    $st('stats-chiffres').innerHTML = lignes.length ? [
      carteStat('Ventes', String(total('ventes')), pluriel(lignes.length, 'agent', 'agents')),
      carteStat('Locations', String(total('locations')), ''),
      carteStat('Primes à verser', formaterArgentStats(total('primeTotale')), `ventes ${formaterArgentStats(total('primeVente'))} · locations ${formaterArgentStats(total('primeLocations'))}`, true),
    ].join('') : '';

    $st('tableur-vide').classList.toggle('cache', lignes.length > 0);
    $st('tableur-resultat').classList.toggle('cache', !lignes.length);
    $st('tableur-vide-texte').textContent = r.configure ? 'Aucune ligne lue pour cette semaine.' : 'Aucune ligne : le Google Sheets de la Direction n’est pas encore réglé.';
    $st('tableur-resultat').innerHTML = lignes.length ? `
      <div class="comptes-entete stats-entete" aria-hidden="true"><span>#</span><span>Agent</span><span>Ventes</span><span>Locations</span><span>Prime</span></div>
      ${lignes.map((l, i) => {
        const alertes = [
          !l.employe ? '<span class="puce puce-or" title="Aucune fiche RH ne porte ce prénom et ce nom : à rattacher dans Ressources humaines.">Sans fiche RH</span>' : '',
          l.employe?.statut === 'inactif' ? '<span class="puce puce-masquee">Ancien employé</span>' : '',
          l.employe && !l.compte ? '<span class="puce puce-masquee" title="Aucun compte du site n’a le même ID Discord que la fiche RH.">Sans compte</span>' : '',
        ].join('');
        const detailPrime = l.primeTotale ? `ventes ${formaterArgentStats(l.primeVente)} · locations ${formaterArgentStats(l.primeLocations)}` : '';
        return `<div class="comptes-ligne stats-ligne">
          <span class="stats-rang${i < 3 && (l.ventes + l.locations) > 0 ? ' podium' : ''}">${i + 1}</span>
          <span class="stats-agent"><span class="comptes-nom"><strong>${echapper(l.nom)}</strong>${alertes}</span><span class="comptes-pseudo">${echapper(l.grade || 'Sans grade')}</span></span>
          <span class="stats-nombre stats-ventes" data-libelle="Ventes">${l.ventes}</span>
          <span class="stats-nombre stats-locations" data-libelle="Locations">${l.locations}</span>
          <span class="stats-prime" data-libelle="Prime"><strong>${formaterArgentStats(l.primeTotale)}</strong>${detailPrime ? `<small>${detailPrime}</small>` : ''}</span>
        </div>`;
      }).join('')}` : '';
  } catch (e) {
    etatLigne.textContent = '';
    gestion.message('zone-message-tableur', `Impossible de charger les chiffres de la semaine : ${e.message}`);
  }
}
$st('select-semaine-tableur').addEventListener('change', e => chargerTableur(e.target.value));

// lecture du Google Sheets : état et bouton (permission « ventes-gerer »)
async function chargerSynchro() {
  const etatLigne = $st('sync-sheet-etat');
  try {
    const r = await socle.api('/api/tableur/etat');
    const bouton = $st('bouton-synchroniser-sheet');
    bouton.disabled = !r.configure;
    const e = r.etat;
    etatLigne.classList.toggle('stats-erreur', e?.statut === 'erreur');
    etatLigne.textContent = !r.configure ? 'Pas encore réglé : il faut le lien du Google Sheets.'
      : !e || e.statut === 'desactive' ? 'Pas encore lu.'
        : e.statut === 'erreur' ? `La dernière lecture a échoué (${dateHeureStats(e.derniereSync)}) : ${e.erreur}`
          // lecture réussie sans aucun agent : presque toujours le mauvais onglet du classeur
          : !e.nbLignes ? `Lu le ${dateHeureStats(e.derniereSync)}, mais aucune ligne d’agent trouvée : le lien vise sans doute le mauvais onglet. Ouvrez l’onglet du récapitulatif dans Google Sheets, copiez l’adresse (elle finit par « gid=… ») et collez-la dans Paramètres.`
          : `Lu le ${dateHeureStats(e.derniereSync)} : ${pluriel(e.nbLignes, 'ligne', 'lignes')}, ${pluriel(e.nbApparies, 'reliée', 'reliées')} à un compte du site.`;
    if (!r.configure) lienReglage(etatLigne);
  } catch (err) {
    etatLigne.textContent = `État indisponible : ${err.message}`;
  }
}

$st('bouton-synchroniser-sheet').addEventListener('click', async e => {
  const bouton = e.currentTarget, texte = bouton.innerHTML;   // icône comprise
  bouton.style.width = `${bouton.offsetWidth}px`;   // « Lecture… » est plus court : le bouton ne bouge pas
  bouton.disabled = true;
  bouton.textContent = 'Lecture…';
  try {
    const r = await socle.api('/api/tableur/synchroniser', { method: 'POST' });
    const sansFiche = r.etat?.sansFicheRh || 0;
    gestion.notifier(`Google Sheets relu ✓${sansFiche ? ` ${pluriel(sansFiche, 'ligne', 'lignes')} sans fiche RH : voir Ressources humaines.` : ''}`);
    chargerSynchro();
    chargerTableur('');
  } catch (err) {
    gestion.notifier(`Lecture impossible : ${err.message}`, 'erreur');
  } finally {
    bouton.disabled = false;
    bouton.innerHTML = texte;
    bouton.style.width = '';
  }
});

// le lien du Google Sheets n’est pas réglé : lien direct vers Paramètres, pour qui peut le régler
let PEUT_PARAMETRER = false;
function lienReglage(el) {
  if (!PEUT_PARAMETRER) return;
  const lien = document.createElement('a');
  lien.href = 'parametres.html';
  lien.textContent = 'Le régler dans Paramètres';
  el.append(' ', lien);
}
gestion.coque('statistiques').then(moi => {
  PEUT_PARAMETRER = socle.peut(moi, 'parametres');
  $st('bouton-synchroniser-sheet').classList.toggle('cache', !socle.peut(moi, 'ventes-gerer'));
  chargerStatistiques();
  chargerTableur('');
  chargerSynchro();
});
