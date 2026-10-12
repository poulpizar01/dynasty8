/* GESTION (personnalisable) — coque commune des pages de l'espace employés : navigation selon les permissions,
   compte connecté, déconnexion. Chaque page appelle gestion.coque() ; le menu est décrit une seule fois ici.
   permission : la rubrique n'apparaît qu'à qui la détient (le serveur applique la même règle : entreprise/index.ts → pages). */
const GESTION_NAV = [
  { href: 'accueil.html', label: 'Accueil' },
  { href: 'annonces.html', label: 'Annonces' },
  { href: 'comptes.html', label: 'Comptes', permission: 'comptes' },
  { href: 'grades.html', label: 'Grades', permission: 'grades' },
  { href: 'parametres.html', label: 'Paramètres', permission: 'parametres' },
  { href: 'compte.html', label: 'Mon compte' },
];

// Ce que le menu affiche du compte, gardé pour l'onglet (sessionStorage) : la page suivante pose son menu sans attendre
// le serveur. Sinon chaque page s'affichait d'abord sans menu, puis tout sautait de sa largeur. Affichage seulement (le
// serveur contrôle chaque page et chaque requête) ; effacé à la déconnexion et quand la session n'est plus reconnue.
const memoCoque = {
  cle: 'gestion.coque',
  lire() { try { return JSON.parse(sessionStorage.getItem(this.cle)); } catch { return null; } },
  ecrire(moi) {
    const m = { nom: moi.nom, pseudo: moi.pseudo, avatar: moi.avatar, proprietaire: moi.proprietaire, grade: moi.grade ? { libelle: moi.grade.libelle } : null, permissions: moi.permissions };
    try { sessionStorage.setItem(this.cle, JSON.stringify(m)); } catch { /* stockage refusé : menu dessiné à la réponse */ }
    return m;
  },
  effacer() { try { sessionStorage.removeItem(this.cle); } catch { /* rien à effacer */ } },
};

