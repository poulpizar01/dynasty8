/* GESTION — ressources humaines : fiches employés, source de vérité de l'identité, du grade et du statut de chacun.
   Les droits viennent du serveur et y sont revérifiés à chaque appel
   (server/src/entreprise/routes/rh.ts) : l'interface ne fait que masquer ce qui serait de toute façon refusé.
   Les droits RH se règlent par grade dans la page Grades (permissions « RH : … »). */

let CACHE_EMPLOYES = [];
let GRADES_EMPLOYES = [];   // [{ cle, libelle }], dans l'ordre de la page Grades
let GRADES_ATTRIBUABLES = [];   // clés des grades qu'on peut donner (sous le sien) : les autres restent grisés
let DROITS_RH = new Set();
let FICHE_OUVERTE = null;   // id de la fiche en cours d'édition ; null = création

const aDroitRh = droit => DROITS_RH.has(droit);
const $rh = id => document.getElementById(id);
const libelleGrade = cle => GRADES_EMPLOYES.find(g => g.cle === cle)?.libelle || cle;
const dateCourte = iso => { if (!iso) return '—'; const [a, m, j] = String(iso).split('-'); return `${j}/${m}/${a}`; };
const dateHeure = d => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }) : '—');

async function chargerRh() {
  gestion.message('zone-message-rh', '');
  try {
    const r = await socle.api('/api/rh/employes');
    CACHE_EMPLOYES = r.employes || [];
    GRADES_EMPLOYES = r.grades || [];
    GRADES_ATTRIBUABLES = r.attribuables || [];
    DROITS_RH = new Set(r.droits || []);
    const options = GRADES_EMPLOYES.map(g => `<option value="${echapper(g.cle)}">${echapper(g.libelle)}</option>`).join('');
    $rh('employe-grade').innerHTML = options;
    const filtre = $rh('filtre-rh-grade'), valeur = filtre.value;
    filtre.innerHTML = `<option value="">Tous les grades</option>${options}`;
    filtre.value = valeur;
    $rh('bouton-nouvel-employe').classList.toggle('cache', !aDroitRh('creer'));
    $rh('rh-nb-actifs').textContent = r.effectif.actifs;
    $rh('rh-nb-inactifs').textContent = r.effectif.inactifs;
    $rh('rh-repartition').textContent = r.effectif.parGrade.length ? `Effectif actif par grade : ${r.effectif.parGrade.map(g => `${g.grade} ${g.nombre}`).join(' · ')}` : '';
    ameliorerSelect(filtre);
    ameliorerSelect($rh('filtre-rh-statut'));
    ameliorerSelect($rh('tri-rh'));
    afficherEmployes();
    chargerARattacher();
    chargerArriveesBot();
  } catch (e) {
    gestion.message('zone-message-rh', `Impossible de charger RH : ${e.message}`);
  }
}

