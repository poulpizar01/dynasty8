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
  const state = { moi: null, reference: aujourdHui(), vue: matchMedia('(max-width: 760px)').matches ? 'semaine' : 'mois', evenements: [], types: [], destinations: [], fermer: null, evenement: null, fermerTypes: null };
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
      gestion.message($('agenda-message'), '');
      rendre();
    } catch (e) {
      gestion.message($('agenda-message'), `L’agenda n’a pas pu être chargé : ${e.message}`);
      $('agenda-grille').replaceChildren();
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
    $('agenda-date').effacerErreurFr?.();
    $('agenda-debut').effacerErreurFr?.();
    $('agenda-fin').effacerErreurFr?.();
    state.fermer = gestion.fenetre($('agenda-fenetre'), { focus: $('agenda-titre') });
  }
  champDateFr($('agenda-date'));
  champHeureFr($('agenda-debut'));
  champHeureFr($('agenda-fin'));
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
    try {
      if (state.evenement) await api(`/api/agenda/${state.evenement.id}`, { method: 'PUT', body: payload });
      else await api('/api/agenda', { method: 'POST', body: payload });
      state.fermer?.();
      gestion.notifier(state.evenement ? 'Événement enregistré' : 'Événement créé');
      await charger();
    } catch (err) { gestion.message($('agenda-erreur'), err.message); }
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