window.gestion = {
  // construit la coque autour de <main class="contenu"> et renvoie le compte connecté. La coque est posée tout de suite,
  // menu dessiné d'après le compte gardé pour l'onglet (place vide au premier passage), puis redessiné si la réponse
  // du serveur diffère.
  async coque() {
    const page = location.pathname.split('/').pop() || 'accueil.html';
    const memo = memoCoque.lire();
    const rail = document.createElement('aside');
    rail.className = 'rail';
    rail.innerHTML = `
      <a class="rail__marque" href="accueil.html"><img src="/assets/logo.png" alt="" width="32" height="32"><span>${socle.esc(socle.nomSite)}</span></a>
      <button class="rail__burger" type="button" aria-label="Menu" aria-expanded="false">☰</button>
      <nav class="rail__nav"></nav>
      <div class="rail__moi"></div>`;
    const dessiner = moi => {
      rail.querySelector('.rail__nav').innerHTML = GESTION_NAV.filter(l => !l.permission || socle.peut(moi, l.permission)).map(l =>
        `<a href="${l.href}"${l.href === page ? ' aria-current="page"' : ''}>${socle.esc(l.label)}</a>`).join('') + '<a href="/">Site public</a>';
      rail.querySelector('.rail__moi').innerHTML = `
        ${moi.avatar ? `<img src="${socle.esc(moi.avatar)}" alt="">` : '<span class="avatar"></span>'}
        <div><strong>${socle.esc(moi.nom || moi.pseudo)}</strong><small>${socle.esc(moi.grade?.libelle || (moi.proprietaire ? 'Propriétaire' : 'Sans grade'))}</small></div>
        <button class="btn btn--petit" type="button" data-deconnexion>Quitter</button>`;
    };
    if (memo) dessiner(memo);
    const burger = rail.querySelector('.rail__burger');
    const ouvrir = ouvert => { rail.classList.toggle('is-open', ouvert); burger.setAttribute('aria-expanded', String(ouvert)); };
    burger.addEventListener('click', () => ouvrir(!rail.classList.contains('is-open')));
    rail.addEventListener('keydown', e => { if (e.key === 'Escape' && rail.classList.contains('is-open')) { ouvrir(false); burger.focus(); } });
    rail.addEventListener('click', e => { if (e.target.closest('[data-deconnexion]')) { memoCoque.effacer(); socle.deconnexion(); } });
    const coque = document.createElement('div');
    coque.className = 'coque';
    const main = document.querySelector('main.contenu');
    main.id ||= 'contenu';
    main.tabIndex = -1;
    main.replaceWith(coque);
    coque.append(rail, main);
    // lien d'évitement : au clavier, le premier Tab propose de sauter le menu
    const evitement = document.createElement('a');
    evitement.className = 'evitement';
    evitement.href = `#${main.id}`;
    evitement.textContent = 'Aller au contenu';
    document.body.prepend(evitement);

    let moi;
    // compte illisible (serveur arrêté, trop de requêtes, coupure) : la page le dit au lieu de rester vide ;
    // une session expirée est déjà renvoyée vers la connexion par socle.api()
    try { moi = await socle.moi(); }
    catch (e) {
      memoCoque.effacer();
      const p = Object.assign(document.createElement('p'), { className: 'message', textContent: `La page n’a pas pu se charger : ${e.message}` });
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: 'Réessayer' });
      b.addEventListener('click', () => location.reload());
      main.replaceChildren(p, b);
      throw e;
    }
    if (JSON.stringify(memoCoque.ecrire(moi)) !== JSON.stringify(memo)) dessiner(moi);
    tablesAdaptatives(main);
    return moi;
  },

  // Confirmation dans la page : l'ordinateur en jeu n'affiche ni confirm() ni alert() (docs/folkos.md).
  // libelle : le bouton dit l'action (« Supprimer le grade »), jamais « OK » ; danger : bouton rouge (action destructive).
  // Le focus reste dans la fenêtre (Tab boucle), Échap annule, et il revient ensuite où il était.
  confirmer(texte, { titre = 'Confirmer', libelle = 'Confirmer', danger = true } = {}) {
    return new Promise(resolve => {
      const avant = document.activeElement;
      const fond = document.createElement('div');
      fond.className = 'modale-fond';
      fond.innerHTML = `<div class="modale" role="alertdialog" aria-modal="true" aria-labelledby="modale-titre" aria-describedby="modale-texte">
        <h2 id="modale-titre"></h2><p id="modale-texte"></p>
        <div class="ligne modale__actions"><button type="button" class="btn" data-non>Annuler</button>
        <button type="button" class="btn ${danger ? 'btn--danger-plein' : 'btn--accent'}" data-oui></button></div></div>`;
      fond.querySelector('h2').textContent = titre;
      fond.querySelector('p').textContent = texte;
      fond.querySelector('[data-oui]').textContent = libelle;
      const boutons = [...fond.querySelectorAll('button')];
      const fin = ok => { document.removeEventListener('keydown', clavier, true); fond.remove(); avant?.focus?.(); resolve(ok); };
      const clavier = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          const i = boutons.indexOf(document.activeElement);
          boutons[(i + (e.shiftKey ? -1 : 1) + boutons.length) % boutons.length].focus();
        }
      };
      fond.querySelector('[data-oui]').addEventListener('click', () => fin(true));
      fond.querySelector('[data-non]').addEventListener('click', () => fin(false));
      fond.addEventListener('click', e => { if (e.target === fond) fin(false); });
      document.addEventListener('keydown', clavier, true);
      document.body.append(fond);
      boutons[0].focus();
    });
  },

  // Notification d'une action (« Grade enregistré ») en bas de l'écran, visible quel que soit le défilement : affichée en
  // haut de page, elle passait inaperçue quand on avait cliqué en bas. Une seule à la fois ; lue par les lecteurs d'écran.
  notifier(texte, type = 'succes') {
    let zone = document.getElementById('gestion-notifications');
    if (!zone) {
      zone = Object.assign(document.createElement('div'), { id: 'gestion-notifications', className: 'notifications' });
      zone.setAttribute('role', 'status');
      document.body.append(zone);
    }
    const n = Object.assign(document.createElement('div'), { className: `notification${type === 'erreur' ? ' notification--erreur' : ''}`, textContent: texte });
    zone.replaceChildren(n);
    setTimeout(() => { n.classList.add('sortie'); setTimeout(() => n.remove(), 300); }, type === 'erreur' ? 6000 : 3200);
  },

  // Fenêtre de la page (édition, détail) : focus placé dedans, Tab qui y boucle, Échap et clic sur le fond qui ferment,
  // focus rendu à l'élément d'origine (sinon le clavier agit sur la page cachée derrière). fond : l'élément qui couvre
  // la page (masqué par hidden) ; il contient la fenêtre, dont le titre est relié par aria-labelledby. Renvoie fermer().
  fenetre(fond, { focus } = {}) {
    const avant = document.activeElement;
    const focusables = () => [...fond.querySelectorAll('button, [href], input, select, textarea')].filter(e => !e.disabled && e.offsetParent !== null);
    const clavier = e => {
      if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) { e.preventDefault(); fermer(); }
      else if (e.key === 'Tab') {
        const f = focusables(), i = f.indexOf(document.activeElement);
        if (e.shiftKey ? i <= 0 : i === f.length - 1) { e.preventDefault(); (e.shiftKey ? f.at(-1) : f[0])?.focus(); }
      }
    };
    const clic = e => { if (e.target === fond) fermer(); };
    const fermer = () => { fond.hidden = true; document.removeEventListener('keydown', clavier); fond.removeEventListener('click', clic); avant?.focus?.(); };
    fond.hidden = false;
    document.addEventListener('keydown', clavier);
    fond.addEventListener('click', clic);
    (focus || focusables()[0])?.focus();
    return fermer;
  },

  // message d'erreur ou de réussite dans un élément de la page (texte seulement, jamais de HTML)
  message(el, texte, ok = false) {
    el.hidden = !texte;
    el.textContent = texte || '';
    el.classList.toggle('message--ok', ok);
  },
};