function afficherEmployes() {
  const recherche = $rh('recherche-employes').value.trim().toLowerCase();
  const grade = $rh('filtre-rh-grade').value, statut = $rh('filtre-rh-statut').value;
  const liste = CACHE_EMPLOYES.filter(e => (!grade || e.grade === grade) && (!statut || e.statut === statut)
    && (!recherche || [e.nomComplet, e.idEmploye, e.discordPseudo, e.discordId].some(v => String(v || '').toLowerCase().includes(recherche))));
  // hiérarchie : l'ordre du serveur (actifs, puis grade selon la page Grades, puis nom) ; sinon par nom
  if ($rh('tri-rh').value === 'alpha') liste.sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, 'fr', { sensitivity: 'base' }));
  $rh('rh-vide').classList.toggle('cache', liste.length > 0);
  $rh('rh-resultat').classList.toggle('cache', liste.length === 0);
  const corps = $rh('corps-table-employes');
  corps.innerHTML = liste.map(e => {
    const aCompleter = e.aCompleter ? ' <span class="puce puce-or" title="ID employé provisoire, ou prénom / nom manquant : à compléter dans la fiche.">à compléter</span>' : '';
    const statut = e.statut === 'actif' ? '<span class="puce puce-ok">Actif</span>'
      : `<span class="puce puce-masquee">Inactif</span>${e.dateDepart ? `<br><span class="champ-aide">parti le ${dateCourte(e.dateDepart)}</span>` : ''}`;
    const discord = [e.discordPseudo, e.discordId].filter(Boolean).map(echapper).join('<br>') || '<span class="champ-aide">—</span>';
    const bascule = e.statut === 'actif'
      ? (aDroitRh('desactiver') ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-desactiver="${e.id}">Désactiver</button>` : '')
      : (aDroitRh('reactiver') ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-reactiver="${e.id}">Réactiver</button>` : '');
    return `<tr>
      <td>${echapper(e.idEmploye)}${e.idProvisoire ? '<br><span class="champ-aide">provisoire</span>' : ''}</td>
      <td><strong>${echapper(e.nomComplet)}</strong>${aCompleter}</td>
      <td>${echapper(e.gradeLibelle)}</td>
      <td>${statut}</td>
      <td>${discord}</td>
      <td>${dateCourte(e.dateArrivee)}</td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-fantome btn-petit" data-rh-fiche="${e.id}">${aDroitRh('modifier') ? 'Fiche / modifier' : 'Fiche'}</button> ${bascule}</td>
    </tr>`;
  }).join('');
  corps.querySelectorAll('[data-rh-fiche]').forEach(b => b.addEventListener('click', () => ouvrirFicheEmploye(Number(b.dataset.rhFiche))));
  corps.querySelectorAll('[data-rh-desactiver]').forEach(b => b.addEventListener('click', () => changerStatutEmploye(Number(b.dataset.rhDesactiver), 'desactiver')));
  corps.querySelectorAll('[data-rh-reactiver]').forEach(b => b.addEventListener('click', () => changerStatutEmploye(Number(b.dataset.rhReactiver), 'reactiver')));
}
$rh('recherche-employes').addEventListener('input', afficherEmployes);
$rh('filtre-rh-grade').addEventListener('change', afficherEmployes);
$rh('filtre-rh-statut').addEventListener('change', afficherEmployes);
$rh('tri-rh').addEventListener('change', afficherEmployes);

// fiche : consultation, modification, ou création (id absent, avec un pré-remplissage éventuel)
async function ouvrirFicheEmploye(id, preremplissage) {
  gestion.message('zone-message-modale-employe', '');
  let f = { grade: GRADES_EMPLOYES.at(-1)?.cle || '', ...(preremplissage || {}) };
  if (id) {
    try { f = await socle.api(`/api/rh/employes/${id}`); }
    catch (e) { gestion.message('zone-message-rh', e.message); return; }
  }
  FICHE_OUVERTE = id || null;
  // fiche d'un grade égal ou supérieur, ou sa propre fiche : en lecture seule (le serveur le refuserait)
  const peutEcrire = id ? aDroitRh('modifier') && f.modifiable !== false : aDroitRh('creer');
  $rh('modale-employe-titre').textContent = id ? `Fiche employé — ${f.nomComplet}` : 'Ajouter un membre';
  const champs = {
    'employe-prenom': f.prenom, 'employe-nom': f.nom, 'employe-id': f.idEmploye,
    'employe-discord-id': f.discordId, 'employe-discord-pseudo': f.discordPseudo,
    'employe-telephone': f.telephone, 'employe-rib': f.rib,
    'employe-arrivee': f.dateArrivee, 'employe-depart': f.dateDepart,
  };
  for (const [idChamp, valeur] of Object.entries(champs)) { const c = $rh(idChamp); c.value = valeur || ''; c.disabled = !peutEcrire; }
  const grade = $rh('employe-grade');
  for (const o of grade.options) o.disabled = !GRADES_ATTRIBUABLES.includes(o.value) && o.value !== f.grade;
  grade.value = GRADES_EMPLOYES.some(g => g.cle === f.grade) ? f.grade : (GRADES_EMPLOYES.at(-1)?.cle || '');
  grade.disabled = !peutEcrire;
  // date d'arrivée exigée à la création ; une fiche reprise de l'existant peut ne pas en avoir encore
  $rh('employe-arrivee').required = !id;
  // téléphone et RIB : le serveur ne les envoie qu'avec rh-sensible
  $rh('employe-bloc-sensible').classList.toggle('cache', !aDroitRh('sensible'));
  const bouton = $rh('employe-enregistrer');
  bouton.classList.toggle('cache', !peutEcrire);
  bouton.textContent = id ? 'Enregistrer les modifications' : 'Ajouter le membre';
  $rh('employe-statut').textContent = id ? `Statut : ${f.statut}${f.idProvisoire ? ' — ID employé provisoire : à remplacer par le vrai.' : ''}` : '';
  const h = f.historique;
  $rh('employe-historique').innerHTML = h ? [
    `Ventes rattachées : <strong>${h.ventesEnregistrees}</strong>${h.derniereVente ? ` — dernière reçue le ${dateHeure(h.derniereVente)}` : ''}`,
    h.tableurSemaineEnCours ? `Tableur, semaine en cours : ${h.tableurSemaineEnCours.ventes} vente(s), ${h.tableurSemaineEnCours.locations} location(s)` : 'Absent du tableur cette semaine',
    `Semaines archivées du tableur : ${h.semainesArchivees}`,
    f.compteDuSite ? `Compte du site : ${echapper(f.compteDuSite.nom)}${f.compteDuSite.grade ? ` (${echapper(f.compteDuSite.grade)})` : ''}` : 'Aucun compte du site relié (même ID Discord)',
  ].join('<br>') : '';
  $rh('modale-employe').classList.remove('cache');
  if (peutEcrire) $rh('employe-prenom').focus();
}
const fermerModaleEmploye = () => $rh('modale-employe').classList.add('cache');
$rh('bouton-nouvel-employe').addEventListener('click', () => ouvrirFicheEmploye(null));
$rh('fermer-modale-employe').addEventListener('click', fermerModaleEmploye);
$rh('modale-employe').addEventListener('click', e => { if (e.target.id === 'modale-employe') fermerModaleEmploye(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$rh('modale-employe').classList.contains('cache') && !document.querySelector('[role="alertdialog"]')) fermerModaleEmploye(); });

