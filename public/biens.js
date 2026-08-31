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

// Prix compact pour les cartes (carrousels, catalogue).
function prixCarteHTML(bien) {
  if (bien.dispo_vente && bien.dispo_location) {
    return `<span class="prix-double">
      <span class="prix-ligne"><span class="prix-etiquette">Vente</span>${formaterPrix(bien.prix)}</span>
      <span class="prix-ligne"><span class="prix-etiquette">Location</span>${formaterPrix(bien.prix_location)}<span> /sem.</span></span>
    </span>`;
  }
  if (bien.dispo_location) {
    return `<span class="prix">${formaterPrix(bien.prix_location)}<span> /semaine</span></span>`;
  }
  return `<span class="prix">${formaterPrix(bien.prix)}</span>`;
}

// Prix détaillé pour la fiche d'une annonce.
function prixFicheHTML(bien) {
  if (bien.dispo_vente && bien.dispo_location) {
    return `<div class="fiche-prix fiche-prix-double">
      <div class="fiche-prix-ligne"><span class="prix-etiquette">Vente</span>${formaterPrix(bien.prix)}</div>
      <div class="fiche-prix-ligne"><span class="prix-etiquette">Location</span>${formaterPrix(bien.prix_location)} / semaine</div>
    </div>`;
  }
  if (bien.dispo_location) {
    return `<div class="fiche-prix">${formaterPrix(bien.prix_location)} / semaine</div>`;
  }
  return `<div class="fiche-prix">${formaterPrix(bien.prix)}</div>`;
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
    ? `<img src="${echapper(image)}" alt="${echapper(bien.titre)}" loading="lazy">`
    : `<span style="font-size:2.2rem;">${iconeCategorie(bien.categorie)}</span>`;
  return `
    <a class="carte-bien" href="/bien.html?id=${bien.id}">
      <div class="visuel">
        ${bien.vendu ? '<span class="badge-coeur badge-vendu">Vendu</span>' : (bien.coup_de_coeur ? '<span class="badge-coeur">Coup de cœur</span>' : "")}
        <span class="badge-transaction">${etiquetteTransaction(bien)}</span>
        ${badgesSecondairesHTML(bien)}
        ${visuel}
      </div>
      <div class="corps">
        <span class="zone-tag">${etiquetteZoneHTML(bien)}</span>
        <h3>${echapper(bien.titre)}</h3>
        <p class="description">${echapper((bien.description || "").slice(0, 90))}${(bien.description || "").length > 90 ? "…" : ""}</p>
        <div class="pied">
          ${prixCarteHTML(bien)}
          ${bien.places ? `<span class="zone-tag">${bien.places} places</span>` : ""}
        </div>
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
    return liste;
  } catch (e) {
    conteneur.innerHTML = `<div class="etat-vide">Impossible de charger les annonces (${echapper(e.message)}).</div>`;
    return [];
  }
}

function initialiserFiltres(idFiltres, idGrille, categorieFixe, valeurInitiale, filtresSupplementaires) {
  const zoneFiltres = document.getElementById(idFiltres);
  if (!zoneFiltres) {
    chargerBiens({ categorie: categorieFixe, cible: idGrille, ...filtresSupplementaires });
    return;
  }
  const boutons = Array.from(zoneFiltres.querySelectorAll("[data-sous-categorie]"));
  async function appliquer(sousCategorie) {
    boutons.forEach((b) => b.classList.toggle("actif", b.dataset.sousCategorie === sousCategorie));
    const liste = await chargerBiens({ categorie: categorieFixe, cible: idGrille, ...filtresSupplementaires });
    if (sousCategorie !== "tous") {
      const conteneur = document.getElementById(idGrille);
      const filtres = liste.filter((b) => b.sous_categorie === sousCategorie);
      if (!filtres.length) {
        conteneur.innerHTML = '<div class="etat-vide">Aucune annonce dans cette catégorie pour le moment.</div>';
      } else {
        conteneur.innerHTML = filtres.map(carteBienHTML).join("");
      }
    }
  }
  boutons.forEach((b) => b.addEventListener("click", () => appliquer(b.dataset.sousCategorie)));
  const depart = boutons.some((b) => b.dataset.sousCategorie === valeurInitiale) ? valeurInitiale : "tous";
  appliquer(depart);
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
        <p>${echapper(bien.description || "Aucune description fournie pour cette annonce.").replace(/\n/g, "<br>")}</p>
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