// Tableaux adaptatifs : un tableau qui ne tient plus dans sa largeur devient une grille de cartes (classe en-cartes,
// gestion.css) au lieu de défiler de côté, ce qui cachait des colonnes, souvent les actions. Chaque cellule reçoit
// l'intitulé de sa colonne (data-libelle, tiré de l'en-tête) ; la colonne titre (th[data-titre], sinon la première
// nommée) ouvre la carte ; une colonne sans nom (actions) prend toute la largeur. Un tableau sous [data-tableau-fixe]
// n'est pas touché. Recalculé quand la largeur change ou que le tableau est redessiné.
function tablesAdaptatives(racine) {
  const etiqueter = table => {
    const ths = [...(table.tHead?.rows[0]?.cells || [])];
    const noms = ths.map(th => (/^(actions?)?$/i.test(th.textContent.trim()) ? '' : th.textContent.trim()));
    let titre = ths.findIndex(th => th.hasAttribute('data-titre'));
    if (titre < 0) titre = noms.findIndex(Boolean);
    for (const tbody of table.tBodies) for (const tr of tbody.rows) {
      if (tr.cells.length !== ths.length) continue;   // ligne d'état (« Aucun… », colspan) : pleine largeur telle quelle
      [...tr.cells].forEach((td, i) => {
        if (i === titre) td.classList.add('cellule-titre');
        else if (noms[i] && !td.hasAttribute('data-libelle')) td.dataset.libelle = noms[i];
      });
    }
  };
  // mesure en mode tableau (synchrone : rien n'est affiché entre les deux), cartes si la largeur dépasse
  const ajuster = table => {
    const boite = table.parentElement;
    table.classList.remove('en-cartes');
    boite.classList.remove('contient-cartes');
    const trop = table.offsetWidth > boite.clientWidth + 1;
    table.classList.toggle('en-cartes', trop);
    boite.classList.toggle('contient-cartes', trop);
  };
  const suivies = new WeakSet();
  const suivre = table => {
    if (suivies.has(table) || table.closest('[data-tableau-fixe]')) return;
    suivies.add(table);
    etiqueter(table);
    ajuster(table);
    let largeur = table.parentElement.clientWidth;
    new ResizeObserver(() => {
      const l = table.parentElement.clientWidth;
      if (l !== largeur) { largeur = l; ajuster(table); }   // la hauteur change avec les cartes : seule la largeur compte
    }).observe(table.parentElement);
    new MutationObserver(() => { etiqueter(table); ajuster(table); }).observe(table, { childList: true, subtree: true });
  };
  racine.querySelectorAll('table').forEach(suivre);
  new MutationObserver(() => racine.querySelectorAll('table').forEach(suivre)).observe(racine, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// Outils de conception (règles et erreurs déjà commises : docs/design.md). Point de départ : un site les habille à sa
// façon, mais garde ce qu'ils garantissent.
// ---------------------------------------------------------------------------------------------------------------------

// Flèche dessinée, centrée sur le texte : un caractère (« ← », « › », « ⌄ ») se pose sur la ligne de base et paraît
// trop bas. Dans une page statique, écrire le même SVG.
const FLECHES = {
  gauche: 'M19 12H5M11 6l-6 6 6 6', droite: 'M5 12h14M13 6l6 6-6 6', sortie: 'M7 17L17 7M9 7h8v8',
  precedent: 'M15 6l-6 6 6 6', suivant: 'M9 6l6 6-6 6', haut: 'M12 19V5M6 11l6-6 6 6', bas: 'M12 5v14M6 13l6 6 6-6',
};
const fleche = sens => `<svg class="fleche" viewBox="0 0 24 24" aria-hidden="true"><path d="${FLECHES[sens]}"/></svg>`;

// Plein écran d'un contenu intégré (carte, présentation), sur place : le contenu principal ne s'ouvre jamais dans un
// autre onglet. Bouton masqué si le navigateur ne le permet pas (certains navigateurs en jeu).
function pleinEcran(bouton, boite) {
  if (!bouton || !boite || !document.fullscreenEnabled) return;
  bouton.hidden = false;
  bouton.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : boite.requestFullscreen()).catch(() => {}));
  document.addEventListener('fullscreenchange', () => { bouton.textContent = document.fullscreenElement === boite ? 'Quitter le plein écran' : 'Plein écran'; });
}