$rh('formulaire-employe').addEventListener('submit', async e => {
  e.preventDefault();
  gestion.message('zone-message-modale-employe', '');
  const val = id => $rh(id).value.trim();
  const corps = {
    prenom: val('employe-prenom'), nom: val('employe-nom'), idEmploye: val('employe-id'), grade: $rh('employe-grade').value,
    discordId: val('employe-discord-id'), discordPseudo: val('employe-discord-pseudo'),
    dateArrivee: val('employe-arrivee'), dateDepart: val('employe-depart'),
  };
  if (aDroitRh('sensible')) { corps.telephone = val('employe-telephone'); corps.rib = val('employe-rib'); }
  const creation = !FICHE_OUVERTE;
  try {
    if (creation) await socle.api('/api/rh/employes', { method: 'POST', body: corps });
    else await socle.api(`/api/rh/employes/${FICHE_OUVERTE}`, { method: 'PATCH', body: corps });
    fermerModaleEmploye();
    gestion.message('zone-message-rh', creation ? 'Membre ajouté ✓' : 'Fiche mise à jour ✓', 'succes');
    chargerRh();
  } catch (err) {
    gestion.message('zone-message-modale-employe', err.message);
  }
});

async function changerStatutEmploye(id, action) {
  const e = CACHE_EMPLOYES.find(x => x.id === id), nom = e ? e.nomComplet : 'Cet employé';
  const ok = action === 'desactiver'
    ? await gestion.confirmer(`${nom} quittera l'effectif actif, avec la date d'aujourd'hui comme date de départ. Sa fiche et tout son historique sont conservés, et il pourra être réactivé.`, 'Désactiver cet employé ?', 'Désactiver')
    : await gestion.confirmer(`${nom} réintègre l'effectif actif ; sa date de départ est effacée.`, 'Réactiver cet employé ?', 'Réactiver');
  if (!ok) return;
  try {
    await socle.api(`/api/rh/employes/${id}/${action}`, { method: 'POST', body: {} });
    gestion.message('zone-message-rh', action === 'desactiver' ? 'Employé désactivé ✓' : 'Employé réactivé ✓', 'succes');
    chargerRh();
  } catch (err) { gestion.message('zone-message-rh', err.message); }
}

