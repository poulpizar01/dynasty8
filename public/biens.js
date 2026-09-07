// ============================================================================
// Dynasty 8 — affichage des annonces (biens) sur les pages publiques
// ============================================================================

function iconeCategorie(categorie) {
  const icones = { habitation: "🏠", garage: "🚗" };
  return icones[categorie] || "🏠";
}

// Un bien peut être proposé à la vente, à la location, ou aux deux en même temps
// (bien.dispo_vente / bien.dispo_location, chacun avec son propre prix).

// Étiquette de zone d'une carte : "sous-catégorie · cohérence" (ex: "Villa · Roxwood").
// Pour un garage sans sous-catégorie, la cohérence vaut souvent aussi "Garage" : dans ce
// cas on n'affiche le mot qu'une seule fois plutôt que "Garage · Garage".
function etiquetteZoneHTML(bien) {
  const principal = bien.sous_categorie || ETIQUETTES_CATEGORIE[bien.categorie] || "";
  const suffixe = bien.coherence && bien.coherence !== principal ? " · " + echapper(bien.coherence) : "";
  return echapper(principal) + suffixe;
}

function etiquetteTransaction(bien) {
  if (bien.dispo_vente && bien.dispo_location) return "Vente & Location";
  return bien.dispo_location ? "Location" : "Vente";
}

// La pastille "Location" seule change de couleur (bleu nuit + liseré or plutôt que
// rouge) : le rouge reste réservé aux annonces qui incluent une vente.
function classeBadgeTransaction(bien) {
  return bien.dispo_location && !bien.dispo_vente ? " badge-transaction--location" : "";
}

// Prix compact pour les cartes (carrousels, catalogue).
function prixCarteHTML(bien) {
  if (bien.dispo_vente && bien.dispo_location) {
    return `<span class="prix-double">
      <span class="prix-ligne"><span class="prix-etiquette">Vente</span><span class="prix-valeur">${formaterPrix(bien.prix)}</span></span>
      <span class="prix-ligne"><span class="prix-etiquette">Location</span><span class="prix-valeur">${formaterPrix(bien.prix_location)}</span><span> /sem.</span></span>
    </span>`;
  }
  if (bien.dispo_location) {
    return `<span class="prix"><span class="prix-valeur">${formaterPrix(bien.prix_location)}</span><span> /semaine</span></span>`;
  }
  return `<span class="prix"><span class="prix-valeur">${formaterPrix(bien.prix)}</span></span>`;
}

// Prix détaillé pour la fiche d'une annonce.
function prixFicheHTML(bien) {
  if (bien.dispo_vente && bien.dispo_location) {
    return `<div class="fiche-prix fiche-prix-double">
      <div class="fiche-prix-ligne"><span class="prix-etiquette">Vente</span><span class="prix-valeur">${formaterPrix(bien.prix)}</span></div>
      <div class="fiche-prix-ligne"><span class="prix-etiquette">Location</span><span class="prix-valeur">${formaterPrix(bien.prix_location)}</span><span>par semaine</span></div>
    </div>`;
  }
  if (bien.dispo_location) {
    return `<div class="fiche-prix"><span class="prix-valeur">${formaterPrix(bien.prix_location)}</span><span> / semaine</span></div>`;
  }
  return `<div class="fiche-prix"><span class="prix-valeur">${formaterPrix(bien.prix)}</span></div>`;
}

function badgesSecondairesHTML(bien) {
  const badges = [];
  if (bien.categorie === "habitation" && bien.meuble) badges.push('<span class="badge-info">Meublé</span>');
  if (bien.vip) badges.push('<span class="badge-info badge-vip">VIP</span>');
  if (bien.standing) badges.push('<span class="badge-info badge-standing">Exception</span>');
  return badges.length ? `<div class="badges-secondaires">${badges.join("")}</div>` : "";
}

