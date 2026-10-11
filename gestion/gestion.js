/* GESTION — coque commune des pages de l'espace agents Dynasty 8 : barre latérale (rubriques selon les permissions),
   compte connecté, déconnexion, fenêtre de confirmation, fond animé. Chaque page appelle gestion.coque('<rubrique>')
   après socle.js et layout.js ; le menu est décrit une seule fois ici.
   permission : la rubrique n'apparaît qu'à qui la détient (le serveur applique la même règle : entreprise/index.ts → pages). */
const GESTION_NAV = [
  { groupe: 'Agence' },
  { cle: 'accueil', href: 'accueil.html', label: 'Accueil', icone: 'home' },
  { cle: 'biens', href: 'biens.html', label: 'Annonces', icone: 'grid', permission: 'biens' },
  { cle: 'agenda', href: 'agenda.html', label: 'Agenda', icone: 'calendar' },
  { cle: 'compte', href: 'compte.html', label: 'Mon profil', icone: 'user' },
  { groupe: 'Direction' },
  { cle: 'comptes', href: 'comptes.html', label: 'Comptes & accès', icone: 'lock', permission: 'comptes' },
  { cle: 'statistiques', href: 'statistiques.html', label: 'Ventes & statistiques', icone: 'chart', permission: 'ventes' },
  { cle: 'rh', href: 'rh.html', label: 'Ressources humaines', icone: 'users', permission: 'rh-voir' },
  { cle: 'comptabilite', href: 'comptabilite.html', label: 'Comptabilité', icone: 'calc', permission: 'compta' },
  { cle: 'grades', href: 'grades.html', label: 'Grades', icone: 'gear', permission: 'grades' },
  { cle: 'parametres', href: 'parametres.html', label: 'Paramètres', icone: 'sync', permission: 'parametres' },
  { groupe: 'Outils' },
  { cle: 'coherences', href: 'coherences.html', label: 'Cohérences', icone: 'sheet' },
  { cle: 'webmap', href: 'webmap.html', label: 'WebMap', icone: 'map', permission: 'parametres' },
  // lien réglé dans Paramètres, servi aux seuls comptes validés (/api/outils) : ajouté au menu s'il est réglé
  { cle: 'registre', label: 'Registre', icone: 'book', externe: true, regle: 'registre' },
];

// icônes au trait fin (sprite injecté une fois par page) : <svg class="ico"><use href="#ico-…"></use></svg>
const GESTION_ICONES = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c2 .7 3 2.5 3 5.2"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M8 16h2M12 16h2M16 12v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M4 15h16M10 9v12"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.5 6.3M3 12a9 9 0 0 1 15.5-6.3"/><path d="M18 2v4h-4M6 22v-4h4"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.5 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.5 9.5 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  pencil: '<path d="M5 19h4L19 9l-4-4L5 15v4z"/><path d="M13 7l4 4"/>',   // tracé de 5 à 19 : centré dans le carré de 24
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1"/><rect x="17" y="14" width="4" height="6" rx="1"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M18 5l2 2"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-6c0-1.7-2.7-3-6-3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
};
const ico = nom => `<svg class="ico" aria-hidden="true"><use href="#ico-${nom}"></use></svg>`;

