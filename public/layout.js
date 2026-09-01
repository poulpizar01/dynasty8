// ============================================================================
// Dynasty 8 — éléments communs à toutes les pages publiques
// (en-tête, pied de page, petites fonctions utilitaires)
// ============================================================================

// Adresse d'invitation Discord du serveur — à remplacer par la vraie une fois disponible.
const LIEN_DISCORD = "https://discord.com/invite/zCsPrrR3uw";

const LIENS_NAV = [
  { href: "/", texte: "Accueil", cle: "accueil" },
  { href: "/interieurs.html", texte: "Les Intérieurs", cle: "interieurs", sousMenu: [
      { href: "/habitation.html?meuble=1", texte: "Intérieurs Meublés" },
      { href: "/habitation.html?meuble=0", texte: "Intérieurs Non Meublés" },
    ] },
  { href: "/garages.html", texte: "Garages", cle: "garages" },
  { href: "/coherences.html", texte: "Cohérences", cle: "coherences", sousMenu: [
      { href: "/coherence.html?zone=Habitation", texte: "Cohérence Habitation" },
      { href: "/coherence.html?zone=Garage", texte: "Cohérence Garage" },
      { href: "/coherence.html?zone=Cayo+Perico", texte: "Cohérence Cayo Perico" },
      { href: "/coherence.html?zone=Roxwood", texte: "Cohérence Roxwood" },
    ] },
  { href: "/exclusifs.html", texte: "Exclusifs", cle: "exclusifs" },
  { href: "/vip.html", texte: "VIP", cle: "vip" },
  { href: "/services.html", texte: "Services", cle: "services" },
  { href: "/equipe.html", texte: "Équipe", cle: "equipe" },
  { href: "/faq.html", texte: "FAQ", cle: "faq" },
  { href: LIEN_DISCORD, texte: "Nous contacter", cle: "contact", externe: true },
];

function logoImg(cssClass) {
  return `<img src="/img/logo-full.png" alt="Dynasty 8" class="${cssClass || ""}">`;
}

// Petit emblème SVG (losange à pointe centrale) — le motif signature du thème
// "Marbre & Or", réutilisé dans l'en-tête et le pied de page. En ligne (pas un
// fichier séparé) pour hériter directement de la couleur CSS ambiante.
function embleme(taille, cssClass) {
  const t = taille || 44;
  return `<svg class="${cssClass || ""}" width="${t}" height="${t}" viewBox="0 0 44 44" fill="none" aria-hidden="true">
    <path d="M22 3 L39 22 L22 41 L5 22 Z" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="22" cy="22" r="3" stroke="currentColor" stroke-width="1.2"/>
  </svg>`;
}

function injecterEntete(cleActive) {
  const monte = document.getElementById("site-entete");
  if (!monte) return;
  const liens = LIENS_NAV.map((l) => {
    if (l.sousMenu) {
      const sousLiens = l.sousMenu.map((s) => `<a href="${s.href}">${s.texte}</a>`).join("");
      return `
        <div class="nav-avec-sous-menu">
          <a href="${l.href}" class="nav-lien-principal" ${l.cle === cleActive ? 'aria-current="page"' : ""}>${l.texte} <span class="nav-chevron" aria-hidden="true">⌄</span></a>
          <div class="nav-sous-menu">${sousLiens}</div>
        </div>`;
    }
    const attrsExterne = l.externe ? 'target="_blank" rel="noopener"' : "";
    return `<a href="${l.href}" ${attrsExterne} ${l.cle === cleActive ? 'aria-current="page"' : ""}>${l.texte}</a>`;
  }).join("");
  monte.innerHTML = `
    <div class="entete-barre">
      <a href="/" class="logo">
        <img src="/img/logo-mark.png" alt="Dynasty 8" class="logo-marque">
        <span class="logo-filet" aria-hidden="true"></span>
        <span class="logo-texte">Dynasty 8</span>
      </a>
      <nav class="nav-principale" id="nav-mobile">${liens}</nav>
      <div class="nav-cta">
        <button class="bouton-menu" id="bouton-menu" aria-label="Ouvrir le menu">☰</button>
        <a href="/admin.html" class="btn btn-fantome btn-petit">Espace agents</a>
      </div>
    </div>`;
  const bouton = document.getElementById("bouton-menu");
  const nav = document.getElementById("nav-mobile");
  if (bouton && nav) bouton.addEventListener("click", () => nav.classList.toggle("ouvert"));

  // En-tête transparente qui devient opaque (fond flouté) dès qu'on scrolle un peu.
  const bascule = () => monte.classList.toggle("entete-scrolled", window.scrollY > 24);
  bascule();
  window.addEventListener("scroll", bascule, { passive: true });
}

