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
    burger.addEventListener('click', () => burger.setAttribute('aria-expanded', String(rail.classList.toggle('is-open'))));
    rail.querySelector('[data-deconnexion]').addEventListener('click', () => socle.deconnexion());
    const coque = document.createElement('div');
    coque.className = 'coque';
    const main = document.querySelector('main.contenu');
    main.replaceWith(coque);
    coque.append(rail, main);
    return moi;
  },

  // message d'erreur ou de réussite dans un élément de la page (texte seulement, jamais de HTML)
  message(el, texte, ok = false) {
    el.hidden = !texte;
    el.textContent = texte || '';
    el.classList.toggle('message--ok', ok);
  },
};
