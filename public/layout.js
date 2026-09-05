// ============================================================================
// Dynasty 8 — éléments communs à toutes les pages publiques
// (en-tête, pied de page, petites fonctions utilitaires)
// ============================================================================

// Adresse d'invitation Discord du serveur — à remplacer par la vraie une fois disponible.
const LIEN_DISCORD = "https://discord.com/invite/zCsPrrR3uw";

// Menu volontairement resserré à 6 entrées (contre 9 avant) pour rester lisible
// d'un coup d'œil : "Catalogue" regroupe Intérieurs/Garages/Exclusifs, "Agence"
// regroupe Services/Équipe/FAQ. Aucune page n'est supprimée, seulement
// regroupée sous un sous-menu — `clesEnfants` liste les `cle` de pages qui
// doivent garder ce lien parent surligné (voir injecterEntete ci-dessous).
const LIENS_NAV = [
  { href: "/accueil.html", texte: "Accueil", cle: "accueil" },
  { href: "/interieurs.html", texte: "Catalogue", cle: "catalogue", clesEnfants: ["interieurs", "garages", "exclusifs"], sousMenu: [
      { href: "/habitation.html?meuble=1", texte: "Intérieurs meublés" },
      { href: "/habitation.html?meuble=0", texte: "Intérieurs non meublés" },
      { href: "/garages.html", texte: "Garages" },
      { href: "/exclusifs.html", texte: "Exclusifs" },
    ] },
  { href: "/coherences.html", texte: "Cohérences", cle: "coherences", sousMenu: [
      { href: "/coherence.html?zone=Habitation", texte: "Cohérence Habitation" },
      { href: "/coherence.html?zone=Garage", texte: "Cohérence Garage" },
      { href: "/coherence.html?zone=Cayo+Perico", texte: "Cohérence Cayo Perico" },
      { href: "/coherence.html?zone=Roxwood", texte: "Cohérence Roxwood" },
    ] },
  { href: "/vip.html", texte: "VIP PLUS", cle: "vip" },
  { href: "/services.html", texte: "Agence", cle: "agence", clesEnfants: ["services", "equipe", "faq"], sousMenu: [
      { href: "/services.html", texte: "Nos services" },
      { href: "/equipe.html", texte: "Notre équipe" },
      { href: "/faq.html", texte: "FAQ" },
    ] },
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
    // Un lien qui regroupe plusieurs pages (ex. "Catalogue") reste surligné
    // tant qu'on est sur l'une des pages qu'il regroupe, pas seulement la sienne.
    const actif = l.cle === cleActive || (l.clesEnfants && l.clesEnfants.includes(cleActive));
    if (l.sousMenu) {
      const sousLiens = l.sousMenu.map((s) => `<a href="${s.href}">${s.texte}</a>`).join("");
      return `
        <div class="nav-avec-sous-menu">
          <a href="${l.href}" class="nav-lien-principal" ${actif ? 'aria-current="page"' : ""}>${l.texte} <span class="nav-chevron" aria-hidden="true">⌄</span></a>
          <div class="nav-sous-menu">${sousLiens}</div>
        </div>`;
    }
    const attrsExterne = l.externe ? 'target="_blank" rel="noopener"' : "";
    return `<a href="${l.href}" ${attrsExterne} ${actif ? 'aria-current="page"' : ""}>${l.texte}</a>`;
  }).join("");
  monte.innerHTML = `
    <div class="entete-barre">
      <a href="/accueil.html" class="logo">
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
          <a href="/accueil.html" class="logo" style="margin-bottom:14px;">${logoImg("logo-pied")}</a>
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
  { nom: "Développeur web", niveau: "direction", couleur: "#7fd4c9" },
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

// ---------------------------------------------------------------------------
// Menu déroulant personnalisé (habillage d'un <select> natif)
// ---------------------------------------------------------------------------
// Un <select> HTML standard ne peut pas être stylé (la petite liste qui
// s'ouvre reste toujours grise, avec la police du système). ameliorerSelect()
// habille un <select> existant : il reste dans la page (toujours utilisable
// au clavier, toujours ce qui porte la vraie valeur du formulaire), mais on
// intercepte son ouverture pour afficher à la place une liste flottante
// dessinée avec le thème du site. Un seul menu peut être ouvert à la fois.

let D8_SELECT_OUVERT = null; // { select, flottant, enveloppe }

function fermerSelectOuvert() {
  if (!D8_SELECT_OUVERT) return;
  D8_SELECT_OUVERT.flottant.classList.add("cache");
  D8_SELECT_OUVERT.enveloppe.classList.remove("ouvert");
  D8_SELECT_OUVERT = null;
}

document.addEventListener("mousedown", (ev) => {
  if (D8_SELECT_OUVERT && !D8_SELECT_OUVERT.flottant.contains(ev.target) && ev.target !== D8_SELECT_OUVERT.select) {
    fermerSelectOuvert();
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") fermerSelectOuvert();
});
window.addEventListener("resize", fermerSelectOuvert);
// "true" (phase de capture) est nécessaire pour détecter un défilement de la
// page ou d'un conteneur (ex: le tableau des comptes), mais ça capte AUSSI le
// défilement à l'intérieur du menu flottant lui-même (sa propre liste
// d'options) : dans ce cas précis, il ne faut surtout pas le refermer.
window.addEventListener("scroll", (ev) => {
  if (D8_SELECT_OUVERT && D8_SELECT_OUVERT.flottant.contains(ev.target)) return;
  fermerSelectOuvert();
}, true);

// `pastille` (optionnel) : fonction qui renvoie une couleur CSS pour une petite
// puce ronde devant chaque option (utilisé pour les grades). `portee`
// (optionnel) : marque la liste flottante pour pouvoir la nettoyer plus tard
// (voir nettoyerSelectsPortee), utile pour un <select> recréé dynamiquement.
function ameliorerSelect(select, pastille, portee) {
  if (!select || select.dataset.ameliore) return;
  select.dataset.ameliore = "1";

  const enveloppe = document.createElement("span");
  enveloppe.className = "d8-select-enveloppe";
  select.parentNode.insertBefore(enveloppe, select);
  enveloppe.appendChild(select);

  const flottant = document.createElement("div");
  flottant.className = "d8-select-flottant cache";
  if (portee) flottant.dataset.portee = portee;
  document.body.appendChild(flottant);

  function rendreOptions() {
    flottant.innerHTML = Array.from(select.options).map((o) => `
      <div class="d8-select-option ${o.value === select.value ? "selectionnee" : ""}" data-valeur="${echapper(o.value)}">
        ${pastille ? `<span class="d8-select-pastille" style="background:${pastille(o.value)};"></span>` : ""}
        <span>${echapper(o.textContent)}</span>
      </div>`).join("");
    flottant.querySelectorAll("[data-valeur]").forEach((el) => {
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (select.value !== el.dataset.valeur) {
          select.value = el.dataset.valeur;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        fermerSelectOuvert();
      });
    });
  }

  function positionner() {
    const r = select.getBoundingClientRect();
    const hauteurEstimee = Math.min(select.options.length * 38 + 12, 260);
    const largeur = Math.max(Math.round(r.width), 230);
    // On ne laisse jamais le menu déborder à droite de la fenêtre.
    const gauche = Math.min(Math.round(r.left), window.innerWidth - largeur - 8);
    flottant.style.left = Math.max(8, gauche) + "px";
    flottant.style.width = largeur + "px";
    if (r.bottom + hauteurEstimee > window.innerHeight && r.top > hauteurEstimee) {
      flottant.style.top = Math.round(r.top - hauteurEstimee - 6) + "px";
    } else {
      flottant.style.top = Math.round(r.bottom + 6) + "px";
    }
  }

  function ouvrir() {
    if (select.disabled) return;
    rendreOptions();
    positionner();
    flottant.classList.remove("cache");
    enveloppe.classList.add("ouvert");
    D8_SELECT_OUVERT = { select, flottant, enveloppe };
  }

  select.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    select.focus();
    if (D8_SELECT_OUVERT && D8_SELECT_OUVERT.select === select) fermerSelectOuvert();
    else ouvrir();
  });
  select.addEventListener("keydown", (ev) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(ev.key)) {
      ev.preventDefault();
      if (!(D8_SELECT_OUVERT && D8_SELECT_OUVERT.select === select)) ouvrir();
    }
  });
}

// À appeler juste avant de recréer des <select> dynamiques (ex: le tableau des
// comptes, reconstruit à chaque rechargement) : retire les listes flottantes
// orphelines de la fois précédente pour ne pas les accumuler dans la page.
function nettoyerSelectsPortee(portee) {
  document.querySelectorAll(`.d8-select-flottant[data-portee="${portee}"]`).forEach((el) => el.remove());
}

// =============================================================================
// Cartes « hub » en 3D + poussière d'or de fond (toutes les pages publiques).
// - habillerCartesHub() : bascule vers la souris, reflet qui suit le curseur,
//   apparition en cascade, et remplacement des emojis par des icônes dorées au
//   trait (mêmes formes que dans l'espace agents). Aucune modification de HTML
//   nécessaire sur les pages : tout se fait sur la classe .carte-hub.
// - demarrerPoussiereOr() : canvas WebGL fixe derrière la page (Three.js chargé
//   à la demande depuis /vendor). Ignoré sur l'espace agents (déjà l'aurore),
//   sans WebGL, ou si la personne a demandé de réduire les animations.
// =============================================================================
const D8_ICONES_HUB = {
  "🏠": '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  "🚗": '<path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5H3z"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/><path d="M5 13h14"/>',
  "💎": '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M12 9l-3 12M12 9l3 12"/>',
  "🧭": '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  "⭐": '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  "🏝️": '<path d="M12 21c4-5 7-8.5 7-12a7 7 0 1 0-14 0c0 3.5 3 7 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  "🌲": '<path d="M12 3l5 8h-3l4 6H6l4-6H7z"/><path d="M12 17v4"/>',
  "🛋️": '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 12a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 2-2"/><path d="M5 17v2M19 17v2"/>',
  "📦": '<path d="M3 8l9-4 9 4-9 4z"/><path d="M3 8v9l9 4 9-4V8"/><path d="M12 12v9"/>',
};
const D8_FLECHE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function habillerCartesHub() {
  const cartes = document.querySelectorAll(".carte-hub");
  if (!cartes.length) return;
  const reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  cartes.forEach((c, i) => {
    // icône : emoji -> trait doré (si on connaît l'emoji ; sinon on le laisse)
    const ic = c.querySelector(".icone");
    if (ic && !ic.querySelector("svg")) {
      const cle = Object.keys(D8_ICONES_HUB).find((k) => ic.textContent.trim().startsWith(k.replace("️", "")) || ic.textContent.trim() === k);
      if (cle) ic.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${D8_ICONES_HUB[cle]}</svg>`;
    }
    // flèche : "Texte →" -> "Texte" + icône
    const fl = c.querySelector(".carte-hub-fleche");
    if (fl && !fl.querySelector("svg")) fl.innerHTML = fl.textContent.replace(/\s*→\s*$/, "") + " " + D8_FLECHE_SVG;
    // apparition en cascade (réinitialisée par grille)
    const grille = c.closest(".grille-hub");
    const idx = grille ? Array.prototype.indexOf.call(grille.children, c) : i;
    c.style.setProperty("--i", String(Math.max(0, idx)));
    c.classList.add("carte-hub--anim");
    // bascule + reflet
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.style.setProperty("--mx", (px * 100) + "%"); c.style.setProperty("--my", (py * 100) + "%"); c.style.setProperty("--lum", "1");
      if (!reduit) { c.style.setProperty("--ry", ((px - 0.5) * 14) + "deg"); c.style.setProperty("--rx", ((0.5 - py) * 12) + "deg"); }
    });
    c.addEventListener("pointerleave", () => { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); c.style.setProperty("--lum", "0"); });
  });
}