function injecterPied() {
  const monte = document.getElementById("site-pied");
  if (!monte) return;
  const annee = new Date().getFullYear();
  monte.innerHTML = `
    <div class="pied-filet" aria-hidden="true">${embleme(36, "pied-embleme")}</div>
    <div class="conteneur">
      <div class="pied-grille">
        <div>
          <a href="/" class="logo" style="margin-bottom:14px;">${logoImg("logo-pied")}</a>
          <p>Agence immobilière officielle de Los Santos. Habitations, garages et propriétés d'exception pour tous les résidents du serveur.</p>
        </div>
        <div>
          <h4>Catégories</h4>
          <ul>
            <li><a href="/interieurs.html">Les Intérieurs</a></li>
            <li><a href="/garages.html">Garages</a></li>
            <li><a href="/coherences.html">Cohérences</a></li>
            <li><a href="/exclusifs.html">Exclusifs</a></li>
            <li><a href="/vip.html">Avantages VIP</a></li>
          </ul>
        </div>
        <div>
          <h4>Agence</h4>
          <ul>
            <li><a href="/services.html">Nos services</a></li>
            <li><a href="/equipe.html">Notre équipe</a></li>
            <li><a href="/faq.html">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h4>Nous contacter</h4>
          <ul>
            <li><a href="${LIEN_DISCORD}" id="lien-discord" target="_blank" rel="noopener">Discord du serveur</a></li>
            <li><a href="https://map.flashbackfa.fr/" target="_blank" rel="noopener">WebMap</a></li>
            <li><a href="/admin.html">Espace agents</a></li>
          </ul>
        </div>
      </div>
      <div class="pied-bas">
        <span>© ${annee} Dynasty 8 — Serveur RP FlashbackFA. Univers fictif : biens, prix et transactions présentés n'ont aucune valeur réelle. Projet communautaire non affilié à Rockstar Games ou Take-Two Interactive.</span>
        <span>Site non officiel réalisé pour la communauté. · <a href="/confidentialite.html">Confidentialité</a></span>
      </div>
      <div class="pied-credit">
        <img src="/img/roxwood-logo.png" alt="" class="pied-credit-logo" width="28" height="26" loading="lazy">
        <span>Développé par <strong>Roxwood Network</strong></span>
        <span class="pied-credit-sep" aria-hidden="true">|</span>
        <a href="https://roxwood-network.fbfa.fr/" target="_blank" rel="noopener">Site</a>
        <span class="pied-credit-sep" aria-hidden="true">|</span>
        <a href="https://discord.com/invite/dDAFWxeU8" target="_blank" rel="noopener">Discord</a>
      </div>
    </div>`;
}

