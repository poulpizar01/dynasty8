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
  { href: "/services.html", texte: "Services", cle: "services" },
  { href: "/equipe.html", texte: "Équipe", cle: "equipe" },
  { href: "/faq.html", texte: "FAQ", cle: "faq" },
  { href: LIEN_DISCORD, texte: "Nous contacter", cle: "contact", externe: true },
];

function logoImg(cssClass) {
  return `<img src="/img/logo-full.png" alt="Dynasty 8" class="${cssClass || ""}">`;
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
      <a href="/" class="logo">${logoImg("logo-entete")}</a>
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
        <span>© ${annee} Dynasty 8 — Serveur RP FlashbackFA. Univers fictif, sans lien avec des biens réels.</span>
        <span>Site non officiel réalisé pour la communauté.</span>
      </div>
    </div>`;
}

function initialiserLayout(cleActive) {
  injecterEntete(cleActive);
  injecterPied();
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