// Encadré « En service » : relu chaque minute, seulement dans un onglet visible (chaque requête compte dans la limite
// de l'API du compte) ; une erreur passagère garde le dernier affichage.
function enService(barre) {
  const encadre = barre.querySelector('[data-en-service]');
  const heure = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const duree = d => { const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const charger = async () => {
    if (document.hidden) return;
    try {
      const r = await socle.api('/api/services/en-cours');
      encadre.classList.toggle('cache', !r.regle);
      if (!r.regle) return;
      encadre.querySelector('[data-en-service-nombre]').textContent = r.enService.length;
      encadre.querySelector('[data-en-service-liste]').innerHTML = r.enService.length
        ? r.enService.map(p => `<li title="En service depuis ${socle.esc(heure(p.depuis))}${p.mode ? ' — ' + socle.esc(p.mode) : ''}">
            <span class="admin-en-service-nom">${socle.esc(p.nom)}</span>
            <span class="admin-en-service-depuis">depuis ${socle.esc(heure(p.depuis))} · ${duree(p.depuis)}</span></li>`).join('')
        : '<li class="admin-en-service-vide">Personne pour le moment.</li>';
    } catch { /* erreur passagère : dernier affichage gardé */ }
  };
  charger();
  setInterval(charger, 60_000);
  document.addEventListener('visibilitychange', charger);
}

window.gestion = {
  ico,

  // construit la coque autour de <main class="admin-contenu"> et renvoie le compte connecté
  async coque(rubrique) {
    const sprite = document.createElement('div');
    sprite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(GESTION_ICONES).map(([n, d]) => `<symbol id="ico-${n}" viewBox="0 0 24 24">${d}</symbol>`).join('')}</svg>`;
    document.body.prepend(sprite.firstChild);
    let moi;
    try { moi = await socle.moi(); }
    catch (e) { erreurDeChargement(document.querySelector('main.admin-contenu'), e); throw e; }
    // un groupe sans aucune rubrique visible n'est pas affiché
    const visibles = GESTION_NAV.filter(l => (l.groupe || !l.permission || socle.peut(moi, l.permission)) && !l.regle);
    const nav = visibles.filter((l, i) => !l.groupe || (visibles[i + 1] && !visibles[i + 1].groupe)).map(l => l.groupe
      ? `<p class="admin-nav-groupe">${socle.esc(l.groupe)}</p>`
      : `<a class="lien-onglet${l.cle === rubrique ? ' actif' : ''}" href="${l.href}"${l.cle === rubrique ? ' aria-current="page"' : ''}${l.externe ? ' target="_blank" rel="noopener"' : ''}>${ico(l.icone)}<span>${socle.esc(l.label)}</span></a>`).join('');
    const nom = moi.nom || moi.pseudo;
    const grade = moi.grade?.libelle || (moi.proprietaire ? 'Propriétaire' : 'Sans grade');
    const barre = document.createElement('aside');
    barre.className = 'admin-barre-laterale';
    barre.innerHTML = `
      <a href="/accueil.html" class="logo" title="Voir le site public"><img src="/assets/logo-full.png" alt="Dynasty 8" class="logo-entete"></a>
      <nav class="admin-nav">${nav}</nav>
      <!-- qui est en service, et depuis quand (salon Discord des services, entreprise/services.ts) ; masqué tant que le
           salon n'est pas réglé -->
      <div class="admin-en-service cache" data-en-service aria-live="polite">
        <p class="admin-en-service-titre"><span class="pastille-service" aria-hidden="true"></span> En service <span class="admin-en-service-nombre" data-en-service-nombre>0</span></p>
        <ul class="admin-en-service-liste" data-en-service-liste></ul>
      </div>
      <div class="admin-bas">
        <div class="admin-aide">
          <p class="admin-aide-titre">${ico('headset')} Besoin d'aide ?</p>
          <a href="/faq.html" target="_blank" rel="noopener">Consultez notre FAQ</a>
        </div>
        <div>
          <div class="admin-compte-profil">
            ${moi.avatar ? `<img class="admin-avatar" src="${socle.esc(moi.avatar)}" alt="">` : `<span class="admin-avatar">${socle.esc(initiales(nom))}</span>`}
            <div><strong>${socle.esc(nom)}</strong><span class="admin-compte-grade">${socle.esc(grade)}</span></div>
          </div>
          <button class="btn btn-fantome btn-petit" style="width:100%;" type="button" data-deconnexion>${ico('logout')} Se déconnecter</button>
        </div>
      </div>`;
    barre.id = 'admin-menu';
    barre.querySelector('[data-deconnexion]').addEventListener('click', () => socle.deconnexion());
    // téléphone et tablette : barre du haut, la barre latérale entière s'ouvre en tiroir (compte et déconnexion compris)
    const haut = document.createElement('header');
    haut.className = 'admin-barre-haut';
    haut.innerHTML = `<button type="button" class="admin-burger" aria-controls="admin-menu" aria-expanded="false" aria-label="Ouvrir le menu">
        <svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <a href="/accueil.html" class="admin-barre-haut-logo" title="Voir le site public"><img src="/assets/logo-full.png" alt="Dynasty 8"></a>
      ${moi.avatar ? `<img class="admin-avatar" src="${socle.esc(moi.avatar)}" alt="">` : `<span class="admin-avatar" aria-hidden="true">${socle.esc(initiales(nom))}</span>`}`;
    const voile = document.createElement('div');
    voile.className = 'admin-voile';
    const burger = haut.querySelector('.admin-burger');
    const ouvrir = ouvert => {
      document.body.classList.toggle('admin-menu-ouvert', ouvert);
      burger.setAttribute('aria-expanded', String(ouvert));
      burger.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
      if (ouvert) (barre.querySelector('a.lien-onglet.actif') || barre.querySelector('a.lien-onglet'))?.focus();
    };
    burger.addEventListener('click', () => ouvrir(!document.body.classList.contains('admin-menu-ouvert')));
    voile.addEventListener('click', () => ouvrir(false));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('admin-menu-ouvert')) { ouvrir(false); burger.focus(); }
    });
    // liens réglés dans Paramètres (registre) : ni dans la page ni dans le dépôt, servis aux seuls comptes validés
    socle.api('/api/outils').then(o => {
      for (const l of GESTION_NAV.filter(x => x.regle && o[x.regle])) {
        const lien = document.createElement('a');
        lien.className = 'lien-onglet';
        lien.href = o[l.regle];
        lien.target = '_blank';
        lien.rel = 'noopener';
        lien.innerHTML = `${ico(l.icone)}<span>${socle.esc(l.label)}</span>`;
        barre.querySelector('.admin-nav').append(lien);
      }
    }).catch(() => {});
    const main = document.querySelector('main.admin-contenu');
    const coque = document.createElement('div');
    coque.className = 'admin-shell';
    main.id ||= 'contenu';
    main.tabIndex = -1;
    main.replaceWith(coque);
    coque.append(haut, voile, barre, main);
    // lien d'évitement : au clavier, le premier Tab propose de sauter le menu
    const evitement = document.createElement('a');
    evitement.className = 'evitement';
    evitement.href = `#${main.id}`;
    evitement.textContent = 'Aller au contenu';
    document.body.prepend(evitement);
    document.body.classList.add('page-agents', 'admin-connecte');
    fondAnime();
    enService(barre);
    tablesAdaptatives(main);
    // messagerie interne, sur toutes les pages (chargée ici plutôt qu'inscrite dans chaque page)
    const script = document.createElement('script');
    script.src = '/gestion/messagerie.js';
    script.onload = () => demarrerMessagerie(moi);
    document.head.append(script);
    return moi;
  },

  // message dans une zone de la page (texte seulement, jamais de HTML) ; type : 'succes' ou 'erreur'
  message(zone, texte, type = 'erreur') {
    const el = typeof zone === 'string' ? document.getElementById(zone) : zone;
    if (!el) return;
    el.textContent = '';
    if (!texte) return;
    const div = document.createElement('div');
    div.className = `message message-${type === 'succes' ? 'succes' : 'erreur'}`;
    div.textContent = texte;
    el.append(div);
  },

  // Confirmation dans la page (aucune boîte de dialogue du navigateur : l'ordinateur en jeu ne les affiche pas).
  // libelle : le bouton dit l'action (« Supprimer l'annonce »), jamais « Confirmer » ; danger = false pour une action
  // qui ne détruit rien (bouton doré). Le focus reste dans la fenêtre, Échap annule, puis le focus revient où il était.
  confirmer(texte, titre = 'Confirmer', libelle = 'Confirmer', { danger = true } = {}) {
    return new Promise(resolve => {
      const avant = document.activeElement;
      const fond = document.createElement('div');
      fond.className = 'modale-fond';
      fond.innerHTML = `<div class="modale" style="max-width:420px;" role="alertdialog" aria-modal="true" aria-labelledby="confirmer-titre" aria-describedby="confirmer-texte">
        <div class="modale-entete"><h2 class="modale-titre" id="confirmer-titre"></h2></div>
        <p style="margin-bottom:26px;" id="confirmer-texte"></p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button type="button" class="btn btn-fantome" style="flex:1;" data-non>Annuler</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-or'}" style="flex:1;" data-oui></button>
        </div></div>`;
      fond.querySelector('h2').textContent = titre;
      fond.querySelector('p').textContent = texte;
      fond.querySelector('[data-oui]').textContent = libelle;
      const boutons = [...fond.querySelectorAll('button')];
      const fin = ok => { document.removeEventListener('keydown', clavier, true); fond.remove(); avant?.focus?.(); resolve(ok); };
      const clavier = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); }
        else if (e.key === 'Tab') {   // le focus boucle entre les deux boutons : la page derrière reste hors d'atteinte
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
};

// Tableaux adaptatifs : un tableau (.table-admin) qui ne tient plus dans sa largeur devient une grille de cartes
// (classe en-cartes, styles dans gestion.css) au lieu de défiler de côté. Chaque cellule reçoit l'intitulé de sa
// colonne (data-libelle, tiré de l'en-tête) ; la colonne titre (th[data-titre], sinon la première nommée) ouvre la
// carte, sans intitulé ; une colonne sans nom (actions, vignette) prend toute la largeur. Recalculé quand la largeur
// change ou que le tableau est redessiné.
const SANS_LIBELLE = /^(actions?)?$/i;
function tablesAdaptatives(racine) {
  const etiqueter = table => {
    const ths = [...(table.tHead?.rows[0]?.cells || [])];
    const noms = ths.map(th => (SANS_LIBELLE.test(th.textContent.trim()) ? '' : th.textContent.trim()));
    let titre = ths.findIndex(th => th.hasAttribute('data-titre'));
    if (titre < 0) titre = noms.findIndex(Boolean);
    for (const tbody of table.tBodies) for (const tr of tbody.rows) {
      if (tr.cells.length !== ths.length) continue;   // ligne d'état (« Aucun… », colspan) : pleine largeur telle quelle
      [...tr.cells].forEach((td, i) => {
        if (i === titre) td.classList.add('cellule-titre');
        else if (noms[i] && !td.hasAttribute('data-libelle')) td.dataset.libelle = noms[i];
      });
    }
  };
  // mesure en mode tableau (synchrone : rien n'est affiché entre les deux), cartes si la largeur dépasse
  const ajuster = table => {
    table.classList.remove('en-cartes');
    table.parentElement.classList.remove('contient-cartes');
    const trop = table.offsetWidth > table.parentElement.clientWidth + 1;
    table.classList.toggle('en-cartes', trop);
    table.parentElement.classList.toggle('contient-cartes', trop);   // la carte qui l'entoure s'efface derrière les cartes
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
  racine.querySelectorAll('table.table-admin').forEach(suivre);
  // tableaux ajoutés plus tard par les scripts de la page (onglets, fenêtres)
  new MutationObserver(() => racine.querySelectorAll('table.table-admin').forEach(suivre)).observe(racine, { childList: true, subtree: true });
}

// Compte illisible (serveur arrêté, trop de requêtes, coupure) : la page dit pourquoi et propose de réessayer, au lieu
// de rester vide. Une session expirée est déjà renvoyée vers la connexion par socle.api().
function erreurDeChargement(main, e) {
  if (!main) return;
  const boite = document.createElement('div');
  boite.className = 'etat-vide';
  const texte = document.createElement('p');
  texte.textContent = `La page n’a pas pu se charger : ${e.message}`;
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'btn btn-or';
  bouton.textContent = 'Réessayer';
  bouton.addEventListener('click', () => location.reload());
  boite.append(texte, bouton);
  main.replaceChildren(boite);
}

function initiales(nom) {
  const mots = String(nom || '').trim().split(/\s+/).filter(Boolean);
  return mots.length ? mots.slice(0, 2).map(m => m[0].toUpperCase()).join('') : '?';
}

// Fond animé « aurore » (three.js, servi par le site). Jamais dans l'ordinateur en jeu (GPU partagé avec le jeu) ;
// sans WebGL, le fond sombre habituel suffit.
async function fondAnime() {
  if (window.D8_EN_JEU) return;
  const toile = document.createElement('canvas');
  toile.id = 'aurora-bg';
  toile.setAttribute('aria-hidden', 'true');
  document.body.prepend(toile);
  try {
    const THREE = await import('/assets/vendor/three.module.min.js');
    const { mountAurora } = await import('/assets/js/aurora.js');
    window.__aurora = mountAurora(THREE, { canvas: toile, intensity: 0.5, stars: 0.7, ridge: false, parallax: true, pixelRatio: 0.6 });
  } catch { toile.remove(); }
}
