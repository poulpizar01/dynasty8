/* GESTION — ventes & statistiques : totaux des ventes reçues du bot,
   « Chiffres du tableur » (semaine en cours ou archive du dimanche) et synchronisation du tableur de la Direction.
   Serveur : server/src/entreprise/routes/stats.ts. */

const $st = id => document.getElementById(id);
const dateHeureStats = d => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');
// séparateur de milliers comme formaterPrix (layout.js), sans « HT » : les primes ne sont pas des prix du catalogue
function formaterArgentStats(valeur) {
  const n = Math.round(Number(valeur) || 0);
  return `${n < 0 ? '-' : ''}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`;
}

// totaux agence (toutes semaines) et semaine la plus récente ayant des données
async function chargerStatistiques() {
  gestion.message('zone-message-statistiques', '');
  try {
    const r = await socle.api('/api/stats/semaines');
    const avecDonnees = r.semaines.some(s => s.lignes > 0);
    $st('statistiques-vide').classList.toggle('cache', avecDonnees);
    $st('statistiques-resultat').classList.toggle('cache', !avecDonnees);
    if (!avecDonnees) return;
    $st('stats-total-ventes').textContent = r.totalVentes ?? 0;
    $st('stats-total-locations').textContent = r.totalLocations ?? 0;
    $st('stats-semaine-libelle').textContent = r.semaineRecente ? `Semaine ${r.semaineRecente}` : 'Aucune semaine avec des données pour le moment.';
    $st('stats-semaine-ventes').textContent = r.ventesSemaine ?? 0;
    $st('stats-semaine-locations').textContent = r.locationsSemaine ?? 0;
  } catch (e) {
    gestion.message('zone-message-statistiques', `Impossible de charger les statistiques : ${e.message}`);
  }
}