// « À rattacher » : vendeurs des ventes et lignes du tableur sans fiche RH
async function chargerARattacher() {
  const bloc = $rh('rh-a-rattacher'), contenu = $rh('rh-a-rattacher-contenu');
  try {
    const r = await socle.api('/api/rh/a-rattacher');
    const bouton = attributs => (aDroitRh('creer') ? `<button type="button" class="btn btn-fantome btn-petit" ${attributs}>Créer la fiche</button>` : '');
    const parties = [];
    if (r.vendeurs.length) {
      parties.push(`<p class="champ-aide" style="margin:14px 0 6px;"><strong>Ventes reçues du bot sans fiche</strong> — le pseudo envoyé ne correspond au pseudo Discord d'aucune fiche.</p>
        <div style="overflow-x:auto;"><table class="table-admin"><thead><tr><th>Pseudo reçu</th><th style="text-align:right;">Ventes</th><th>Dernière semaine</th><th></th></tr></thead><tbody>
        ${r.vendeurs.map(v => `<tr><td>${echapper(v.pseudo)}</td><td style="text-align:right;">${v.ventes}</td><td>${echapper(v.derniereSemaine || '—')}</td><td>${bouton(`data-rh-creer-pseudo="${echapper(v.pseudo)}"`)}</td></tr>`).join('')}
        </tbody></table></div>`);
    }
    if (r.tableur.length) {
      parties.push(`<p class="champ-aide" style="margin:14px 0 6px;"><strong>Lignes du tableur sans fiche</strong> — le nom écrit ne correspond au « Prénom Nom » d'aucune fiche.</p>
        <div style="overflow-x:auto;"><table class="table-admin"><thead><tr><th>Nom dans le tableur</th><th>Grade</th><th style="text-align:right;">Ventes</th><th style="text-align:right;">Locations</th><th></th></tr></thead><tbody>
        ${r.tableur.map(l => `<tr><td>${echapper(l.nom)}</td><td>${echapper(l.grade || '—')}</td><td style="text-align:right;">${l.ventes}</td><td style="text-align:right;">${l.locations}</td>
          <td>${bouton(`data-rh-creer-nom="${echapper(l.nom)}" data-rh-creer-grade="${echapper(l.grade || '')}"`)}</td></tr>`).join('')}
        </tbody></table></div>`);
    }
    bloc.classList.toggle('cache', !parties.length);
    contenu.innerHTML = parties.join('');
    contenu.querySelectorAll('[data-rh-creer-pseudo]').forEach(b => b.addEventListener('click', () => ouvrirFicheEmploye(null, { discordPseudo: b.dataset.rhCreerPseudo })));
    contenu.querySelectorAll('[data-rh-creer-nom]').forEach(b => b.addEventListener('click', () => {
      const mots = b.dataset.rhCreerNom.trim().split(/\s+/);
      // le tableur écrit le libellé du grade ; la fiche attend sa clé
      const grade = GRADES_EMPLOYES.find(g => g.libelle === b.dataset.rhCreerGrade)?.cle;
      ouvrirFicheEmploye(null, { prenom: mots.shift() || '', nom: mots.join(' '), ...(grade && { grade }) });
    }));
  } catch { bloc.classList.add('cache'); }
}

// ---- arrivées reçues du bot Discord et réglages de leur lecture ----
const LIBELLES_ARRIVEE_BOT = {
  creee: '<span class="puce puce-ok">Fiche créée</span>',
  existante: '<span class="puce puce-masquee">Déjà une fiche</span>',
  refusee: '<span class="puce puce-or">À traiter</span>',
  ecartee: '<span class="puce puce-masquee">Écartée</span>',
};
const CHAMPS_REGLAGES_BOT = {
  questionIdentite: 'rh-bot-q-identite', questionIdEmploye: 'rh-bot-q-id-employe', questionPrenom: 'rh-bot-q-prenom',
  questionNom: 'rh-bot-q-nom', questionTelephone: 'rh-bot-q-telephone', questionRib: 'rh-bot-q-rib',
};