function demarrerPoussiereOr() {
  if (document.body.classList.contains("page-agents")) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (document.querySelector(".d8-poussiere")) return;
  import("/vendor/three.module.min.js").then((THREE) => {
    const canvas = document.createElement("canvas");
    canvas.className = "d8-poussiere"; canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" }); }
    catch (e) { canvas.remove(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, 0.1, 100); cam.position.z = 9;
    const N = 600, pos = new Float32Array(N * 3), seed = new Float32Array(N), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i*3] = (Math.random()*2-1)*16; pos[i*3+1] = (Math.random()*2-1)*9; pos[i*3+2] = (Math.random()*2-1)*5; seed[i] = Math.random()*6.283; sz[i] = 0.35 + Math.random()*1.1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    const u = { uTime: { value: 0 }, uPix: { value: 1 }, uScroll: { value: 0 } };
    scene.add(new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime,uPix,uScroll;attribute float aSeed,aSize;varying float vA;
        void main(){vec3 p=position;p.y=mod(p.y+uTime*0.25+uScroll*(0.6+0.4*fract(aSeed))+9.0,18.0)-9.0;p.x+=sin(uTime*0.2+aSeed)*0.5;
        vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=aSize*uPix*(30.0/-mv.z);vA=0.25+0.75*(0.5+0.5*sin(uTime*1.2+aSeed*3.0));}`,
      fragmentShader: `precision highp float;varying float vA;void main(){vec2 c=gl_PointCoord-0.5;float d=length(c);if(d>0.5)discard;float gl=smoothstep(0.5,0.0,d);gl_FragColor=vec4(mix(vec3(0.75,0.5,0.24),vec3(0.98,0.9,0.66),gl),gl*gl*vA*0.7);}` })));
    function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); u.uPix.value = (h * renderer.getPixelRatio()) / 900; }
    addEventListener("resize", resize); resize();
    const t0 = performance.now();
    (function frame(now) { requestAnimationFrame(frame); u.uTime.value = (now - t0) / 1000; u.uScroll.value = scrollY / 300; renderer.render(scene, cam); })(t0);
  }).catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { habillerCartesHub(); demarrerPoussiereOr(); });
} else {
  habillerCartesHub(); demarrerPoussiereOr();
}