// « Chiffres du tableur » : semaine en cours (chiffres actuels) ou semaine archivée (figée le dimanche à 23:59)
async function chargerTableur(semaine) {
  gestion.message('zone-message-tableur', '');
  const etatLigne = $st('tableur-etat'), select = $st('select-semaine-tableur');
  const choisie = semaine === undefined ? select.value : semaine;
  try {
    const r = await socle.api(`/api/stats/tableur${choisie ? `?semaine=${encodeURIComponent(choisie)}` : ''}`);
    select.innerHTML = [`<option value="">Semaine en cours${r.semaineEnCours ? ` (${echapper(r.semaineEnCours)})` : ''}</option>`]
      .concat((r.archives || []).map(a => `<option value="${echapper(a.semaine)}">${echapper(a.semaine)} — archivée</option>`)).join('');
    select.value = choisie || '';
    ameliorerSelect(select);
    if (r.archive) {
      etatLigne.textContent = `Semaine ${r.archive.semaine} — archivée le ${dateHeureStats(r.archive.archiveLe)} (chiffres lus le ${dateHeureStats(r.archive.donneesDu)})`
        + (r.archive.enRetard ? ', après coup : le serveur était arrêté dimanche à 23:59.' : '.');
    } else {
      etatLigne.textContent = !r.configure ? 'Synchronisation en attente : réglez le lien du Google Sheets dans Paramètres.'
        : r.derniereSync ? `Dernière lecture du tableur : ${dateHeureStats(r.derniereSync)}${r.statut === 'erreur' ? ' (échec — voir la synchronisation plus bas)' : ''}.`
          : 'Tableur pas encore lu.';
    }
    $st('tableur-vide').classList.toggle('cache', r.lignes.length > 0);
    $st('tableur-resultat').classList.toggle('cache', !r.lignes.length);
    $st('corps-table-tableur').innerHTML = r.lignes.map(l => {
      const fiche = !l.employe
        ? '<span class="puce puce-or" title="Aucune fiche RH ne porte ce prénom et ce nom : à rattacher dans Ressources humaines.">sans fiche RH</span>'
        : `${echapper(l.employe.idEmploye)}${l.employe.statut === 'inactif' ? ' <span class="puce puce-masquee">Inactif</span>' : ''}`;
      return `<tr>
        <td><strong>${echapper(l.nom)}</strong></td>
        <td>${echapper(l.grade || '—')}</td>
        <td style="text-align:right;">${l.ventes}</td>
        <td style="text-align:right;">${l.locations}</td>
        <td>${formaterArgentStats(l.primeVente)}</td>
        <td>${formaterArgentStats(l.primeLocations)}</td>
        <td><strong>${formaterArgentStats(l.primeTotale)}</strong></td>
        <td>${fiche}</td>
        <td>${l.compte ? echapper(l.compte) : '<span class="champ-aide">— aucun —</span>'}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    etatLigne.textContent = '';
    gestion.message('zone-message-tableur', `Impossible de charger les chiffres du tableur : ${e.message}`);
  }
}
$st('select-semaine-tableur').addEventListener('change', e => chargerTableur(e.target.value));

// synchronisation : état, lignes lues, bouton (permission « ventes-gerer »)
async function chargerSynchro() {
  const corps = $st('corps-table-sync-sheet'), etatLigne = $st('sync-sheet-etat');
  try {
    const r = await socle.api('/api/tableur/etat');
    const bouton = $st('bouton-synchroniser-sheet');
    bouton.disabled = !r.configure;
    bouton.title = r.configure ? '' : 'Réglez d’abord le lien du Google Sheets dans Paramètres';
    const e = r.etat;
    etatLigne.textContent = !r.configure ? 'Synchronisation en attente : réglez le lien du Google Sheets dans Paramètres.'
      : !e || e.statut === 'desactive' ? 'Pas encore synchronisé.'
        : e.statut === 'erreur' ? `Dernière tentative en échec (${dateHeureStats(e.derniereSync)}) : ${e.erreur}`
          // lecture réussie sans aucun agent : presque toujours le mauvais onglet du classeur
          : !e.nbLignes ? `Dernière synchro : ${dateHeureStats(e.derniereSync)} — le classeur a été lu, mais aucune ligne d’agent n’y a été trouvée. Le lien réglé pointe sans doute sur le mauvais onglet : ouvrez l’onglet du récapitulatif des ventes dans Google Sheets, copiez l’adresse de la barre du navigateur (elle se termine par « gid=… ») et collez-la dans Paramètres.`
          : `Dernière synchro : ${dateHeureStats(e.derniereSync)} — ${e.nbLignes} ligne(s) lue(s), ${e.nbApparies} reliée(s) à un compte du site.`;
    corps.innerHTML = r.lignes.length ? r.lignes.map(l => `<tr>
        <td>${echapper(l.nom)}</td><td>${echapper(l.grade || '—')}</td>
        <td style="text-align:right;">${l.ventes}</td><td style="text-align:right;">${l.locations}</td>
        <td>${l.fiche ? '<span class="puce puce-ok">Oui</span>' : '<span class="puce puce-or">À rattacher</span>'}</td>
        <td>${l.compte ? echapper(l.compte) : '<span class="champ-aide">— aucun compte relié —</span>'}</td>
      </tr>`).join('')
      : `<tr><td colspan="6">${r.configure ? 'Aucune ligne lue pour le moment.' : 'Aucune ligne : le lien du Google Sheets n’est pas encore réglé dans Paramètres.'}</td></tr>`;
  } catch (err) {
    corps.innerHTML = `<tr><td colspan="6">Erreur de chargement : ${echapper(err.message)}</td></tr>`;
  }
}

$st('bouton-synchroniser-sheet').addEventListener('click', async e => {
  const bouton = e.currentTarget, texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Synchronisation…';
  try {
    const r = await socle.api('/api/tableur/synchroniser', { method: 'POST' });
    const sansFiche = r.etat?.sansFicheRh || 0;
    gestion.message('zone-message-sync-sheet', `Synchronisation terminée ✓${sansFiche ? ` — ${sansFiche} ligne(s) sans fiche RH : voir Ressources humaines → À rattacher.` : ''}`, 'succes');
    chargerSynchro();
    chargerTableur('');
  } catch (err) {
    gestion.message('zone-message-sync-sheet', `Échec de la synchronisation : ${err.message}`);
  } finally {
    bouton.disabled = false;
    bouton.textContent = texte;
  }
});

gestion.coque('statistiques').then(moi => {
  $st('bouton-synchroniser-sheet').classList.toggle('cache', !socle.peut(moi, 'ventes-gerer'));
  chargerStatistiques();
  chargerTableur('');
  chargerSynchro();
});
