// ============================================================================
// Dynasty 8 — affichage des annonces (biens) sur les pages publiques
// ============================================================================

function iconeCategorie(categorie) {
  const icones = { habitation: "🏠", garage: "🚗" };
  return icones[categorie] || "🏠";
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
        <span class="badge-transaction">${bien.transaction_type === "location" ? "Location" : "Vente"}</span>
        ${visuel}
      </div>
      <div class="corps">
        <span class="zone-tag">${echapper(bien.sous_categorie || ETIQUETTES_CATEGORIE[bien.categorie] || "")}</span>
        <h3>${echapper(bien.titre)}</h3>
        <p class="description">${echapper((bien.description || "").slice(0, 90))}${(bien.description || "").length > 90 ? "…" : ""}</p>
        <div class="pied">
          <span class="prix">${formaterPrix(bien.prix)}${bien.transaction_type === "location" ? '<span> /semaine</span>' : ""}</span>
          ${bien.places ? `<span class="zone-tag">${bien.places} places</span>` : ""}
        </div>
      </div>
    </a>`;
}

async function chargerBiens({ categorie, zone, coupDeCoeur, vendu, cible, videMessage } = {}) {
  const conteneur = document.getElementById(cible || "grille-biens");
  if (!conteneur) return [];
  conteneur.innerHTML = '<p class="champ-aide">Chargement des annonces…</p>';
  try {
    const params = new URLSearchParams();
    if (categorie) params.set("categorie", categorie);
    if (zone) params.set("zone", zone);
    if (coupDeCoeur) params.set("coup_de_coeur", "1");
    if (vendu) params.set("vendu", "1");
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

function initialiserFiltres(idFiltres, idGrille, categorieFixe, valeurInitiale) {
  const zoneFiltres = document.getElementById(idFiltres);
  if (!zoneFiltres) {
    chargerBiens({ categorie: categorieFixe, cible: idGrille });
    return;
  }
  const boutons = Array.from(zoneFiltres.querySelectorAll("[data-sous-categorie]"));
  async function appliquer(sousCategorie) {
    boutons.forEach((b) => b.classList.toggle("actif", b.dataset.sousCategorie === sousCategorie));
    const liste = await chargerBiens({ categorie: categorieFixe, cible: idGrille });
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
        <span class="zone-tag">${echapper(bien.sous_categorie || ETIQUETTES_CATEGORIE[bien.categorie] || "")} ${bien.coup_de_coeur ? "· Coup de cœur" : ""}</span>
        <h1>${echapper(bien.titre)}</h1>
        <div class="fiche-prix">${formaterPrix(bien.prix)}${bien.transaction_type === "location" ? " / semaine" : ""}</div>
        <div class="fiche-carac">
          <div><strong>${bien.transaction_type === "location" ? "Location" : "Vente"}</strong>Transaction</div>
          ${bien.places ? `<div><strong>${bien.places}</strong>Places</div>` : ""}
          <div><strong>${ETIQUETTES_CATEGORIE[bien.categorie] || ""}</strong>Catégorie</div>
        </div>
        <p>${echapper(bien.description || "Aucune description fournie pour cette annonce.").replace(/\n/g, "<br>")}</p>
        <a class="btn btn-or btn-large" style="width:100%;margin-top:10px;" href="${LIEN_DISCORD}" target="_blank" rel="noopener">Contacter un agent sur Discord</a>
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
