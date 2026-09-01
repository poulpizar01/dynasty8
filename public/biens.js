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
      <div class="fiche-prix-ligne"><span class="prix-etiquette">Location</span><span class="prix-valeur">${formaterPrix(bien.prix_location)}</span><span> / semaine</span></div>
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
  if (bien.vip) badges.push(`<span class="badge-info badge-vip">${bien.vip === "vip+" ? "VIP+" : "VIP"}</span>`);
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
        ${bien.vendu ? '<span class="badge-coeur badge-vendu">Vendu</span>' : (bien.coup_de_coeur ? '<span class="badge-coeur">Coup de cœur</span>' : "")}
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
// (Le liseré doré des biens VIP/VIP+ — règle .carte-bien:has(.badge-vip) déjà
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
        ${bien.vendu ? '<span class="badge-coeur badge-vendu">Vendu</span>' : '<span class="badge-coeur">♥ Coup de cœur</span>'}
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
    const x = bouton.offsetLeft;
    const largeur = bouton.offsetWidth;
    const sansTransition = !animer || reduireMouvement();
    if (sansTransition) indicateur.classList.add("sans-transition");
    indicateur.style.transform = "translateX(" + x + "px)";
    indicateur.style.width = largeur + "px";
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
    const images = bien.images && bien.images.length ? bien.images : [null];
    conteneur.innerHTML = `
      <div>
        <div class="fiche-visuel-principal" id="visuel-principal">
          ${images[0] ? `<img src="${echapper(images[0])}" alt="${echapper(bien.titre)}">` : `<span style="font-size:3rem;">${iconeCategorie(bien.categorie)}</span>`}
        </div>
        ${images.length > 1 ? `<div class="miniatures">${images
          .map(
            (u, i) =>
              `<button data-i="${i}" class="${i === 0 ? "actif" : ""}">${u ? `<img src="${echapper(u)}">` : ""}</button>`
          )
          .join("")}</div>` : ""}
        ${bien.description
          ? `<div class="fiche-description-vitrine">${analyserDescription(bien.description)}</div>`
          : `<div class="fiche-description-vitrine vide">Aucune description fournie pour cette annonce.</div>`}
      </div>
      <div class="fiche-fiche">
        <span class="zone-tag">${echapper(bien.sous_categorie || ETIQUETTES_CATEGORIE[bien.categorie] || "")}${bien.coup_de_coeur ? " · Coup de cœur" : ""}${bien.standing ? " · Bien d'exception" : ""}</span>
        <h1>${echapper(bien.titre)}</h1>
        ${prixFicheHTML(bien)}
        ${bien.vendu ? '<p class="champ-aide" style="color:var(--success);font-weight:600;">Ce bien a été vendu.</p>' : (!bien.disponible ? '<p class="champ-aide" style="color:var(--danger);font-weight:600;">Ce bien n’est plus disponible.</p>' : "")}
        <div class="fiche-carac">
          <div><strong>${etiquetteTransaction(bien)}</strong>Transaction</div>
          <div><strong>${ETIQUETTES_CATEGORIE[bien.categorie] || ""}</strong>Catégorie</div>
          ${bien.categorie === "habitation" ? `<div><strong>${bien.meuble ? "Meublé" : "Non meublé"}</strong>Ameublement</div>` : ""}
          ${bien.places ? `<div><strong>${bien.places}</strong>Places</div>` : ""}
          ${bien.coffre_kg ? `<div><strong>${bien.coffre_kg} kg</strong>Coffre</div>` : ""}
          ${bien.vip ? `<div><strong>${bien.vip === "vip+" ? "VIP+" : "VIP"}</strong>Statut</div>` : ""}
          ${bien.coherence ? `<div><strong>${echapper(bien.coherence)}</strong>Cohérence</div>` : ""}
        </div>
        ${bien.coherence ? `<a class="btn btn-fantome btn-petit" style="margin-bottom:14px;" href="/coherence.html?zone=${encodeURIComponent(bien.coherence)}">Voir la fiche de cohérence « ${echapper(bien.coherence)} » →</a>` : ""}
        <div class="encart-contact">
          <div class="encart-contact-titre">📱 Comment obtenir ce bien ?</div>
          <ol class="encart-contact-etapes">
            <li>Ouvrez l'application <strong>Eyefind</strong> sur votre téléphone, en jeu.</li>
            <li>Recherchez <strong>Dynasty 8</strong> et envoyez-nous un message.</li>
            <li>Patientez sur place : un agent Dynasty 8 arrive pour finaliser avec vous.</li>
          </ol>
        </div>
        <a class="btn btn-fantome" style="width:100%;margin-top:10px;" href="javascript:history.back()">← Retour aux annonces</a>
      </div>`;
    const miniatures = conteneur.querySelectorAll(".miniatures button");
    miniatures.forEach((btn) => {
      btn.addEventListener("click", () => {
        miniatures.forEach((b) => b.classList.remove("actif"));
        btn.classList.add("actif");
        const url = images[Number(btn.dataset.i)];
        document.getElementById("visuel-principal").innerHTML = url
          ? `<img src="${echapper(url)}" alt="${echapper(bien.titre)}">`
          : `<span style="font-size:3rem;">${iconeCategorie(bien.categorie)}</span>`;
      });
    });
  } catch (e) {
    conteneur.innerHTML = `<div class="etat-vide">Cette annonce n'existe plus ou a été retirée.</div>`;
  }
}
