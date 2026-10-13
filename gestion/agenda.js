/* GESTION — agenda de départ : événements, types et affichages semaine/mois. */
(() => {
  const $ = id => document.getElementById(id);
  const api = socle.api;
  const aujourdHui = () => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const v = Object.fromEntries(p.map(x => [x.type, x.value]));
    return `${v.year}-${v.month}-${v.day}`;
  };
  const dateObjet = iso => new Date(`${iso}T12:00:00Z`);
  const isoDate = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const ajouterJours = (iso, n) => { const d = dateObjet(iso); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); };
  const lundi = iso => {
    const d = dateObjet(iso), jour = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - jour);
    return isoDate(d);
  };
  const dateFr = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(dateObjet(iso));
  const jourCourt = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(dateObjet(iso));
  const dateLongue = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(dateObjet(iso));
  const premierJourMois = iso => `${iso.slice(0, 7)}-01`;
  const dernierJourMois = iso => {
    const d = dateObjet(`${iso.slice(0, 7)}-01`);
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
    return isoDate(d);
  };
  const state = {
    moi: null, reference: aujourdHui(), vue: matchMedia('(max-width: 760px)').matches ? 'semaine' : 'mois',
    evenements: [], types: [], destinations: [], peutInviter: false, personnes: null, erreurPersonnes: '',
    invites: [], inviteActif: -1, fermer: null, evenement: null, fermerTypes: null,
  };
  const legendeType = id => state.types.find(t => t.id === Number(id));
  const destinationValeur = e => e.destination === 'grade' ? `grade:${e.destination_grade}` : e.destination;
  const plage = () => state.vue === 'semaine'
    ? { debut: lundi(state.reference), fin: ajouterJours(lundi(state.reference), 6) }
    : { debut: lundi(premierJourMois(state.reference)), fin: ajouterJours(lundi(dernierJourMois(state.reference)), 6) };

  function majEntete() {
    const p = plage();
    $('agenda-periode').textContent = state.vue === 'semaine'
      ? `${dateLongue(p.debut)} – ${dateLongue(p.fin)}`
      : new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(dateObjet(state.reference));
    document.querySelectorAll('[data-vue]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vue === state.vue)));
  }

  function creerEvenement(e) {
    const t = legendeType(e.type_id);
    const contenu = document.createElement(e.modifiable ? 'button' : 'article');
    if (e.modifiable) {
      contenu.type = 'button';
      contenu.addEventListener('click', () => ouvrirEvenement(e.jour, e));
    }
    contenu.className = 'agenda-evenement';
    contenu.setAttribute('aria-label', `${e.titre}, ${e.heure_debut} à ${e.heure_fin}, ${e.destinataire}`);
    if (t) contenu.style.setProperty('--event-color', t.couleur);
    const heure = Object.assign(document.createElement('span'), { className: 'agenda-evenement-horaire', textContent: `${e.heure_debut} – ${e.heure_fin}` });
    const titre = Object.assign(document.createElement('span'), { textContent: e.titre });
    contenu.append(heure, titre);
    return contenu;
  }

  function creerCellule(iso, afficherMois) {
    const cellule = document.createElement('article');
    cellule.className = 'agenda-cellule';
    cellule.dataset.jour = iso;
    if (iso.slice(0, 7) !== afficherMois) cellule.classList.add('agenda-cellule--hors');
    if (iso === aujourdHui()) cellule.classList.add('agenda-cellule--aujourdhui');
    const tete = document.createElement('div');
    tete.className = 'agenda-cellule-entete';
    const nomJour = document.createElement('span');
    nomJour.className = 'agenda-jour';
    nomJour.textContent = state.vue === 'semaine' ? dateLongue(iso) : String(dateObjet(iso).getUTCDate());
    const ajouter = Object.assign(document.createElement('button'), {
      type: 'button', className: 'agenda-ajouter-jour', textContent: '+',
    });
    ajouter.setAttribute('aria-label', `Ajouter un événement le ${dateLongue(iso)}`);
    ajouter.addEventListener('click', () => ouvrirEvenement(iso));
    tete.append(nomJour, ajouter);
    cellule.append(tete);
    const liste = document.createElement('div');
    liste.className = 'agenda-evenements';
    state.evenements.filter(e => e.jour === iso).forEach(e => liste.append(creerEvenement(e)));
    cellule.append(liste);
    return cellule;
  }

  function rendre() {
    majEntete();
    const p = plage(), fragment = document.createDocumentFragment();
    for (let i = 0; i < 42; i++) {
      const jour = ajouterJours(p.debut, i);
      if (state.vue === 'semaine' && i > 6) break;
      fragment.append(creerCellule(jour, state.reference.slice(0, 7)));
    }
    $('agenda-grille').classList.toggle('agenda-semaine', state.vue === 'semaine');
    $('agenda-grille').replaceChildren(fragment);
  }

  async function charger() {
    const p = plage();
    try {
      const reponse = await api(`/api/agenda?debut=${p.debut}&fin=${p.fin}`);
      state.evenements = reponse.evenements;
      state.types = reponse.types;
      state.destinations = reponse.droits.destinations;
      state.peutInviter = reponse.droits.peut_inviter;
      gestion.message($('agenda-message'), '');
      rendre();
      return '';
    } catch (e) {
      const message = `L’agenda n’a pas pu être chargé : ${e.message}`;
      gestion.message($('agenda-message'), message);
      $('agenda-grille').replaceChildren();
      return message;
    }
  }

  function decaler(sens) {
    if (state.vue === 'semaine') state.reference = ajouterJours(state.reference, 7 * sens);
    else {
      const d = dateObjet(state.reference);
      d.setUTCMonth(d.getUTCMonth() + sens);
      state.reference = isoDate(d);
    }
    charger();
  }
  $('agenda-precedent').addEventListener('click', () => decaler(-1));
  $('agenda-suivant').addEventListener('click', () => decaler(1));
  $('agenda-aujourdhui').addEventListener('click', () => { state.reference = aujourdHui(); charger(); });
  document.querySelectorAll('[data-vue]').forEach(b => b.addEventListener('click', () => {
    if (state.vue === b.dataset.vue) return;
    state.vue = b.dataset.vue;
    charger();
  }));
  $('agenda-ajouter').addEventListener('click', () => ouvrirEvenement(aujourdHui()));

  async function chargerPersonnes() {
    if (state.personnes === null) {
      try {
        state.personnes = (await api('/api/agenda/personnes')).personnes || [];
        state.personnes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        state.erreurPersonnes = '';
      } catch (e) { state.erreurPersonnes = e.message; }
    }
    if (state.erreurPersonnes) {
      $('agenda-invitations-recherche').disabled = true;
      $('agenda-invitations-etat').textContent = `Impossible de charger les personnes : ${state.erreurPersonnes}`;
      return;
    }
    $('agenda-invitations-recherche').disabled = !state.peutInviter;
    dessinerInvites();
    afficherSuggestionsInvites();
  }

  function dessinerInvites() {
    const liste = $('agenda-invitations-selection');
    liste.replaceChildren(...state.invites.map(p => {
      const li = document.createElement('li');
      li.className = 'agenda-invite-puce';
      const nom = Object.assign(document.createElement('span'), { textContent: p.nom });
      const retirer = Object.assign(document.createElement('button'), {
        type: 'button',
        'aria-label': `Retirer ${p.nom} des invités`,
      });
      retirer.dataset.retirerInvite = p.source === 'invitation' ? `invitation:${p.invitation_id}` : `compte:${p.id}`;
      retirer.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"></path></svg>';
      li.append(nom, retirer);
      return li;
    }));
    $('agenda-invitations-etat').textContent = state.invites.length
      ? `${state.invites.length} ${state.invites.length === 1 ? 'personne invitée' : 'personnes invitées'}.`
      : state.personnes && !state.personnes.length
        ? 'Aucune personne ne peut être invitée avec les droits de votre grade.'
        : 'Aucune personne sélectionnée. Commencez à saisir un nom pour rechercher.';
  }

  const normaliserNom = nom => String(nom || '').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function afficherSuggestionsInvites() {
    const saisie = $('agenda-invitations-recherche'), suggestions = $('agenda-invitations-suggestions');
    const terme = normaliserNom(saisie.value.trim());
    if (!terme || !state.peutInviter) {
      suggestions.hidden = true;
      saisie.setAttribute('aria-expanded', 'false');
      saisie.removeAttribute('aria-activedescendant');
      state.inviteActif = -1;
      return;
    }
    const comptes = new Set(state.invites.filter(p => p.source === 'compte').map(p => Number(p.id)));
    const noms = new Set(state.invites.map(p => normaliserNom(p.nom)));
    const resultats = (state.personnes || []).filter(p => !comptes.has(Number(p.id)) && !noms.has(normaliserNom(p.nom))
      && normaliserNom(p.nom).includes(terme)).slice(0, 6);
    suggestions.replaceChildren();
    state.inviteActif = -1;
    saisie.removeAttribute('aria-activedescendant');
    if (!resultats.length) {
      const vide = Object.assign(document.createElement('li'), { className: 'agenda-invites-vide', textContent: 'Aucun résultat. Essayez un autre nom.' });
      vide.setAttribute('role', 'option');
      vide.setAttribute('aria-disabled', 'true');
      vide.setAttribute('aria-selected', 'false');
      suggestions.append(vide);
    } else {
      resultats.forEach((p, i) => {
        const option = Object.assign(document.createElement('li'), { id: `agenda-invite-${i}`, textContent: p.nom });
        option.dataset.inviteId = String(p.id);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        suggestions.append(option);
      });
    }
    suggestions.hidden = false;
    saisie.setAttribute('aria-expanded', 'true');
  }

  function choisirInvite(id) {
    const personne = state.personnes?.find(p => Number(p.id) === Number(id));
    if (!personne || state.invites.some(p => p.source === 'compte' && Number(p.id) === Number(id))) return;
    state.invites.push({ ...personne, source: 'compte' });
    $('agenda-invitations-recherche').value = '';
    actualiserChampInvites();
    dessinerInvites();
    afficherSuggestionsInvites();
    $('agenda-invitations-recherche').focus();
  }

  $('agenda-invitations-recherche').addEventListener('focus', afficherSuggestionsInvites);
  $('agenda-invitations-recherche').addEventListener('input', afficherSuggestionsInvites);
  $('agenda-invitations-recherche').addEventListener('keydown', e => {
    const options = [...$('agenda-invitations-suggestions').querySelectorAll('[role="option"][data-invite-id]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return;
      e.preventDefault();
      state.inviteActif = state.inviteActif < 0
        ? e.key === 'ArrowDown' ? 0 : options.length - 1
        : (state.inviteActif + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options.forEach((option, i) => option.setAttribute('aria-selected', String(i === state.inviteActif)));
      e.currentTarget.setAttribute('aria-activedescendant', options[state.inviteActif].id);
    } else if (e.key === 'Enter' && state.inviteActif >= 0 && options[state.inviteActif]) {
      e.preventDefault();
      choisirInvite(options[state.inviteActif].dataset.inviteId);
    } else if (e.key === 'Escape' && !$('agenda-invitations-suggestions').hidden) {
      e.preventDefault();
      e.stopPropagation();
      $('agenda-invitations-suggestions').hidden = true;
      e.currentTarget.setAttribute('aria-expanded', 'false');
      e.currentTarget.removeAttribute('aria-activedescendant');
    }
  });
  $('agenda-invitations-suggestions').addEventListener('pointerdown', e => {
    if (e.target.closest('[data-invite-id]')) e.preventDefault();
  });
  $('agenda-invitations-suggestions').addEventListener('click', e => {
    const option = e.target.closest('[data-invite-id]');
    if (option) choisirInvite(option.dataset.inviteId);
  });
  $('agenda-invitations-selection').addEventListener('click', e => {
    const bouton = e.target.closest('[data-retirer-invite]');
    if (!bouton) return;
    const [source, id] = bouton.dataset.retirerInvite.split(':');
    state.invites = state.invites.filter(p => source === 'invitation'
      ? p.source !== 'invitation' || Number(p.invitation_id) !== Number(id)
      : p.source !== 'compte' || Number(p.id) !== Number(id));
    actualiserChampInvites();
    dessinerInvites();
    afficherSuggestionsInvites();
    $('agenda-invitations-recherche').focus();
  });

  function remplirDestinations(e) {
    const select = $('agenda-destination');
    const choix = [...state.destinations];
    if (e && !choix.some(x => x.valeur === destinationValeur(e))) {
      choix.push({ valeur: destinationValeur(e), libelle: e.destinataire });
    }
    select.replaceChildren(...choix.map(x => Object.assign(document.createElement('option'), { value: x.valeur, textContent: x.libelle })));
    if (e) select.value = destinationValeur(e);
  }

  function remplirTypes(id) {
    const select = $('agenda-type');
    select.replaceChildren(new Option('Sans type', ''), ...state.types.map(t => new Option(t.nom, String(t.id))));
    select.value = id ? String(id) : '';
  }

  function ouvrirEvenement(jour, e = null) {
    state.evenement = e;
    $('agenda-titre-fenetre').textContent = e ? 'Modifier l’événement' : 'Nouvel événement';
    $('agenda-titre').value = e?.titre ?? '';
    $('agenda-date').value = e?.jour ?? jour;
    $('agenda-debut').value = e?.heure_debut ?? '09:00';
    $('agenda-fin').value = e?.heure_fin ?? '10:00';
    $('agenda-notes').value = e?.notes ?? '';
    $('agenda-supprimer').hidden = !e;
    $('agenda-erreur').hidden = true;
    remplirDestinations(e);
    remplirTypes(e?.type_id);
    $('agenda-invitations-recherche').value = '';
    $('agenda-invitations-suggestions').hidden = true;
    $('agenda-invitations-recherche').setAttribute('aria-expanded', 'false');
    state.invites = (e?.invites || []).map(i => ({ source: 'invitation', invitation_id: Number(i.invitation_id), nom: i.nom }));
    $('agenda-destination').disabled = state.invites.length > 0;
    const afficherInvitations = $('agenda-destination').value === 'perso' && (state.peutInviter || state.invites.length > 0);
    $('agenda-invitations').hidden = !afficherInvitations;
    $('agenda-invitations-recherche').disabled = !state.peutInviter;
    dessinerInvites();
    if (state.peutInviter) void chargerPersonnes();
    $('agenda-date').effacerErreurFr?.();
    $('agenda-debut').effacerErreurFr?.();
    $('agenda-fin').effacerErreurFr?.();
    state.fermer = gestion.fenetre($('agenda-fenetre'), { focus: $('agenda-titre') });
  }

  function actualiserChampInvites() {
    const visible = $('agenda-destination').value === 'perso' && (state.peutInviter || state.invites.some(p => p.source === 'invitation'));
    $('agenda-invitations').hidden = !visible;
    $('agenda-invitations-recherche').disabled = !state.peutInviter;
    $('agenda-destination').disabled = state.invites.length > 0;
  }
  $('agenda-destination').addEventListener('change', actualiserChampInvites);
  champDateFr($('agenda-date'));
  champHeureFr($('agenda-debut'));
  champHeureFr($('agenda-fin'));
  $('agenda-fermer').addEventListener('click', () => state.fermer?.());
  $('agenda-annuler').addEventListener('click', () => state.fermer?.());
  $('agenda-form').addEventListener('submit', async e => {
    e.preventDefault();
    const dest = $('agenda-destination').value;
    const payload = {
      titre: $('agenda-titre').value,
      jour: $('agenda-date').value,
      heure_debut: $('agenda-debut').value,
      heure_fin: $('agenda-fin').value,
      notes: $('agenda-notes').value,
      type_id: $('agenda-type').value,
      destination: dest.startsWith('grade:') ? 'grade' : dest,
      destination_grade: dest.startsWith('grade:') ? dest.slice(6) : null,
    };
    const invitesCompte = state.invites.filter(p => p.source === 'compte').map(p => Number(p.id));
    if (dest === 'perso') {
      payload.invites_compte_ids = invitesCompte;
      if (state.evenement) payload.invitation_ids = state.invites.filter(p => p.source === 'invitation').map(p => Number(p.invitation_id));
    }
    const bouton = $('agenda-enregistrer');
    const texteInitial = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = invitesCompte.length ? 'Enregistrement et invitations…' : 'Enregistrement…';
    let reponse;
    try {
      if (state.evenement) reponse = await api(`/api/agenda/${state.evenement.id}`, { method: 'PUT', body: payload });
      else reponse = await api('/api/agenda', { method: 'POST', body: payload });
      state.fermer?.();
      const erreurChargement = await charger();
      const action = state.evenement ? 'Événement enregistré' : 'Événement créé';
      const tickets = reponse?.notifications?.filter(n => n.prevenu === 'ticket').length || 0;
      const prives = reponse?.notifications?.filter(n => n.prevenu === 'prive').length || 0;
      const resume = [
        tickets && `${tickets} ${tickets === 1 ? 'invitation envoyée dans un ticket' : 'invitations envoyées dans des tickets'} Discord`,
        prives && `${prives} ${prives === 1 ? 'invitation envoyée en message privé' : 'invitations envoyées en messages privés'} Discord`,
        reponse?.annulations && `${reponse.annulations} ${reponse.annulations === 1 ? 'annulation signalée' : 'annulations signalées'} sur Discord`,
      ].filter(Boolean).join(' et ');
      if (reponse?.avertissements?.length || erreurChargement) {
        gestion.message($('agenda-message'), [action, resume, ...(reponse?.avertissements || []), erreurChargement].filter(Boolean).join('. '));
      }
      else if (resume) gestion.notifier(`${action} ; ${resume}`);
      else gestion.notifier(action);
    } catch (err) { gestion.message($('agenda-erreur'), err.message); }
    finally { bouton.disabled = false; bouton.textContent = texteInitial; }
  });
  $('agenda-supprimer').addEventListener('click', async () => {
    if (!state.evenement) return;
    if (!await gestion.confirmer('Cette action est définitive et ne peut pas être annulée.', { titre: 'Supprimer cet événement ?', libelle: 'Supprimer l’événement' })) return;
    try {
      await api(`/api/agenda/${state.evenement.id}`, { method: 'DELETE' });
      state.fermer?.();
      gestion.notifier('Événement supprimé');
      await charger();
    } catch (e) { gestion.message($('agenda-erreur'), e.message); }
  });

  const couleursTypes = ['#5077a8', '#8a5c9e', '#43856c', '#b36b42', '#a44e5c', '#7b793b', '#3c8190', '#7866a8'];
  function rendreTypes() {
    const ul = $('agenda-types-liste');
    ul.replaceChildren();
    state.types.forEach(t => {
      const li = document.createElement('li');
      li.className = 'agenda-type-ligne';
      const labelNom = document.createElement('label');
      labelNom.className = 'champ';
      labelNom.textContent = 'Nom';
      const nom = Object.assign(document.createElement('input'), { type: 'text', maxLength: 40, value: t.nom });
      labelNom.append(nom);
      const labelCouleur = document.createElement('label');
      labelCouleur.className = 'champ';
      labelCouleur.textContent = 'Couleur';
      const couleur = Object.assign(document.createElement('input'), { type: 'color', value: t.couleur });
      labelCouleur.append(couleur);
      const sauver = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--petit', textContent: 'Enregistrer' });
      sauver.addEventListener('click', () => modifierType(t.id, nom.value.trim(), couleur.value));
      const supprimer = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--danger btn--petit', textContent: 'Supprimer' });
      supprimer.addEventListener('click', () => supprimerType(t));
      li.append(labelNom, labelCouleur, sauver, supprimer);
      ul.append(li);
    });
  }
  async function actualiserTypes(message) {
    try {
      const r = await api('/api/agenda/types');
      state.types = r.types;
      rendreTypes();
      await charger();
      if (message) gestion.notifier(message);
      return true;
    } catch (e) { gestion.message($('agenda-types-erreur'), e.message); return false; }
  }
  async function modifierType(id, nom, couleur) {
    if (!nom) { gestion.message($('agenda-types-erreur'), 'Donnez un nom au type.'); return; }
    try {
      await api(`/api/agenda/types/${id}`, { method: 'PUT', body: { nom, couleur } });
      await actualiserTypes('Type enregistré');
    } catch (e) { gestion.message($('agenda-types-erreur'), e.message); }
  }
  async function supprimerType(t) {
    if (!await gestion.confirmer('Les événements classés avec ce type resteront dans l’agenda.', { titre: `Supprimer le type ${t.nom} ?`, libelle: 'Supprimer le type' })) return;
    try {
      await api(`/api/agenda/types/${t.id}`, { method: 'DELETE' });
      await actualiserTypes('Type supprimé');
    } catch (e) { gestion.message($('agenda-types-erreur'), e.message); }
  }
  function ouvrirTypes() {
    $('agenda-types-erreur').hidden = true;
    $('agenda-type-nom').value = '';
    $('agenda-type-couleur').value = couleursTypes[state.types.length % couleursTypes.length];
    rendreTypes();
    state.fermerTypes = gestion.fenetre($('agenda-types-fenetre'), { focus: $('agenda-type-nom') });
  }
  $('agenda-types').addEventListener('click', ouvrirTypes);
  $('agenda-types-fermer').addEventListener('click', () => state.fermerTypes?.());
  $('agenda-types-annuler').addEventListener('click', () => state.fermerTypes?.());
  $('agenda-type-form').addEventListener('submit', async e => {
    e.preventDefault();
    const nom = $('agenda-type-nom').value.trim();
    if (!nom) { gestion.message($('agenda-types-erreur'), 'Donnez un nom au type.'); return; }
    try {
      await api('/api/agenda/types', { method: 'POST', body: { nom, couleur: $('agenda-type-couleur').value } });
      $('agenda-type-nom').value = '';
      await actualiserTypes('Type ajouté');
    } catch (err) { gestion.message($('agenda-types-erreur'), err.message); }
  });

  gestion.coque().then(async moi => {
    state.moi = moi;
    $('agenda-types').hidden = !socle.peut(moi, 'agenda-types');
    await charger();
  }).catch(e => gestion.message($('agenda-message'), `La page n’a pas pu se charger : ${e.message}`));
})();