function carteBienHTML(bien) {
  const image = bien.images && bien.images[0];
  const visuel = image
    ? `<img src="${echapper(image)}" alt="${echapper(bien.titre)}" loading="lazy" decoding="async">`
    : `<span style="font-size:2.2rem;">${iconeCategorie(bien.categorie)}</span>`;
  return `
    <a class="carte-bien" href="/bien.html?id=${bien.id}">
      <div class="visuel">
        ${bien.coup_de_coeur ? '<span class="badge-coeur">Coup de cœur</span>' : ""}
        <span class="badge-transaction${classeBadgeTransaction(bien)}">${etiquetteTransaction(bien)}</span>
        ${badgesSecondairesHTML(bien)}
        ${visuel}
      </div>
      <div class="corps">
        <span class="zone-tag">${etiquetteZoneHTML(bien)}</span>
        <h3>${echapper(bien.titre)}</h3>
        <p class="description">${echapper(texteSansMarquage(bien.description).slice(0, 90))}${texteSansMarquage(bien.description).length > 90 ? "…" : ""}</p>
        <div class="pied">
          ${prixCarteHTML(bien)}
          ${bien.places ? `<span class="zone-tag">${bien.places} places</span>` : ""}
        </div>
      </div>
    </a>`;
}

// Carte enrichie utilisée uniquement par la vitrine "Nos coups de cœur" de l'accueil
// (carrousel avec flèches + filtres) : emplacement (via etiquetteZoneHTML) mis en avant
// avec une puce de repère, et un appel à l'action "Voir le bien" en pied de carte.
// (Le liseré doré des biens VIP — règle .carte-bien:has(.badge-vip) déjà
// existante — suffit à mettre en valeur une carte : pas de second liseré "vedette"
// séparé, qui ferait doublon et brouillerait le message.)
function carteCoeurHTML(bien) {
  const image = bien.images && bien.images[0];
  const visuel = image
    ? `<img src="${echapper(image)}" alt="${echapper(bien.titre)}" loading="lazy" decoding="async">`
    : `<span style="font-size:2.2rem;">${iconeCategorie(bien.categorie)}</span>`;
  return `
    <a class="carte-bien" href="/bien.html?id=${bien.id}">
      <div class="visuel">
        <span class="badge-coeur">♥ Coup de cœur</span>
        ${badgesSecondairesHTML(bien)}
        ${visuel}
      </div>
      <div class="corps">
        <span class="zone-tag">${ETIQUETTES_CATEGORIE[bien.categorie] || bien.categorie}</span>
        <h3>${echapper(bien.titre)}</h3>
        <span class="carte-coeur-lieu">📍 ${etiquetteZoneHTML(bien)}</span>
        <div class="pied">${prixCarteHTML(bien)}</div>
        <span class="carte-coeur-cta">Voir le bien <span aria-hidden="true">→</span></span>
      </div>
    </a>`;
}

async function chargerBiens({ categorie, zone, coupDeCoeur, vendu, meuble, coherence, standing, cible, videMessage } = {}) {
  const conteneur = document.getElementById(cible || "grille-biens");
  if (!conteneur) return [];
  conteneur.innerHTML = '<p class="champ-aide">Chargement des annonces…</p>';
  try {
    const params = new URLSearchParams();
    if (categorie) params.set("categorie", categorie);
    if (zone) params.set("zone", zone);
    if (coupDeCoeur) params.set("coup_de_coeur", "1");
    if (vendu) params.set("vendu", "1");
    if (meuble !== undefined && meuble !== null && meuble !== "") params.set("meuble", meuble ? "1" : "0");
    if (coherence) params.set("coherence", coherence);
    if (standing) params.set("standing", "1");
    const data = await appelAPI("/api/biens?" + params.toString());
    const liste = data.biens || [];
    if (!liste.length) {
      conteneur.innerHTML = `<div class="etat-vide">${videMessage || "Aucune annonce disponible pour le moment. Revenez bientôt !"}</div>`;
      return liste;
    }
    conteneur.innerHTML = liste.map(carteBienHTML).join("");
    reveler(".carte-bien", conteneur);
    return liste;
  } catch (e) {
    conteneur.innerHTML = `<div class="etat-vide">Impossible de charger les annonces (${echapper(e.message)}).</div>`;
    return [];
  }
}

