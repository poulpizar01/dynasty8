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

window.gestion = {
  // construit la coque autour de <main class="contenu"> et renvoie le compte connecté
  async coque() {
    const moi = await socle.moi();
    const page = location.pathname.split('/').pop() || 'accueil.html';
    const rail = document.createElement('aside');
    rail.className = 'rail';
    rail.innerHTML = `
      <a class="rail__marque" href="accueil.html"><img src="/assets/logo.png" alt="" width="32" height="32"><span>${socle.esc(socle.nomSite)}</span></a>
      <button class="rail__burger" type="button" aria-label="Menu" aria-expanded="false">☰</button>
      <nav class="rail__nav">${GESTION_NAV.filter(l => !l.permission || socle.peut(moi, l.permission)).map(l =>
        `<a href="${l.href}"${l.href === page ? ' aria-current="page"' : ''}>${socle.esc(l.label)}</a>`).join('')}
        <a href="/">Site public</a>
      </nav>
      <div class="rail__moi">
        ${moi.avatar ? `<img src="${socle.esc(moi.avatar)}" alt="">` : '<span class="avatar"></span>'}
        <div><strong>${socle.esc(moi.nom || moi.pseudo)}</strong><small>${socle.esc(moi.grade?.libelle || (moi.proprietaire ? 'Propriétaire' : 'Sans grade'))}</small></div>
        <button class="btn btn--petit" type="button" data-deconnexion>Quitter</button>
      </div>`;
    const burger = rail.querySelector('.rail__burger');
    const ouvrir = ouvert => { rail.classList.toggle('is-open', ouvert); burger.setAttribute('aria-expanded', String(ouvert)); };
    burger.addEventListener('click', () => ouvrir(!rail.classList.contains('is-open')));
    rail.addEventListener('keydown', e => { if (e.key === 'Escape' && rail.classList.contains('is-open')) { ouvrir(false); burger.focus(); } });
    rail.querySelector('[data-deconnexion]').addEventListener('click', () => socle.deconnexion());
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
    return moi;
  },

  // Confirmation dans la page : l'ordinateur en jeu n'affiche ni confirm() ni alert() (docs/folkos.md).
  // libelle : le bouton dit l'action (« Supprimer le grade »), jamais « OK » ; danger : bouton rouge (action destructive).
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

  // message d'erreur ou de réussite dans un élément de la page (texte seulement, jamais de HTML)
  message(el, texte, ok = false) {
    el.hidden = !texte;
    el.textContent = texte || '';
    el.classList.toggle('message--ok', ok);
  },
};