// Double filet or fixe en bordure de la fenêtre (le "cadre" du thème Marbre & Or) —
// purement décoratif, jamais au-dessus d'un élément cliquable (z-index sous l'en-tête,
// pointer-events désactivés) et masqué automatiquement en-dessous de 480px.
function injecterCadre() {
  if (document.querySelector(".d8-frame")) return;
  const cadre = document.createElement("div");
  cadre.className = "d8-frame";
  cadre.setAttribute("aria-hidden", "true");
  document.body.appendChild(cadre);

  ajusterCadre();

  // Le haut du cadre doit toujours rester juste sous l'en-tête, jamais le
  // traverser : on recalcule dès que la hauteur de l'en-tête change (menu qui
  // repasse à la ligne, menu mobile ouvert, redimensionnement, polices qui
  // finissent de charger après le premier rendu).
  const entete = document.querySelector(".entete");
  if (entete && "ResizeObserver" in window) {
    new ResizeObserver(ajusterCadre).observe(entete);
  } else {
    window.addEventListener("resize", ajusterCadre);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(ajusterCadre);
  }
}

// Mesure la hauteur réelle de l'en-tête et pousse le haut du cadre juste en
// dessous (petite marge de 10px), via la variable CSS --d8-frame-top.
function ajusterCadre() {
  const entete = document.querySelector(".entete");
  const cadre = document.querySelector(".d8-frame");
  if (!entete || !cadre) return;
  const hauteur = entete.getBoundingClientRect().height;
  cadre.style.setProperty("--d8-frame-top", (hauteur + 10) + "px");
}

function initialiserLayout(cleActive) {
  injecterEntete(cleActive);
  injecterPied();
  injecterCadre();
  demarrerDiaporamaHero();
  // Grilles déjà présentes dans le HTML statique au chargement (équipe, services,
  // pages "hub"). Les grilles de biens (cartes chargées depuis l'API) sont
  // révélées séparément par biens.js, une fois injectées dans la page.
  reveler(".carte-hub, .carte-service, .carte-membre");
}

// Diaporama du fond du hero d'accueil (page /index.html uniquement) : les
// photos empilées dans #hero-ville (voir index.html) alternent en fondu
// enchaîné toutes les 8 secondes, en repassant simplement la classe
// .hero-ville-active de l'une à l'autre (le fondu est géré en CSS). Ne fait
// rien s'il n'y a pas ce bloc sur la page, ou une seule photo, ou si la
// personne a demandé de réduire les animations.
function demarrerDiaporamaHero() {
  const images = document.querySelectorAll("#hero-ville img");
  if (images.length < 2) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let index = Array.prototype.findIndex.call(images, (img) => img.classList.contains("hero-ville-active"));
  if (index < 0) index = 0;
  setInterval(() => {
    images[index].classList.remove("hero-ville-active");
    index = (index + 1) % images.length;
    images[index].classList.add("hero-ville-active");
  }, 8000);
}

// Légère apparition au défilement (fondu + léger déplacement vers le haut), jouée une
// seule fois par élément et désactivée automatiquement si la personne a demandé de
// réduire les animations. `racine` limite la recherche à un conteneur précis (utile
// juste après avoir injecté de nouvelles cartes) ; par défaut on cherche sur toute la page.
function reveler(selecteur, racine) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;
  const elements = (racine || document).querySelectorAll(selecteur);
  if (!elements.length) return;
  const observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      if (!entree.isIntersecting) return;
      entree.target.classList.add("d8-visible");
      observateur.unobserve(entree.target);
    });
  }, { threshold: 0.15 });
  elements.forEach((el, i) => {
    el.classList.add("d8-reveal");
    el.style.transitionDelay = (i % 12) * 60 + "ms";
    observateur.observe(el);
  });
}

// ---- petites fonctions utilitaires partagées ----

function formaterPrix(valeur) {
  const n = Math.round(Number(valeur) || 0);
  // Espace bien visible tous les 3 chiffres (milliers, millions...) : on ne
  // laisse pas le navigateur choisir l'espacement (toLocaleString utilise une
  // espace fine à peine visible en gras) — on l'écrit nous-même.
  const chiffres = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  // "HT" (hors taxe) : les prix du catalogue Dynasty 8 sont donnés hors taxe,
  // comme dans le règlement officiel des cohérences.
  return (n < 0 ? "-" : "") + chiffres + " $ HT";
}