// ============================================================================
// Filtre à deux niveaux (familles → catégories), avec indicateur doré qui
// glisse sous l'onglet actif. Utilisé par /habitation.html.
//
// `familles` : [{ id, label, categories: [] }], où chaque catégorie est soit
// une chaîne ("Villa"), soit un objet { nom, n } pour afficher un compteur.
// Une famille avec `categories: []` replie entièrement la ligne 2 (ex. la
// famille "Autres", qui n'a pas de sous-filtre — voir habitation.html).
//
// Tous les boutons sont générés depuis `familles` (rien en dur dans le HTML).
// `onChange(familleId, categorieNom)` est appelé à chaque changement, y
// compris une fois au démarrage ; `categorieNom` vaut `null` quand "Tout"
// est actif ou que la famille n'a pas de ligne 2.
// ============================================================================
function construireFiltre2Niveaux({ conteneur, familles, familleDepart, categorieDepart, onChange }) {
  const racine = typeof conteneur === "string" ? document.getElementById(conteneur) : conteneur;
  if (!racine || !familles || !familles.length) return null;

  racine.innerHTML = `
    <div class="d8-filtre2-rail" role="tablist" aria-label="Familles">
      <span class="d8-filtre2-indicateur" aria-hidden="true"></span>
    </div>
    <div class="d8-filtre2-rail2-wrap">
      <div class="d8-filtre2-rail2-inner">
        <div class="d8-filtre2-rail" role="tablist" aria-label="Catégories">
          <span class="d8-filtre2-indicateur" aria-hidden="true"></span>
        </div>
      </div>
    </div>`;
  const railFamilles = racine.children[0];
  const rail2Wrap = racine.children[1];
  const indicateurFamilles = railFamilles.querySelector(".d8-filtre2-indicateur");
  const railCategories = rail2Wrap.querySelector(".d8-filtre2-rail");
  const indicateurCategories = railCategories.querySelector(".d8-filtre2-indicateur");

  const etat = { familleId: null, categorieNom: null };

  function reduireMouvement() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function nomCat(c) { return typeof c === "string" ? c : c.nom; }
  function nCat(c) { return (typeof c === "object" && c.n != null) ? c.n : null; }

  function creerOnglet(texte, { actif, n } = {}) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "d8-filtre2-tab";
    bouton.setAttribute("role", "tab");
    bouton.setAttribute("aria-selected", actif ? "true" : "false");
    bouton.tabIndex = actif ? 0 : -1;
    const libelle = document.createElement("span");
    libelle.textContent = texte;
    bouton.appendChild(libelle);
    if (n != null) {
      const badge = document.createElement("span");
      badge.className = "d8-filtre2-n";
      badge.textContent = n;
      bouton.appendChild(badge);
    }
    return bouton;
  }

  function positionner(indicateur, bouton, animer) {
    if (!bouton) { indicateur.style.width = "0px"; return; }
    const x = bouton.offsetLeft, y = bouton.offsetTop;
    const largeur = bouton.offsetWidth;
    const sansTransition = !animer || reduireMouvement();
    if (sansTransition) indicateur.classList.add("sans-transition");
    indicateur.style.transform = "translate(" + x + "px, " + y + "px)";
    indicateur.style.width = largeur + "px";
    indicateur.style.height = bouton.offsetHeight + "px";
    if (sansTransition) {
      void indicateur.offsetWidth;
      indicateur.classList.remove("sans-transition");
    }
  }
  function boutonActif(rail) { return rail.querySelector('.d8-filtre2-tab[aria-selected="true"]'); }

  function construireFamilles() {
    railFamilles.querySelectorAll(".d8-filtre2-tab").forEach((b) => b.remove());
    familles.forEach((famille) => {
      const bouton = creerOnglet(famille.label, { actif: famille.id === etat.familleId });
      bouton.dataset.id = famille.id;
      bouton.addEventListener("click", () => selectionnerFamille(famille.id));
      railFamilles.appendChild(bouton);
    });
  }

  function selectionnerFamille(id) {
    etat.familleId = id;
    etat.categorieNom = null; // "Tout" redevient actif à chaque changement de famille
    railFamilles.querySelectorAll(".d8-filtre2-tab").forEach((b) => {
      const actif = b.dataset.id === id;
      b.setAttribute("aria-selected", actif ? "true" : "false");
      b.tabIndex = actif ? 0 : -1;
    });
    positionner(indicateurFamilles, boutonActif(railFamilles), true);
    construireCategories(id);
    if (onChange) onChange(etat.familleId, etat.categorieNom);
  }

  function construireCategories(familleId) {
    const famille = familles.find((f) => f.id === familleId);
    railCategories.querySelectorAll(".d8-filtre2-tab").forEach((b) => b.remove());
    if (!famille || !famille.categories.length) {
      rail2Wrap.classList.add("repliee");
      positionner(indicateurCategories, null, false);
      return;
    }
    rail2Wrap.classList.remove("repliee");
    const boutonTout = creerOnglet("Tout", { actif: etat.categorieNom === null });
    boutonTout.dataset.nom = "";
    boutonTout.addEventListener("click", () => selectionnerCategorie(null));
    railCategories.appendChild(boutonTout);
    famille.categories.forEach((cat) => {
      const nom = nomCat(cat);
      const bouton = creerOnglet(nom, { actif: etat.categorieNom === nom, n: nCat(cat) });
      bouton.dataset.nom = nom;
      bouton.addEventListener("click", () => selectionnerCategorie(nom));
      railCategories.appendChild(bouton);
    });
    // ligne toute neuve : indicateur calé sans transition (rien à quitter).
    positionner(indicateurCategories, boutonActif(railCategories), false);
  }

  function selectionnerCategorie(nom) {
    etat.categorieNom = nom; // null = "Tout"
    const nomCompare = nom || "";
    railCategories.querySelectorAll(".d8-filtre2-tab").forEach((b) => {
      const actif = b.dataset.nom === nomCompare;
      b.setAttribute("aria-selected", actif ? "true" : "false");
      b.tabIndex = actif ? 0 : -1;
    });
    const bouton = boutonActif(railCategories);
    positionner(indicateurCategories, bouton, true);
    if (bouton) bouton.scrollIntoView({ behavior: reduireMouvement() ? "auto" : "smooth", inline: "nearest", block: "nearest" });
    if (onChange) onChange(etat.familleId, etat.categorieNom);
  }

  function gestionClavier(e) {
    const rail = e.currentTarget;
    const onglets = Array.from(rail.querySelectorAll(".d8-filtre2-tab"));
    const index = onglets.indexOf(document.activeElement);
    if (index === -1) return;
    let suivant = null;
    if (e.key === "ArrowRight") suivant = onglets[(index + 1) % onglets.length];
    else if (e.key === "ArrowLeft") suivant = onglets[(index - 1 + onglets.length) % onglets.length];
    else if (e.key === "Home") suivant = onglets[0];
    else if (e.key === "End") suivant = onglets[onglets.length - 1];
    if (suivant) { e.preventDefault(); suivant.focus(); suivant.click(); }
  }
  railFamilles.addEventListener("keydown", gestionClavier);
  railCategories.addEventListener("keydown", gestionClavier);

  function debounce(fn, delai) {
    let t;
    return function () { clearTimeout(t); t = setTimeout(fn, delai); };
  }
  window.addEventListener("resize", debounce(() => {
    positionner(indicateurFamilles, boutonActif(railFamilles), false);
    positionner(indicateurCategories, boutonActif(railCategories), false);
  }, 120));

  // état de départ (ex. venant d'un lien externe avec ?sous_categorie=...)
  const familleValide = familles.some((f) => f.id === familleDepart);
  etat.familleId = familleValide ? familleDepart : familles[0].id;
  const familleObjDepart = familles.find((f) => f.id === etat.familleId);
  const catValide = familleObjDepart && familleObjDepart.categories.some((c) => nomCat(c) === categorieDepart);
  etat.categorieNom = catValide ? categorieDepart : null;

  construireFamilles();
  positionner(indicateurFamilles, boutonActif(railFamilles), false);
  construireCategories(etat.familleId);
  if (onChange) onChange(etat.familleId, etat.categorieNom);

  return {
    etat,
    definir(familleId, categorieNom) {
      selectionnerFamille(familleId);
      if (categorieNom) selectionnerCategorie(categorieNom);
    },
  };
}