async function chargerArriveesBot() {
  const bloc = $rh('rh-bot');
  try {
    const r = await socle.api('/api/rh/bot');
    const reglable = aDroitRh('parametrer');
    bloc.classList.toggle('cache', !r.arrivees.length && !reglable);
    $rh('rh-bot-etat').textContent = 'Le bot envoie ses candidatures à l’adresse /webhooks/bot du site (abonnement « Candidatures » de son panneau Monitoring).';
    $rh('rh-bot-reglages').classList.toggle('cache', !reglable);
    if (reglable) {
      const select = $rh('rh-bot-grade');
      select.innerHTML = '<option value="">— à régler —</option>' + r.grades.map(g => `<option value="${echapper(g.cle)}">${echapper(g.libelle)}</option>`).join('');
      select.value = r.reglages.gradeArrivee || '';
      ameliorerSelect(select);
      for (const [champ, id] of Object.entries(CHAMPS_REGLAGES_BOT)) $rh(id).value = r.reglages[champ] || '';
      $rh('rh-bot-questions-vues').innerHTML = r.questionsVues.map(q => `<option value="${echapper(q)}"></option>`).join('');
    }
    const peutCreer = aDroitRh('creer');
    $rh('rh-bot-contenu').innerHTML = r.arrivees.length
      ? `<div style="overflow-x:auto;"><table class="table-admin"><thead><tr><th>Reçu le</th><th>Candidat</th><th>ID Discord</th><th>Résultat</th><th>Fiche</th></tr></thead><tbody>
        ${r.arrivees.map(a => `<tr>
          <td>${dateHeure(a.recuLe)}</td>
          <td>${echapper(a.nomRecu || (a.discordId ? `Discord ${a.discordId}` : '—'))}</td>
          <td>${echapper(a.discordId || '—')}</td>
          <td>${LIBELLES_ARRIVEE_BOT[a.resultat] || echapper(a.resultat)}${a.motif ? `<div class="champ-aide">${echapper(a.motif)}</div>` : ''}</td>
          <td>${a.employe
            ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-bot-fiche="${a.employe.id}">${echapper(a.employe.idEmploye)} — ${echapper(a.employe.nomComplet)}</button>${a.employe.statut === 'inactif' ? ' <span class="puce puce-masquee">Inactif</span>' : ''}`
            : peutCreer && (a.traitable || a.ecartable)
              ? (a.traitable ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-bot-action="traiter" data-rh-bot-id="${a.id}">Retraiter</button> ` : '')
                + `<button type="button" class="btn btn-fantome btn-petit" data-rh-bot-action="ecarter" data-rh-bot-id="${a.id}">Écarter</button>`
              : '—'}</td>
        </tr>`).join('')}
        </tbody></table></div>`
      : '<p class="champ-aide">Aucune candidature acceptée reçue pour le moment.</p>';
    document.querySelectorAll('[data-rh-bot-fiche]').forEach(b => b.addEventListener('click', () => ouvrirFicheEmploye(Number(b.dataset.rhBotFiche))));
    document.querySelectorAll('[data-rh-bot-action]').forEach(b => b.addEventListener('click', async () => {
      const ecarterLigne = b.dataset.rhBotAction === 'ecarter';
      if (ecarterLigne && !await gestion.confirmer('Aucune fiche ne sera créée, et ses réponses seront effacées.', 'Écarter cette candidature ?', 'Écarter')) return;
      b.disabled = true;
      try {
        const res = await socle.api(`/api/rh/bot/arrivees/${b.dataset.rhBotId}/${b.dataset.rhBotAction}`, { method: 'POST', body: {} });
        if (ecarterLigne) gestion.message('zone-message-rh-bot', 'Candidature écartée ✓', 'succes');
        else if (res.resultat === 'creee') gestion.message('zone-message-rh-bot', 'Fiche créée ✓', 'succes');
        else gestion.message('zone-message-rh-bot', res.motif || 'Toujours à traiter.', res.ok ? 'succes' : 'erreur');
        chargerRh();
      } catch (e) { gestion.message('zone-message-rh-bot', e.message); b.disabled = false; }
    }));
  } catch { bloc.classList.add('cache'); }
}

$rh('rh-bot-reglages').addEventListener('submit', async e => {
  e.preventDefault();
  const corps = { gradeArrivee: $rh('rh-bot-grade').value };
  for (const [champ, id] of Object.entries(CHAMPS_REGLAGES_BOT)) corps[champ] = $rh(id).value.trim();
  try {
    await socle.api('/api/rh/bot/reglages', { method: 'PUT', body: corps });
    gestion.message('zone-message-rh-bot', 'Réglages du bot enregistrés ✓', 'succes');
    chargerArriveesBot();
  } catch (err) { gestion.message('zone-message-rh-bot', err.message); }
});

gestion.coque('rh').then(chargerRh);
