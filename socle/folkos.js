/* SOCLE — ordinateur en jeu (FolkOS, navigateur FiveM). Mutualisé : ne pas modifier dans un site.
   Ajouté par le serveur en tête de chaque page quand FOLKOS_HOTE est réglé (site.ts) ; aucune page n'a à l'inclure.
   Hors iframe (navigateur normal), ne fait rien. Dans l'iframe :
   - charge le SDK de l'opérateur (fbfa-game.js : clavier rendu au site dès qu'un champ a le focus, touche Échap laissée
     à la page ; fbfa-bridge.js : la barre d'adresse de FolkOS suit la page) ;
   - pose la classe « en-jeu » sur <html> : à tester par les pages pour couper ce qui coûte au GPU (WebGL, grosses
     animations), partagé avec le jeu ;
   - ouvre les liens target="_blank" et window.open() dans le cadre (en jeu, un nouvel onglet n'ouvre rien). */
(() => {
  const hote = document.currentScript?.dataset.hote;
  let enJeu = true;
  try { enJeu = window.self !== window.top; } catch { /* cadre d'une autre origine : en jeu */ }
  if (!enJeu || !hote) return;
  document.documentElement.classList.add('en-jeu');

  const charger = (nom, quandPret) => {
    const s = document.createElement('script');
    s.src = `${hote}/${nom}`;
    s.async = true;
    if (quandPret) s.onload = quandPret;
    s.onerror = () => { /* SDK indisponible : le site reste utilisable */ };
    document.head.appendChild(s);
  };
  charger('fbfa-game.js', () => {
    try { window.FBFAGame?.init?.({ typing: { mode: 'field' }, escape: false }); } catch { /* hors FiveM */ }
  });
  charger('fbfa-bridge.js');

  // délégation : couvre aussi les liens ajoutés plus tard par les scripts de la page
  document.addEventListener('click', e => { e.target.closest?.('a[target="_blank"]')?.removeAttribute('target'); }, true);
  window.open = url => { if (url) location.href = String(url); return null; };
})();