// ---- page de fiche détaillée (bien.html) ----

async function chargerFicheBien() {
  const conteneur = document.getElementById("fiche-bien");
  const id = new URLSearchParams(window.location.search).get("id");
  if (!conteneur) return;
  if (!id) {
    conteneur.innerHTML = '<div class="etat-vide">Annonce introuvable.</div>';
    return;
  }
  try {
    const bien = await appelAPI("/api/biens?id=" + encodeURIComponent(id));
    document.title = bien.titre + " — Dynasty 8";
    const images = (bien.images || []).filter(Boolean);
    const aPhotos = images.length > 0;
    let courant = 0;
    const categorieLien = { habitation: "/interieurs.html", garage: "/garages.html" }[bien.categorie] || "/accueil.html";
    const categorieNom = ETIQUETTES_CATEGORIE[bien.categorie] || "Catalogue";

    // Fil d'Ariane + bouton « copier le lien » (pratique pour partager l'annonce sur Discord).
    const enTeteHTML = `
      <div class="fiche-entete">
        <nav class="fiche-ariane" aria-label="Fil d'Ariane">
          <a href="/accueil.html">Accueil</a><span aria-hidden="true">›</span>
          <a href="${categorieLien}">${echapper(categorieNom)}</a><span aria-hidden="true">›</span>
          <span>${echapper(bien.titre)}</span>
        </nav>
        <button type="button" class="fiche-partager" id="fiche-partager">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          <span>Copier le lien</span>
        </button>
      </div>`;

    const galerieHTML = `
      <div class="fiche-galerie">
        <div class="fiche-visuel-principal ${aPhotos ? "fiche-visuel-principal--zoom" : ""}" id="visuel-principal" ${aPhotos ? 'role="button" tabindex="0" aria-label="Agrandir la photo"' : ""}>
          ${aPhotos ? `<img src="${echapper(images[0])}" alt="${echapper(bien.titre)}">` : `<span style="font-size:3rem;">${iconeCategorie(bien.categorie)}</span>`}
          ${aPhotos ? `<span class="fiche-visuel-agrandir" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>Agrandir</span>` : ""}
          ${images.length > 1 ? `<button type="button" class="fiche-visuel-fleche fiche-visuel-fleche--prec" data-sens="-1" aria-label="Photo précédente">‹</button><button type="button" class="fiche-visuel-fleche fiche-visuel-fleche--suiv" data-sens="1" aria-label="Photo suivante">›</button>` : ""}
          ${images.length > 1 ? `<span class="fiche-visuel-compteur" id="visuel-compteur">1 / ${images.length}</span>` : ""}
        </div>
        ${images.length > 1 ? `<div class="miniatures" id="miniatures">${images
          .map((u, i) => `<button type="button" data-i="${i}" class="${i === 0 ? "actif" : ""}" aria-label="Photo ${i + 1}"><img src="${echapper(u)}" alt=""></button>`)
          .join("")}</div>` : ""}
      </div>`;

    conteneur.innerHTML = `
      ${enTeteHTML}
      <div class="fiche-bien-grille">
        <div>
          ${galerieHTML}
          ${bien.description && texteSansMarquage(bien.description).trim()
            ? `<div class="fiche-description-vitrine">${analyserDescription(bien.description)}</div>`
            : ""}
        </div>
        <div class="fiche-fiche">
          <span class="zone-tag">${echapper(bien.sous_categorie || categorieNom)}${bien.coup_de_coeur ? " · Coup de cœur" : ""}${bien.standing ? " · Bien d'exception" : ""}</span>
          <h1>${echapper(bien.titre)}</h1>
          ${prixFicheHTML(bien)}
          ${!bien.disponible ? '<p class="fiche-indispo">Ce bien n’est plus disponible.</p>' : ""}
          <dl class="fiche-carac">
            <div><dt>Transaction</dt><dd>${etiquetteTransaction(bien)}</dd></div>
            <div><dt>Catégorie</dt><dd>${echapper(categorieNom)}</dd></div>
            ${bien.categorie === "habitation" ? `<div><dt>Ameublement</dt><dd>${bien.meuble ? "Meublé" : "Non meublé"}</dd></div>` : ""}
            ${bien.places ? `<div><dt>Places</dt><dd>${echapper(bien.places)}</dd></div>` : ""}
            ${bien.coffre_kg ? `<div><dt>Coffre</dt><dd>${echapper(bien.coffre_kg)} kg</dd></div>` : ""}
            ${bien.vip ? '<div><dt>Statut</dt><dd>VIP</dd></div>' : ""}
            ${bien.coherence ? `<div><dt>Cohérence</dt><dd><a href="/coherence.html?zone=${encodeURIComponent(bien.coherence)}" class="fiche-carac-lien">${echapper(bien.coherence)} <span aria-hidden="true">→</span></a></dd></div>` : ""}
          </dl>
          <div class="encart-contact">
            <div class="encart-contact-titre">Comment obtenir ce bien ?</div>
            <ol class="encart-contact-etapes">
              <li><span>Ouvrez l'application <strong>Eyefind</strong> sur votre téléphone, en jeu.</span></li>
              <li><span>Écrivez à <strong>Dynasty 8</strong> au <strong class="encart-contact-numero">914</strong> en précisant le bien qui vous intéresse.</span></li>
              <li><span>Patientez sur place : un agent Dynasty 8 arrive pour finaliser avec vous.</span></li>
            </ol>
          </div>
          <a class="btn btn-fantome fiche-retour" href="${categorieLien}">← Retour aux annonces</a>
        </div>
      </div>`;

    // ---- galerie : navigation entre les photos ----
    const principal = document.getElementById("visuel-principal");
    const miniatures = conteneur.querySelectorAll("#miniatures button");
    function afficher(i) {
      if (!aPhotos) return;
      courant = (i + images.length) % images.length;
      const img = principal.querySelector("img");
      if (img) { img.src = images[courant]; }
      const compteur = document.getElementById("visuel-compteur");
      if (compteur) compteur.textContent = `${courant + 1} / ${images.length}`;
      miniatures.forEach((b, k) => b.classList.toggle("actif", k === courant));
    }
    miniatures.forEach((btn) => btn.addEventListener("click", () => afficher(Number(btn.dataset.i))));
    principal.querySelectorAll(".fiche-visuel-fleche").forEach((f) => {
      f.addEventListener("click", (e) => { e.stopPropagation(); afficher(courant + Number(f.dataset.sens)); });
    });
    if (aPhotos) {
      principal.addEventListener("click", () => ouvrirVisionneuse(images, courant, bien.titre, (i) => afficher(i)));
      principal.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); principal.click(); } });
    }

    // ---- copier le lien ----
    const partager = document.getElementById("fiche-partager");
    partager.addEventListener("click", async () => {
      try {
        if (!(await copierTexte(window.location.href))) throw new Error("copie impossible");
        partager.querySelector("span").textContent = "Lien copié !";
        partager.classList.add("ok");
        setTimeout(() => { partager.querySelector("span").textContent = "Copier le lien"; partager.classList.remove("ok"); }, 2200);
      } catch (e) {
        // Pas de presse-papiers (navigateur ancien, iframe en jeu…) : on affiche le
        // lien dans un champ pré-sélectionné — jamais de window.prompt (gèle FiveM).
        let champ = document.getElementById("fiche-lien-copie");
        if (!champ) {
          champ = document.createElement("input");
          champ.id = "fiche-lien-copie"; champ.className = "fiche-lien-copie"; champ.readOnly = true;
          champ.setAttribute("aria-label", "Lien de l'annonce");
          partager.insertAdjacentElement("afterend", champ);
        }
        champ.value = window.location.href; champ.focus(); champ.select();
      }
    });
  } catch (e) {
    conteneur.innerHTML = `<div class="etat-vide">Cette annonce n'existe plus ou a été retirée.</div>`;
  }
}