function echapper(texte) {
  const d = document.createElement("div");
  d.textContent = texte == null ? "" : String(texte);
  return d.innerHTML;
}

// Mise en forme simple des descriptions de biens : **gras** et *italique*,
// plus les retours à la ligne. Le texte est d'abord échappé (echapper) donc
// une balise HTML tapée par un agent ne peut jamais s'exécuter — seuls ces
// deux marqueurs sont reconnus, tout le reste reste du texte brut affiché
// tel quel (les emoji n'ont besoin d'aucun traitement particulier, ce sont
// de simples caractères).
function analyserDescription(texte) {
  if (!texte) return "";
  return echapper(texte)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

// Même texte mais sans les marqueurs **/*, pour les endroits (cartes d'annonces)
// où seul un extrait en texte brut est affiché.
function texteSansMarquage(texte) {
  return (texte || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

async function appelAPI(chemin, options) {
  const reponse = await fetch(chemin, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let corps = null;
  try {
    corps = await reponse.json();
  } catch (e) {
    corps = null;
  }
  if (!reponse.ok) {
    const erreur = new Error((corps && corps.erreur) || "Une erreur est survenue.");
    erreur.status = reponse.status;
    erreur.corps = corps;
    throw erreur;
  }
  return corps;
}

const ETIQUETTES_CATEGORIE = {
  habitation: "Habitation",
  garage: "Garage",
};

// Les 17 sous-catégories possibles pour un bien "habitation" (utilisées par le
// formulaire d'admin et par les filtres de la page /habitation.html).
const SOUS_CATEGORIES_HABITATION = [
  "Eclipse Tower", "Tinsel Tower", "Villa", "Del Perro Heights", "Richards Majestic",
  "Weazel Plaza", "San Andreas", "Alta Street", "Maison", "Entrepôt", "Flat",
  "Bureau", "Headquarter", "Caravane", "Motel", "Appartement", "Duplex", "Bar", "Autre",
];

// Les 4 "cohérences" (zones RP) auxquelles un bien peut être rattaché.
const COHERENCES = ["Habitation", "Garage", "Cayo Perico", "Roxwood"];

// Les 10 grades de la hiérarchie Dynasty 8 (espace agents), du plus élevé au
// plus bas — même liste que côté serveur (src/index.js), à garder synchronisée.
// "niveau" détermine les droits réels : "direction" (accès total), "commercial"
// (annonces uniquement) ou "membre" (aucun accès, juste "Mon profil").
// "couleur" n'est utilisée que pour les badges de l'onglet "Comptes & accès".
const GRADES = [
  { nom: "Patron", niveau: "direction", couleur: "#e3a1a1" },
  { nom: "Co Patron", niveau: "direction", couleur: "#e3a1a1" },
  { nom: "Manager", niveau: "direction", couleur: "#e3a1a1" },
  { nom: "DRH", niveau: "direction", couleur: "#e3a1a1" },
  { nom: "Secrétaire de Direction", niveau: "direction", couleur: "#e3a1a1" },
  { nom: "Référent Immobilier", niveau: "commercial", couleur: "#c1a8e8" },
  { nom: "Agent Expert", niveau: "commercial", couleur: "#a3d9a5" },
  { nom: "Agent", niveau: "commercial", couleur: "#9dc6ea" },
  { nom: "Agent Novice", niveau: "commercial", couleur: "#bfe0f5" },
  { nom: "Stagiaire", niveau: "membre", couleur: "#f0b8a0" },
];
const NOMS_GRADES = GRADES.map((g) => g.nom);
const NIVEAU_PAR_GRADE = Object.fromEntries(GRADES.map((g) => [g.nom, g.niveau]));
function couleurGrade(nom) {
  const g = GRADES.find((x) => x.nom === nom);
  return g ? g.couleur : "#8a93b8";
}