// Dates et heures à la française. Un <input type="date|time"> suit la langue du navigateur (mm/dd/yyyy, « 02:00 PM ») :
// ces aides en font des champs texte jj/mm/aaaa et 24 h, mais .value garde le format des scripts et du serveur
// (« 2026-10-06 », « 14:30 »). Une saisie invalide affiche une erreur sous le champ et bloque l'envoi du formulaire
// (sinon la valeur partait vide sans rien dire).
const VALEUR_INPUT = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function erreurChampFr(input, message) {
  const invalide = () => VALEUR_INPUT.get.call(input).trim() !== '' && input.value === '';
  let p = null;
  const montrer = afficher => {
    if (afficher && !p) {
      p = Object.assign(document.createElement('p'), { className: 'champ-erreur', id: `${input.id || 'champ'}-erreur-format`, textContent: message });
      input.insertAdjacentElement('afterend', p);
      input.setAttribute('aria-describedby', p.id);
    }
    if (p) p.hidden = !afficher;
    input.toggleAttribute('aria-invalid', afficher);
  };
  input.addEventListener('blur', () => montrer(invalide()));
  input.addEventListener('input', () => { if (!invalide()) montrer(false); });
  input.form?.addEventListener('submit', e => { if (!invalide()) return; e.preventDefault(); e.stopImmediatePropagation(); montrer(true); input.focus(); }, true);
  input.effacerErreurFr = () => montrer(false);
}
function champDateFr(input) {
  if (!input || input.dataset.fr) return;
  input.dataset.fr = '1';
  erreurChampFr(input, 'Date invalide : écrivez-la jj/mm/aaaa, par exemple 06/10/2026.');
  input.type = 'text';
  Object.assign(input, { inputMode: 'numeric', placeholder: 'jj/mm/aaaa', maxLength: 10, autocomplete: 'off' });
  const versIso = t => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(t).trim());
    if (!m) return '';
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1] ? '' : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;   // 31/02 refusé
  };
  const versFr = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  Object.defineProperty(input, 'value', { configurable: true, get() { return versIso(VALEUR_INPUT.get.call(this)); }, set(v) { VALEUR_INPUT.set.call(this, versFr(v)); this.effacerErreurFr?.(); } });
  input.addEventListener('input', e => {   // « 06102026 » devient « 06/10/2026 »
    if (e.inputType && !e.inputType.startsWith('insert')) return;
    const c = VALEUR_INPUT.get.call(input).replace(/\D/g, '').slice(0, 8);
    VALEUR_INPUT.set.call(input, [c.slice(0, 2), c.slice(2, 4), c.slice(4)].filter(Boolean).join('/'));
  });
}
function champHeureFr(input) {
  if (!input || input.dataset.fr) return;
  input.dataset.fr = '1';
  erreurChampFr(input, 'Heure invalide : écrivez-la sur 24 h, par exemple 14:30.');
  input.type = 'text';
  Object.assign(input, { inputMode: 'numeric', placeholder: 'hh:mm', maxLength: 5, autocomplete: 'off' });
  const normaliser = t => { const m = /^(\d{1,2})[:hH]?(\d{2})?$/.exec(String(t).trim()); return !m || +m[1] > 23 || +(m[2] || 0) > 59 ? '' : `${m[1].padStart(2, '0')}:${m[2] || '00'}`; };
  Object.defineProperty(input, 'value', { configurable: true, get() { return normaliser(VALEUR_INPUT.get.call(this)); }, set(v) { VALEUR_INPUT.set.call(this, normaliser(v)); this.effacerErreurFr?.(); } });
  input.addEventListener('input', e => {   // « 1430 » devient « 14:30 »
    if (e.inputType && !e.inputType.startsWith('insert')) return;
    const c = VALEUR_INPUT.get.call(input).replace(/\D/g, '').slice(0, 4);
    VALEUR_INPUT.set.call(input, c.length > 2 ? `${c.slice(0, 2)}:${c.slice(2)}` : c);
  });
  input.addEventListener('blur', () => { const n = normaliser(VALEUR_INPUT.get.call(input)); if (n) VALEUR_INPUT.set.call(input, n); });
}