// ---- visionneuse plein écran (clic sur une photo de la fiche) ----
// Flèches / vignettes / clavier (← → Échap), balayage au doigt sur mobile, et
// clic sur la photo pour zoomer ×2 à l'endroit cliqué. `onChange` resynchronise
// la galerie de la fiche quand on ferme.
function ouvrirVisionneuse(images, depart, titre, onChange) {
  const ancien = document.getElementById("visionneuse");
  if (ancien) ancien.remove();
  let i = depart;
  const v = document.createElement("div");
  v.id = "visionneuse"; v.className = "visionneuse"; v.setAttribute("role", "dialog"); v.setAttribute("aria-modal", "true"); v.setAttribute("aria-label", "Photos de l'annonce");
  v.innerHTML = `
    <button type="button" class="visionneuse-fermer" aria-label="Fermer">×</button>
    <div class="visionneuse-scene">
      ${images.length > 1 ? `<button type="button" class="visionneuse-fleche visionneuse-fleche--prec" aria-label="Photo précédente">‹</button>` : ""}
      <figure class="visionneuse-cadre"><img src="${echapper(images[i])}" alt="${echapper(titre)}"></figure>
      ${images.length > 1 ? `<button type="button" class="visionneuse-fleche visionneuse-fleche--suiv" aria-label="Photo suivante">›</button>` : ""}
    </div>
    <div class="visionneuse-pied">
      <span class="visionneuse-titre">${echapper(titre)}</span>
      <span class="visionneuse-compteur">${i + 1} / ${images.length}</span>
      <span class="visionneuse-aide">Cliquez sur la photo pour zoomer · Échap pour fermer</span>
    </div>
    ${images.length > 1 ? `<div class="visionneuse-vignettes">${images.map((u, k) => `<button type="button" data-i="${k}" class="${k === i ? "actif" : ""}" aria-label="Photo ${k + 1}"><img src="${echapper(u)}" alt=""></button>`).join("")}</div>` : ""}`;
  document.body.appendChild(v);
  document.body.classList.add("visionneuse-ouverte");
  requestAnimationFrame(() => v.classList.add("visible"));

  const cadre = v.querySelector(".visionneuse-cadre");
  const img = cadre.querySelector("img");
  const compteur = v.querySelector(".visionneuse-compteur");
  const vignettes = v.querySelectorAll(".visionneuse-vignettes button");
  let zoom = false;

  function dezoomer() { zoom = false; cadre.classList.remove("zoom"); img.style.transformOrigin = ""; }
  function aller(k) {
    i = (k + images.length) % images.length;
    dezoomer();
    img.classList.remove("apparait"); void img.offsetWidth; img.classList.add("apparait");
    img.src = images[i];
    compteur.textContent = `${i + 1} / ${images.length}`;
    vignettes.forEach((b, n) => b.classList.toggle("actif", n === i));
    const active = vignettes[i]; if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    if (onChange) onChange(i);
  }
  function fermer() {
    v.classList.remove("visible");
    document.body.classList.remove("visionneuse-ouverte");
    document.removeEventListener("keydown", clavier);
    setTimeout(() => v.remove(), 220);
  }
  function clavier(e) {
    if (e.key === "Escape") { e.preventDefault(); fermer(); }
    else if (e.key === "ArrowRight") aller(i + 1);
    else if (e.key === "ArrowLeft") aller(i - 1);
  }
  document.addEventListener("keydown", clavier);
  v.querySelector(".visionneuse-fermer").addEventListener("click", fermer);
  v.addEventListener("click", (e) => { if (e.target === v || e.target.classList.contains("visionneuse-scene")) fermer(); });
  v.querySelectorAll(".visionneuse-fleche").forEach((f) => f.addEventListener("click", () => aller(i + (f.classList.contains("visionneuse-fleche--suiv") ? 1 : -1))));
  vignettes.forEach((b) => b.addEventListener("click", () => aller(Number(b.dataset.i))));
  // zoom ×2 centré sur le point cliqué ; second clic pour revenir
  img.addEventListener("click", (e) => {
    if (zoom) { dezoomer(); return; }
    const r = img.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    zoom = true; cadre.classList.add("zoom");
  });
  img.addEventListener("mousemove", (e) => {
    if (!zoom) return;
    const r = cadre.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  });
  // balayage au doigt
  let x0 = null;
  v.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  v.addEventListener("touchend", (e) => {
    if (x0 == null || zoom) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) aller(i + (dx < 0 ? 1 : -1));
  }, { passive: true });
  v.querySelector(".visionneuse-fermer").focus();
}
