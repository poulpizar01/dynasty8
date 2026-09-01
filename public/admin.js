// ============================================================================
// Dynasty 8 — logique de l'espace agents (admin.html)
// ============================================================================

let SESSION = null; // { pseudo, grade, direction }
let CACHE_BIENS = [];
let CACHE_MEMBRES = [];
let IMAGES_BIEN = []; // photos du bien en cours d'édition (URLs et/ou images importées)
let PHOTO_PROFIL = ""; // photo de profil en cours d'édition (onglet Mon profil)
let ETAT_INITIAL_BIEN = ""; // instantané du formulaire à l'ouverture, pour détecter les changements non enregistrés

// ---- tableau de bord "Annonces" : recherche, filtres, vue et pagination ----
let FILTRE_RECHERCHE = "";
let FILTRE_CATEGORIE = "";
let FILTRE_STATUT = "";
let MODE_VUE_BIENS = "liste"; // "liste" | "grille"
let PAGE_BIENS = 1;
const TAILLE_PAGE_BIENS = 10;

function afficherMessage(idZone, texte, type) {
  const zone = document.getElementById(idZone);
  if (!zone) return;
  if (!texte) { zone.innerHTML = ""; return; }
  zone.innerHTML = `<div class="message message-${type === "succes" ? "succes" : "erreur"}">${echapper(texte)}</div>`;
}

// ---------------------------------------------------------------------------
// Confirmation intégrée au site (remplace les popups « confirm() » du
// navigateur, qui affichent l'adresse du site et ne peuvent pas être stylées).
// Utilisation : const ok = await confirmerAction("Message...", "Titre");
// ---------------------------------------------------------------------------

function confirmerAction(message, titre) {
  return new Promise((resolve) => {
    const modale = document.getElementById("modale-confirmation");
    const boutonValider = document.getElementById("bouton-confirmation-valider");
    const boutonAnnuler = document.getElementById("bouton-confirmation-annuler");
    document.getElementById("titre-modale-confirmation").textContent = titre || "Confirmer";
    document.getElementById("texte-modale-confirmation").textContent = message;

    function nettoyer(resultat) {
      modale.classList.add("cache");
      boutonValider.removeEventListener("click", surValider);
      boutonAnnuler.removeEventListener("click", surAnnuler);
      modale.removeEventListener("click", surClicFond);
      document.removeEventListener("keydown", surEchap);
      resolve(resultat);
    }
    function surValider() { nettoyer(true); }
    function surAnnuler() { nettoyer(false); }
    function surClicFond(ev) { if (ev.target === modale) nettoyer(false); }
    function surEchap(ev) { if (ev.key === "Escape") nettoyer(false); }

    boutonValider.addEventListener("click", surValider);
    boutonAnnuler.addEventListener("click", surAnnuler);
    modale.addEventListener("click", surClicFond);
    document.addEventListener("keydown", surEchap);
    modale.classList.remove("cache");
    boutonAnnuler.focus();
  });
}

// ---------------------------------------------------------------------------
// Démarrage de la page
// ---------------------------------------------------------------------------

async function demarrer() {
  // Discord nous renvoie ici avec ?d8=... pour indiquer ce qui s'est passé
  // (voir discordCallback côté serveur). On lit cette info puis on nettoie
  // l'adresse pour qu'un rechargement de page ne la réaffiche pas.
  const params = new URLSearchParams(window.location.search);
  const etat = params.get("d8");
  if (etat) window.history.replaceState({}, "", window.location.pathname);

  try {
    const moi = await appelAPI("/api/moi");
    if (moi.connecte) {
      SESSION = {
        connecte: true,
        pseudo: moi.pseudo,
        grade: moi.grade,
        direction: !!moi.direction,
        peutGererAnnonces: !!moi.peut_gerer_annonces,
      };
      return demarrerEspaceAdmin();
    }
  } catch (e) {
    // Non connecté : on continue vers l'écran de connexion.
  }

  if (etat === "attente") {
    document.getElementById("bloc-connexion").classList.add("cache");
    document.getElementById("bloc-attente").classList.remove("cache");
  } else if (etat === "desactive") {
    afficherMessage("zone-message", "Ce compte est désactivé. Contactez la Direction si vous pensez qu'il s'agit d'une erreur.", "erreur");
  } else if (etat === "config") {
    afficherMessage("zone-message", "La connexion Discord n'est pas encore configurée sur le serveur.", "erreur");
  } else if (etat === "erreur") {
    afficherMessage("zone-message", "La connexion via Discord a échoué. Réessayez.", "erreur");
  }
}

document.getElementById("bouton-deconnexion").addEventListener("click", async () => {
  try { await appelAPI("/api/deconnexion", { method: "POST" }); } catch (e) {}
  window.location.reload();
});

// ---------------------------------------------------------------------------
// Espace admin (une fois connecté)
// ---------------------------------------------------------------------------

function initialesPseudo(pseudo) {
  const mots = String(pseudo || "").trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return "?";
  return mots.slice(0, 2).map((m) => m[0].toUpperCase()).join("");
}

function demarrerEspaceAdmin() {
  document.body.classList.add("admin-connecte");
  document.getElementById("pseudo-connecte").textContent = SESSION.pseudo;
  document.getElementById("grade-connecte").textContent = SESSION.grade || "—";
  document.getElementById("avatar-connecte").textContent = initialesPseudo(SESSION.pseudo);
  // Un membre sans droits sur les annonces (grade "Stagiaire") n'a accès qu'à son profil.
  document.getElementById("onglet-annonces").classList.toggle("cache", !SESSION.peutGererAnnonces);
  if (SESSION.direction) {
    document.getElementById("onglet-comptes").classList.remove("cache");
  }
  document.querySelectorAll(".lien-onglet").forEach((btn) => {
    btn.addEventListener("click", () => basculerOnglet(btn.dataset.onglet));
  });
  const ongletDepart = SESSION.peutGererAnnonces ? "annonces" : "profil";
  basculerOnglet(ongletDepart);
  if (ongletDepart === "annonces") chargerTableBiens();
}

function basculerOnglet(nom) {
  document.querySelectorAll(".lien-onglet").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  document.getElementById("panneau-annonces").classList.toggle("cache", nom !== "annonces");
  document.getElementById("panneau-profil").classList.toggle("cache", nom !== "profil");
  document.getElementById("panneau-comptes").classList.toggle("cache", nom !== "comptes");
  if (nom === "profil") chargerMonProfil();
  if (nom === "comptes") chargerTableMembres();
}

// ---------------------------------------------------------------------------
// Onglet « Mon profil » — chaque membre édite sa propre fiche publique
// (photo, poste, spécialité, biographie, LinkedIn), affichée sur /equipe.html.
// Ne touche jamais au grade (droits d'accès), qui reste réservé à la Direction.
// ---------------------------------------------------------------------------

async function chargerMonProfil() {
  afficherMessage("zone-message-profil", "", null);
  try {
    const moiActuel = await appelAPI("/api/moi");
    document.getElementById("profil-poste").value = moiActuel.poste || "";
    document.getElementById("profil-specialite").value = moiActuel.specialite || "";
    document.getElementById("profil-bio").value = moiActuel.bio || "";
    PHOTO_PROFIL = moiActuel.photo || "";
    majApercuPhotoProfil();
    majCompteurBioProfil();
  } catch (e) {
    afficherMessage("zone-message-profil", "Impossible de charger votre profil : " + e.message, "erreur");
  }
}

function majApercuPhotoProfil() {
  const apercu = document.getElementById("profil-photo-apercu");
  apercu.innerHTML = PHOTO_PROFIL
    ? `<img src="${PHOTO_PROFIL}" alt="Photo de profil">`
    : `<span>${initialesPseudo(SESSION.pseudo)}</span>`;
  document.getElementById("bouton-profil-photo-retirer").classList.toggle("cache", !PHOTO_PROFIL);
}

function majCompteurBioProfil() {
  const n = document.getElementById("profil-bio").value.length;
  document.getElementById("profil-bio-compteur").textContent = n + " / 1000";
}

document.getElementById("profil-bio").addEventListener("input", majCompteurBioProfil);

document.getElementById("bouton-profil-photo").addEventListener("click", () => {
  document.getElementById("profil-photo-fichier").click();
});

document.getElementById("profil-photo-fichier").addEventListener("change", async (ev) => {
  const fichier = (ev.target.files || [])[0];
  ev.target.value = ""; // permet de resélectionner le même fichier plus tard si besoin
  if (!fichier) return;
  const erreur = document.getElementById("erreur-profil-photo");
  erreur.classList.add("cache");
  try {
    PHOTO_PROFIL = await redimensionnerImage(fichier, 480, 0.82);
    majApercuPhotoProfil();
  } catch (e) {
    erreur.textContent = e.message;
    erreur.classList.remove("cache");
  }
});

document.getElementById("bouton-profil-photo-retirer").addEventListener("click", () => {
  PHOTO_PROFIL = "";
  majApercuPhotoProfil();
});

document.getElementById("formulaire-profil").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-profil", "", null);
  const bouton = document.getElementById("bouton-enregistrer-profil");
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";
  try {
    await appelAPI("/api/moi", {
      method: "PUT",
      body: JSON.stringify({
        poste: document.getElementById("profil-poste").value.trim(),
        specialite: document.getElementById("profil-specialite").value.trim(),
        bio: document.getElementById("profil-bio").value.trim(),
        photo: PHOTO_PROFIL,
      }),
    });
    afficherMessage("zone-message-profil", "Profil enregistré ✓ Les changements sont déjà visibles sur la page équipe du site.", "succes");
  } catch (e) {
    afficherMessage("zone-message-profil", e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
  }
});

// ---------------------------------------------------------------------------
// Gestion des annonces (biens)
// ---------------------------------------------------------------------------

async function chargerTableBiens() {
  const corps = document.getElementById("corps-table-biens");
  corps.innerHTML = `<tr><td colspan="7">Chargement…</td></tr>`;
  afficherMessage("zone-message-annonces", "", null);
  try {
    const data = await appelAPI("/api/biens");
    CACHE_BIENS = data.biens || [];
    actualiserVueAnnonces();
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="7">Erreur de chargement : ${echapper(e.message)}</td></tr>`;
  }
}

// ---- statut / statistiques / filtres -----------------------------------

function statutBien(b) {
  if (b.vendu) return "vendu";
  return b.disponible ? "visible" : "masquee";
}

function calculerStatsBiens(liste) {
  const total = liste.length;
  const visibles = liste.filter((b) => b.disponible).length;
  const valeurTotale = liste.reduce((s, b) => s + (b.dispo_vente ? Number(b.prix) || 0 : 0), 0);
  const prixMoyen = total ? Math.round(valeurTotale / total) : 0;
  return { total, visibles, valeurTotale, prixMoyen };
}

function rendreStats() {
  const s = calculerStatsBiens(CACHE_BIENS);
  document.getElementById("admin-stats").innerHTML = `
    <div class="stat-carte">
      <span class="stat-icone stat-icone--or">🏠</span>
      <div><div class="stat-valeur">${s.total}</div><div class="stat-libelle">Annonces</div><div class="stat-sous-libelle">Total des biens</div></div>
    </div>
    <div class="stat-carte">
      <span class="stat-icone stat-icone--vert">👁️</span>
      <div><div class="stat-valeur">${s.visibles}</div><div class="stat-libelle">Visibles</div><div class="stat-sous-libelle">En ligne</div></div>
    </div>
    <div class="stat-carte">
      <span class="stat-icone stat-icone--ambre">🏷️</span>
      <div><div class="stat-valeur">${formaterPrix(s.valeurTotale)}</div><div class="stat-libelle">Valeur totale</div><div class="stat-sous-libelle">Estimation du catalogue</div></div>
    </div>
    <div class="stat-carte">
      <span class="stat-icone stat-icone--mauve">📈</span>
      <div><div class="stat-valeur">${formaterPrix(s.prixMoyen)}</div><div class="stat-libelle">Prix moyen</div><div class="stat-sous-libelle">Par bien</div></div>
    </div>`;
}

function biensFiltres() {
  const q = FILTRE_RECHERCHE.trim().toLowerCase();
  return CACHE_BIENS.filter((b) => {
    if (FILTRE_CATEGORIE && b.categorie !== FILTRE_CATEGORIE) return false;
    if (FILTRE_STATUT && statutBien(b) !== FILTRE_STATUT) return false;
    if (q) {
      const cible = [b.titre, ETIQUETTES_CATEGORIE[b.categorie] || b.categorie, b.sous_categorie, b.coherence]
        .filter(Boolean).join(" ").toLowerCase();
      if (!cible.includes(q)) return false;
    }
    return true;
  });
}

// ---- rendu : tableau, grille et pagination -------------------------------

function ligneVignetteHTML(b) {
  return `<div class="table-biens-vignette">${b.images && b.images[0] ? `<img src="${b.images[0]}" alt="">` : ""}</div>`;
}

function rendreTableBiens(liste) {
  const corps = document.getElementById("corps-table-biens");
  corps.innerHTML = liste.map((b) => `
    <tr class="${b.coup_de_coeur ? "ligne-coup-de-coeur" : ""}">
      <td class="cellule-vignette">${ligneVignetteHTML(b)}</td>
      <td>${echapper(b.titre)}${b.coup_de_coeur ? ' <span class="puce puce-or">Coup de cœur</span>' : ""}${b.standing ? ' <span class="puce puce-or">Exception</span>' : ""}</td>
      <td>${ETIQUETTES_CATEGORIE[b.categorie] || b.categorie}</td>
      <td>${echapper(b.sous_categorie || "—")}${b.coherence ? ` <span class="champ-aide" style="display:inline;">· ${echapper(b.coherence)}</span>` : ""}</td>
      <td>${b.dispo_vente ? formaterPrix(b.prix) : ""}${b.dispo_vente && b.dispo_location ? " · " : ""}${b.dispo_location ? formaterPrix(b.prix_location) + " /sem." : ""}</td>
      <td>${b.vendu ? '<span class="puce puce-or">Vendu</span>' : (b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-off">Masquée</span>')}</td>
      <td><div class="actions-ligne">
        <button class="actions-icone" data-editer="${b.id}" title="Modifier" aria-label="Modifier">✏️</button>
        <button class="actions-icone actions-icone--danger" data-supprimer="${b.id}" title="Supprimer" aria-label="Supprimer">🗑️</button>
      </div></td>
    </tr>`).join("");
  corps.querySelectorAll("[data-editer]").forEach((btn) => btn.addEventListener("click", () => ouvrirModaleBien(Number(btn.dataset.editer))));
  corps.querySelectorAll("[data-supprimer]").forEach((btn) => btn.addEventListener("click", () => supprimerBienDepuisListe(Number(btn.dataset.supprimer))));
}

function rendreGrilleBiens(liste) {
  const conteneur = document.getElementById("vue-grille-biens");
  conteneur.innerHTML = liste.map((b) => `
    <div class="carte-admin-bien ${b.coup_de_coeur ? "ligne-coup-de-coeur" : ""}">
      <div class="carte-admin-bien-visuel">${b.images && b.images[0] ? `<img src="${b.images[0]}" alt="">` : ""}</div>
      <div class="carte-admin-bien-corps">
        <div class="carte-admin-bien-titre">${echapper(b.titre)}</div>
        <div class="carte-admin-bien-meta">${ETIQUETTES_CATEGORIE[b.categorie] || b.categorie}${b.sous_categorie ? " · " + echapper(b.sous_categorie) : ""}</div>
        <div>${b.vendu ? '<span class="puce puce-or">Vendu</span>' : (b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-off">Masquée</span>')}${b.coup_de_coeur ? ' <span class="puce puce-or">Coup de cœur</span>' : ""}</div>
        <div class="carte-admin-bien-pied">
          <span class="carte-admin-bien-prix">${b.dispo_vente ? formaterPrix(b.prix) : (b.dispo_location ? formaterPrix(b.prix_location) + " /sem." : "—")}</span>
          <div class="carte-admin-bien-actions">
            <button class="actions-icone" data-editer="${b.id}" title="Modifier" aria-label="Modifier">✏️</button>
            <button class="actions-icone actions-icone--danger" data-supprimer="${b.id}" title="Supprimer" aria-label="Supprimer">🗑️</button>
          </div>
        </div>
      </div>
    </div>`).join("");
  conteneur.querySelectorAll("[data-editer]").forEach((btn) => btn.addEventListener("click", () => ouvrirModaleBien(Number(btn.dataset.editer))));
  conteneur.querySelectorAll("[data-supprimer]").forEach((btn) => btn.addEventListener("click", () => supprimerBienDepuisListe(Number(btn.dataset.supprimer))));
}

function rendrePagination(totalFiltre) {
  const conteneur = document.getElementById("annonces-pagination");
  if (!totalFiltre) { conteneur.innerHTML = ""; return; }
  const totalPages = Math.max(1, Math.ceil(totalFiltre / TAILLE_PAGE_BIENS));
  const debut = (PAGE_BIENS - 1) * TAILLE_PAGE_BIENS + 1;
  const fin = Math.min(totalFiltre, PAGE_BIENS * TAILLE_PAGE_BIENS);
  let pages = "";
  for (let p = 1; p <= totalPages; p++) {
    pages += `<button type="button" class="pagination-page ${p === PAGE_BIENS ? "actif" : ""}" data-page="${p}">${p}</button>`;
  }
  conteneur.innerHTML = `
    <span>Affichage de ${debut} à ${fin} sur ${totalFiltre} résultat${totalFiltre > 1 ? "s" : ""}</span>
    <div class="pagination-boutons">
      <button type="button" class="pagination-fleche" id="pagination-precedent" ${PAGE_BIENS <= 1 ? "disabled" : ""} aria-label="Page précédente">‹</button>
      ${pages}
      <button type="button" class="pagination-fleche" id="pagination-suivant" ${PAGE_BIENS >= totalPages ? "disabled" : ""} aria-label="Page suivante">›</button>
    </div>`;
  const boutonPrecedent = document.getElementById("pagination-precedent");
  const boutonSuivant = document.getElementById("pagination-suivant");
  if (boutonPrecedent) boutonPrecedent.addEventListener("click", () => { PAGE_BIENS--; actualiserVueAnnonces(); });
  if (boutonSuivant) boutonSuivant.addEventListener("click", () => { PAGE_BIENS++; actualiserVueAnnonces(); });
  conteneur.querySelectorAll("[data-page]").forEach((btn) => btn.addEventListener("click", () => { PAGE_BIENS = Number(btn.dataset.page); actualiserVueAnnonces(); }));
}

function actualiserVueAnnonces() {
  rendreStats();
  document.getElementById("bouton-reinitialiser-filtres").classList.toggle("cache", !(FILTRE_RECHERCHE || FILTRE_CATEGORIE || FILTRE_STATUT));

  const corps = document.getElementById("corps-table-biens");
  if (!CACHE_BIENS.length) {
    corps.innerHTML = `<tr><td colspan="7">Aucune annonce pour le moment. Cliquez sur « Nouvelle annonce » pour commencer.</td></tr>`;
    document.getElementById("vue-grille-biens").innerHTML = "";
    document.getElementById("annonces-pagination").innerHTML = "";
    return;
  }

  const filtres = biensFiltres();
  const totalPages = Math.max(1, Math.ceil(filtres.length / TAILLE_PAGE_BIENS));
  if (PAGE_BIENS > totalPages) PAGE_BIENS = totalPages;
  if (PAGE_BIENS < 1) PAGE_BIENS = 1;

  if (!filtres.length) {
    corps.innerHTML = `<tr><td colspan="7">Aucune annonce ne correspond à ces filtres.</td></tr>`;
    document.getElementById("vue-grille-biens").innerHTML = `<div class="etat-vide">Aucune annonce ne correspond à ces filtres.</div>`;
    document.getElementById("annonces-pagination").innerHTML = "";
    return;
  }

  const debut = (PAGE_BIENS - 1) * TAILLE_PAGE_BIENS;
  const page = filtres.slice(debut, debut + TAILLE_PAGE_BIENS);
  rendreTableBiens(page);
  rendreGrilleBiens(page);
  rendrePagination(filtres.length);
}

async function supprimerBienDepuisListe(id) {
  const ok = await confirmerAction("Cette action est définitive et ne peut pas être annulée.", "Supprimer cette annonce ?");
  if (!ok) return;
  try {
    await appelAPI("/api/biens?id=" + id, { method: "DELETE" });
    await chargerTableBiens();
    afficherMessage("zone-message-annonces", "Annonce supprimée avec succès.", "succes");
  } catch (e) {
    afficherMessage("zone-message-annonces", e.message, "erreur");
  }
}

// ---- barre d'outils : recherche, filtres, bascule liste/grille -----------

function appliquerModeVueBiens() {
  document.getElementById("vue-liste-biens").classList.toggle("cache", MODE_VUE_BIENS !== "liste");
  document.getElementById("vue-grille-biens").classList.toggle("cache", MODE_VUE_BIENS !== "grille");
  document.getElementById("bouton-vue-liste").classList.toggle("actif", MODE_VUE_BIENS === "liste");
  document.getElementById("bouton-vue-liste").setAttribute("aria-pressed", String(MODE_VUE_BIENS === "liste"));
  document.getElementById("bouton-vue-grille").classList.toggle("actif", MODE_VUE_BIENS === "grille");
  document.getElementById("bouton-vue-grille").setAttribute("aria-pressed", String(MODE_VUE_BIENS === "grille"));
}
document.getElementById("bouton-vue-liste").addEventListener("click", () => { MODE_VUE_BIENS = "liste"; appliquerModeVueBiens(); });
document.getElementById("bouton-vue-grille").addEventListener("click", () => { MODE_VUE_BIENS = "grille"; appliquerModeVueBiens(); });
appliquerModeVueBiens();

document.getElementById("recherche-biens").addEventListener("input", (ev) => {
  FILTRE_RECHERCHE = ev.target.value;
  PAGE_BIENS = 1;
  actualiserVueAnnonces();
});
document.getElementById("filtre-categorie").addEventListener("change", (ev) => {
  FILTRE_CATEGORIE = ev.target.value;
  PAGE_BIENS = 1;
  actualiserVueAnnonces();
});
document.getElementById("filtre-statut").addEventListener("change", (ev) => {
  FILTRE_STATUT = ev.target.value;
  PAGE_BIENS = 1;
  actualiserVueAnnonces();
});
document.getElementById("bouton-reinitialiser-filtres").addEventListener("click", () => {
  FILTRE_RECHERCHE = "";
  FILTRE_CATEGORIE = "";
  FILTRE_STATUT = "";
  PAGE_BIENS = 1;
  document.getElementById("recherche-biens").value = "";
  document.getElementById("filtre-categorie").value = "";
  document.getElementById("filtre-statut").value = "";
  actualiserVueAnnonces();
});

// ---- catégorie / sous-catégorie (cascade) ---------------------------------

function remplirSousCategories(categorie, valeurSelectionnee) {
  const select = document.getElementById("bien-sous-categorie");
  document.getElementById("ligne-bien-meuble").classList.toggle("cache", categorie !== "habitation");
  if (categorie === "habitation") {
    select.disabled = false;
    select.innerHTML = SOUS_CATEGORIES_HABITATION.map(
      (s) => `<option value="${echapper(s)}">${echapper(s)}</option>`
    ).join("");
    select.value = SOUS_CATEGORIES_HABITATION.includes(valeurSelectionnee) ? valeurSelectionnee : SOUS_CATEGORIES_HABITATION[0];
  } else {
    select.disabled = true;
    select.innerHTML = '<option value="">Aucune (catégorie Garage)</option>';
  }
  // La cohérence par défaut suit la catégorie choisie (l'agent peut la changer ensuite).
  const coherence = document.getElementById("bien-coherence");
  if (coherence && !coherence.dataset.modifieManuellement) {
    coherence.value = categorie === "garage" ? "Garage" : "Habitation";
  }
}

document.getElementById("bien-categorie").addEventListener("change", (ev) => {
  remplirSousCategories(ev.target.value, "");
});

document.getElementById("bien-coherence").addEventListener("change", (ev) => {
  ev.target.dataset.modifieManuellement = "1";
});

// ---- transaction : vente et/ou location, chacune avec sa propre ligne de prix -----

document.getElementById("bien-dispo-vente").addEventListener("change", (ev) => {
  document.getElementById("ligne-bien-prix-vente").classList.toggle("cache", !ev.target.checked);
});
document.getElementById("bien-dispo-location").addEventListener("change", (ev) => {
  document.getElementById("ligne-bien-prix-location").classList.toggle("cache", !ev.target.checked);
});

// ---- photos : ajout par URL ou depuis l'ordinateur, prévisualisation ------

function redimensionnerImage(fichier, largeurMax = 1280, qualite = 0.72) {
  return new Promise((resolve, reject) => {
    if (!fichier.type.startsWith("image/")) return reject(new Error(`« ${fichier.name} » n'est pas une image.`));
    if (fichier.size > 15 * 1024 * 1024) return reject(new Error(`« ${fichier.name} » dépasse 15 Mo.`));
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error(`Impossible de lire « ${fichier.name} ».`));
    lecteur.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(`Fichier image invalide : « ${fichier.name} ».`));
      image.onload = () => {
        let { width, height } = image;
        if (width > largeurMax) {
          height = Math.round(height * (largeurMax / width));
          width = largeurMax;
        }
        const toile = document.createElement("canvas");
        toile.width = width;
        toile.height = height;
        toile.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(toile.toDataURL("image/jpeg", qualite));
      };
      image.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

function afficherErreurImages(texte) {
  const erreur = document.getElementById("erreur-bien-images");
  if (!texte) { erreur.classList.add("cache"); return; }
  erreur.textContent = texte;
  erreur.classList.remove("cache");
}

function redessinerImagesBien() {
  const grille = document.getElementById("bien-images-grille");
  grille.innerHTML = IMAGES_BIEN.map((src, i) => `
    <div class="bien-images-vignette">
      <img src="${src}" alt="Photo ${i + 1} du bien">
      ${i === 0 ? '<span class="bien-images-principale">Principale</span>' : ""}
      <button type="button" class="bien-images-retirer" data-retirer="${i}" aria-label="Retirer cette photo">✕</button>
    </div>`).join("");
  grille.querySelectorAll("[data-retirer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      IMAGES_BIEN.splice(Number(btn.dataset.retirer), 1);
      redessinerImagesBien();
    });
  });
  document.getElementById("bien-images-compteur").textContent = IMAGES_BIEN.length + " / 5";
  const complet = IMAGES_BIEN.length >= 5;
  document.getElementById("bouton-parcourir").disabled = complet;
  afficherErreurImages(complet ? "Limite de 5 photos atteinte. Retirez une photo pour en ajouter une autre." : "");
}

function ajouterImageBien(valeur) {
  if (IMAGES_BIEN.length >= 5) return;
  IMAGES_BIEN.push(valeur);
  redessinerImagesBien();
}

document.getElementById("bouton-parcourir").addEventListener("click", () => {
  document.getElementById("bien-image-fichier").click();
});

document.getElementById("bien-image-fichier").addEventListener("change", async (ev) => {
  const fichiers = Array.from(ev.target.files || []);
  ev.target.value = ""; // permet de resélectionner le même fichier plus tard si besoin
  const place = 5 - IMAGES_BIEN.length;
  for (const fichier of fichiers.slice(0, place)) {
    try {
      ajouterImageBien(await redimensionnerImage(fichier));
    } catch (e) {
      afficherErreurImages(e.message);
    }
  }
  if (fichiers.length > place && place > 0) {
    afficherErreurImages(`Seules les ${place} premières photos ont été ajoutées (limite de 5).`);
  }
});

// ---- barre d'outils de la description (gras / italique / emoji) + aperçu en direct ----

const EMOJIS_DESCRIPTION = [
  "🏠", "🏢", "🏙️", "🌴", "🚗", "🛏️", "🛋️", "🚿",
  "🛁", "🍽️", "🎉", "🍸", "💰", "🔑", "📍", "✨",
  "⭐", "🔥", "🌊", "🏊", "🎮", "🖥️", "🧳", "✅",
];

function majApercuDescription() {
  const apercu = document.getElementById("apercu-description");
  const texte = document.getElementById("bien-description").value;
  apercu.innerHTML = analyserDescription(texte);
  apercu.classList.toggle("vide", !texte.trim());
}

// Entoure la sélection en cours dans la description du marqueur donné (ex: "**"
// pour le gras). S'il n'y a rien de sélectionné, insère un texte d'exemple à
// la place, déjà sélectionné, pour que l'agent puisse taper par-dessus.
function entourerDescription(marqueur, texteParDefaut) {
  const champ = document.getElementById("bien-description");
  const debut = champ.selectionStart;
  const fin = champ.selectionEnd;
  const valeur = champ.value;
  const selection = valeur.slice(debut, fin) || texteParDefaut;
  champ.value = valeur.slice(0, debut) + marqueur + selection + marqueur + valeur.slice(fin);
  const nouveauDebut = debut + marqueur.length;
  champ.focus();
  champ.setSelectionRange(nouveauDebut, nouveauDebut + selection.length);
  majApercuDescription();
}

document.getElementById("bien-description").addEventListener("input", majApercuDescription);
document.getElementById("bouton-description-gras").addEventListener("click", () => entourerDescription("**", "texte en gras"));
document.getElementById("bouton-description-italique").addEventListener("click", () => entourerDescription("*", "texte en italique"));

const boutonEmoji = document.getElementById("bouton-description-emoji");
const panneauEmoji = document.getElementById("panneau-description-emoji");
panneauEmoji.innerHTML = EMOJIS_DESCRIPTION.map((e) => `<button type="button" class="emoji-bouton">${e}</button>`).join("");
boutonEmoji.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const ouvert = panneauEmoji.classList.contains("cache");
  panneauEmoji.classList.toggle("cache", !ouvert);
  boutonEmoji.setAttribute("aria-expanded", String(ouvert));
});
panneauEmoji.querySelectorAll(".emoji-bouton").forEach((btn) => {
  btn.addEventListener("click", () => {
    const champ = document.getElementById("bien-description");
    const debut = champ.selectionStart;
    const fin = champ.selectionEnd;
    champ.value = champ.value.slice(0, debut) + btn.textContent + champ.value.slice(fin);
    const position = debut + btn.textContent.length;
    champ.focus();
    champ.setSelectionRange(position, position);
    panneauEmoji.classList.add("cache");
    boutonEmoji.setAttribute("aria-expanded", "false");
    majApercuDescription();
  });
});
document.addEventListener("click", (ev) => {
  if (!panneauEmoji.contains(ev.target) && ev.target !== boutonEmoji) {
    panneauEmoji.classList.add("cache");
    boutonEmoji.setAttribute("aria-expanded", "false");
  }
});

// ---- ouverture / fermeture de la modale, avec protection contre la perte de données ----

function etatFormulaireBien() {
  return JSON.stringify({
    titre: document.getElementById("bien-titre").value,
    categorie: document.getElementById("bien-categorie").value,
    sousCategorie: document.getElementById("bien-sous-categorie").value,
    meuble: document.getElementById("bien-meuble").checked,
    dispoVente: document.getElementById("bien-dispo-vente").checked,
    prixVente: document.getElementById("bien-prix-vente").value,
    dispoLocation: document.getElementById("bien-dispo-location").checked,
    prixLocation: document.getElementById("bien-prix-location").value,
    places: document.getElementById("bien-places").value,
    coffre: document.getElementById("bien-coffre").value,
    coherence: document.getElementById("bien-coherence").value,
    vip: document.getElementById("bien-vip").value,
    description: document.getElementById("bien-description").value,
    images: IMAGES_BIEN,
    coupDeCoeur: document.getElementById("bien-coup-de-coeur").checked,
    disponible: document.getElementById("bien-disponible").checked,
    vendu: document.getElementById("bien-vendu").checked,
    standing: document.getElementById("bien-standing").checked,
  });
}

function ouvrirModaleBien(id) {
  const bien = id ? CACHE_BIENS.find((b) => b.id === id) : null;
  document.getElementById("titre-modale-bien").textContent = bien ? "Modifier l'annonce" : "Nouvelle annonce";
  document.getElementById("bien-id").value = bien ? bien.id : "";
  document.getElementById("bien-titre").value = bien ? bien.titre : "";
  const categorie = bien ? bien.categorie : "habitation";
  document.getElementById("bien-categorie").value = categorie;
  remplirSousCategories(categorie, bien ? bien.sous_categorie || "" : "");
  document.getElementById("bien-meuble").checked = bien ? !!bien.meuble : true;
  document.getElementById("bien-places").value = bien && bien.places != null ? bien.places : "";
  const dispoVente = bien ? !!bien.dispo_vente : true;
  const dispoLocation = bien ? !!bien.dispo_location : false;
  document.getElementById("bien-dispo-vente").checked = dispoVente;
  document.getElementById("bien-prix-vente").value = bien && bien.dispo_vente ? bien.prix : "";
  document.getElementById("ligne-bien-prix-vente").classList.toggle("cache", !dispoVente);
  document.getElementById("bien-dispo-location").checked = dispoLocation;
  document.getElementById("bien-prix-location").value = bien && bien.dispo_location ? bien.prix_location : "";
  document.getElementById("ligne-bien-prix-location").classList.toggle("cache", !dispoLocation);
  document.getElementById("bien-coffre").value = bien && bien.coffre_kg != null ? bien.coffre_kg : "";
  const champCoherence = document.getElementById("bien-coherence");
  champCoherence.value = bien && bien.coherence ? bien.coherence : (categorie === "garage" ? "Garage" : "Habitation");
  delete champCoherence.dataset.modifieManuellement;
  document.getElementById("bien-vip").value = bien ? bien.vip || "" : "";
  document.getElementById("bien-description").value = bien ? bien.description || "" : "";
  majApercuDescription();
  document.getElementById("bien-coup-de-coeur").checked = !!(bien && bien.coup_de_coeur);
  document.getElementById("bien-disponible").checked = bien ? !!bien.disponible : true;
  document.getElementById("bien-vendu").checked = !!(bien && bien.vendu);
  document.getElementById("bien-standing").checked = !!(bien && bien.standing);
  document.getElementById("bouton-supprimer-bien").classList.toggle("cache", !bien);
  document.querySelectorAll("#formulaire-bien .champ-erreur").forEach((p) => p.classList.add("cache"));
  afficherMessage("zone-message-modale-bien", "", null);
  IMAGES_BIEN = bien && bien.images ? bien.images.slice(0, 5) : [];
  redessinerImagesBien();
  document.getElementById("modale-bien").classList.remove("cache");
  ETAT_INITIAL_BIEN = etatFormulaireBien();
}

function fermerModaleBien() {
  document.getElementById("modale-bien").classList.add("cache");
}

async function demanderFermetureModaleBien() {
  if (etatFormulaireBien() !== ETAT_INITIAL_BIEN) {
    const ok = await confirmerAction("Les modifications saisies seront perdues si vous fermez maintenant.", "Fermer sans enregistrer ?");
    if (!ok) return;
  }
  fermerModaleBien();
}

document.getElementById("bouton-nouveau-bien").addEventListener("click", () => ouvrirModaleBien(null));
document.getElementById("fermer-modale-bien").addEventListener("click", demanderFermetureModaleBien);
document.getElementById("bouton-annuler-bien").addEventListener("click", demanderFermetureModaleBien);
document.getElementById("modale-bien").addEventListener("click", (ev) => { if (ev.target.id === "modale-bien") demanderFermetureModaleBien(); });
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !document.getElementById("modale-bien").classList.contains("cache")) {
    demanderFermetureModaleBien();
  }
});

document.getElementById("formulaire-bien").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-bien", "", null);
  document.querySelectorAll("#formulaire-bien .champ-erreur").forEach((p) => p.classList.add("cache"));

  const titre = document.getElementById("bien-titre").value.trim();
  const dispoVente = document.getElementById("bien-dispo-vente").checked;
  const prixVenteBrut = document.getElementById("bien-prix-vente").value;
  const prixVente = Number(prixVenteBrut);
  const dispoLocation = document.getElementById("bien-dispo-location").checked;
  const prixLocationBrut = document.getElementById("bien-prix-location").value;
  const prixLocation = Number(prixLocationBrut);
  let valide = true;
  if (!titre) {
    document.getElementById("erreur-bien-titre").classList.remove("cache");
    valide = false;
  }
  if (!dispoVente && !dispoLocation) {
    document.getElementById("erreur-bien-transaction").classList.remove("cache");
    valide = false;
  }
  if (dispoVente && (prixVenteBrut === "" || !Number.isFinite(prixVente) || prixVente < 0)) {
    document.getElementById("erreur-bien-prix-vente").classList.remove("cache");
    valide = false;
  }
  if (dispoLocation && (prixLocationBrut === "" || !Number.isFinite(prixLocation) || prixLocation < 0)) {
    document.getElementById("erreur-bien-prix-location").classList.remove("cache");
    valide = false;
  }
  if (!valide) {
    afficherMessage("zone-message-modale-bien", "Corrigez les champs indiqués en rouge avant d'enregistrer.", "erreur");
    return;
  }

  const id = document.getElementById("bien-id").value;
  const categorie = document.getElementById("bien-categorie").value;
  const payload = {
    titre,
    categorie,
    sous_categorie: categorie === "habitation" ? document.getElementById("bien-sous-categorie").value : "",
    meuble: categorie === "habitation" ? document.getElementById("bien-meuble").checked : false,
    places: document.getElementById("bien-places").value === "" ? null : Number(document.getElementById("bien-places").value),
    coffre_kg: document.getElementById("bien-coffre").value === "" ? null : Number(document.getElementById("bien-coffre").value),
    coherence: document.getElementById("bien-coherence").value,
    vip: document.getElementById("bien-vip").value,
    dispo_vente: dispoVente,
    prix: dispoVente ? prixVente : 0,
    dispo_location: dispoLocation,
    prix_location: dispoLocation ? prixLocation : null,
    description: document.getElementById("bien-description").value.trim(),
    images: IMAGES_BIEN.slice(),
    coup_de_coeur: document.getElementById("bien-coup-de-coeur").checked,
    disponible: document.getElementById("bien-disponible").checked,
    vendu: document.getElementById("bien-vendu").checked,
    standing: document.getElementById("bien-standing").checked,
  };
  const boutonEnregistrer = document.querySelector('#formulaire-bien button[type="submit"]');
  const texteInitial = boutonEnregistrer.textContent;
  boutonEnregistrer.disabled = true;
  boutonEnregistrer.textContent = "Enregistrement…";
  try {
    if (id) {
      await appelAPI("/api/biens?id=" + id, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await appelAPI("/api/biens", { method: "POST", body: JSON.stringify(payload) });
    }
    ETAT_INITIAL_BIEN = etatFormulaireBien();
    afficherMessage("zone-message-modale-bien", id ? "Bien mis à jour ✓" : "Bien ajouté avec succès ✓", "succes");
    await chargerTableBiens();
    setTimeout(fermerModaleBien, 800);
  } catch (e) {
    afficherMessage("zone-message-modale-bien", e.message, "erreur");
  } finally {
    boutonEnregistrer.disabled = false;
    boutonEnregistrer.textContent = texteInitial;
  }
});

document.getElementById("bouton-supprimer-bien").addEventListener("click", async () => {
  const id = document.getElementById("bien-id").value;
  if (!id) return;
  const ok = await confirmerAction("Cette action est définitive et ne peut pas être annulée.", "Supprimer cette annonce ?");
  if (!ok) return;
  try {
    await appelAPI("/api/biens?id=" + id, { method: "DELETE" });
    fermerModaleBien();
    chargerTableBiens();
  } catch (e) {
    afficherMessage("zone-message-modale-bien", e.message, "erreur");
  }
});

// ---------------------------------------------------------------------------
// Comptes & accès — réservé à la Direction
// Regroupe les demandes en attente (connexion Discord non reconnue), le
// tableau des comptes (identifiant renommable, grade modifiable en direct,
// suspension, suppression) et la création de comptes pré-autorisés.
// ---------------------------------------------------------------------------

const OPTIONS_GRADES_HTML = GRADES.map((g) => `<option value="${echapper(g.nom)}">${echapper(g.nom)}</option>`).join("");
document.getElementById("membre-grade").innerHTML = OPTIONS_GRADES_HTML;

async function chargerTableMembres() {
  const corps = document.getElementById("corps-table-membres");
  corps.innerHTML = `<tr><td colspan="6">Chargement…</td></tr>`;
  afficherMessage("zone-message-membres", "", null);
  try {
    const data = await appelAPI("/api/membres");
    CACHE_MEMBRES = data.membres || [];
    const enAttente = CACHE_MEMBRES.filter((m) => m.statut === "attente");
    const comptes = CACHE_MEMBRES.filter((m) => m.statut !== "attente");

    document.getElementById("bloc-demandes-attente").classList.toggle("cache", !enAttente.length);
    document.getElementById("compteur-attente").textContent = enAttente.length ? `(${enAttente.length})` : "";
    document.getElementById("liste-demandes-attente").innerHTML = enAttente.map((m) => `
      <div class="demande-attente-ligne">
        <div class="demande-attente-info">
          <span class="admin-avatar">${initialesPseudo(m.pseudo)}</span>
          <div>
            <strong>${echapper(m.pseudo)}</strong>
            <span class="champ-aide">Discord : @${echapper(m.discord_pseudo || "?")}</span>
          </div>
        </div>
        <div class="demande-attente-actions">
          <button type="button" class="btn btn-or btn-petit" data-valider="${m.id}">✓ Valider</button>
          <button type="button" class="btn btn-fantome btn-petit" data-refuser="${m.id}">✕</button>
        </div>
      </div>`).join("");
    document.getElementById("liste-demandes-attente").querySelectorAll("[data-valider]").forEach((btn) => {
      btn.addEventListener("click", () => validerDemande(Number(btn.dataset.valider)));
    });
    document.getElementById("liste-demandes-attente").querySelectorAll("[data-refuser]").forEach((btn) => {
      btn.addEventListener("click", () => refuserDemande(Number(btn.dataset.refuser)));
    });

    if (!comptes.length) {
      corps.innerHTML = `<tr><td colspan="6">Aucun compte pour le moment. Utilisez « + Créer le compte » pour pré-autoriser un pseudo Discord.</td></tr>`;
      return;
    }
    corps.innerHTML = comptes.map((m) => `
      <tr data-ligne="${m.id}">
        <td><input type="text" class="table-input" value="${echapper(m.pseudo)}" data-identifiant="${m.id}" maxlength="40"></td>
        <td>${m.discord_pseudo ? "@" + echapper(m.discord_pseudo) : "—"}</td>
        <td><select class="table-select" data-grade="${m.id}" style="border-color:${couleurGrade(m.grade)};">${OPTIONS_GRADES_HTML}</select></td>
        <td>${m.statut === "invite"
          ? '<span class="puce puce-or" title="Pré-autorisé, en attente de sa première connexion Discord">Invité</span>'
          : (m.actif ? '<span class="puce puce-ok">Actif</span>' : '<span class="puce puce-off">Suspendu</span>')}</td>
        <td>${m.derniere_visite ? echapper(m.derniere_visite) : "Jamais connecté"}</td>
        <td><div class="actions-ligne">
          <button type="button" class="btn btn-fantome btn-petit" data-suspendre="${m.id}" data-actif="${m.actif ? 1 : 0}">${m.actif ? "Suspendre" : "Réactiver"}</button>
          <button type="button" class="actions-icone actions-icone--danger" data-supprimer="${m.id}" title="Supprimer" aria-label="Supprimer">🗑️</button>
        </div></td>
      </tr>`).join("");
    corps.querySelectorAll("[data-grade]").forEach((sel) => {
      sel.value = CACHE_MEMBRES.find((m) => m.id === Number(sel.dataset.grade)).grade;
      sel.style.borderColor = couleurGrade(sel.value);
      sel.addEventListener("change", () => {
        sel.style.borderColor = couleurGrade(sel.value);
        modifierCompte(Number(sel.dataset.grade), { grade: sel.value });
      });
    });
    corps.querySelectorAll("[data-identifiant]").forEach((champ) => {
      champ.addEventListener("change", () => {
        const pseudo = champ.value.trim();
        if (!pseudo) { champ.value = CACHE_MEMBRES.find((m) => m.id === Number(champ.dataset.identifiant)).pseudo; return; }
        modifierCompte(Number(champ.dataset.identifiant), { pseudo });
      });
    });
    corps.querySelectorAll("[data-suspendre]").forEach((btn) => {
      btn.addEventListener("click", () => modifierCompte(Number(btn.dataset.suspendre), { actif: btn.dataset.actif !== "1" }));
    });
    corps.querySelectorAll("[data-supprimer]").forEach((btn) => {
      btn.addEventListener("click", () => supprimerCompte(Number(btn.dataset.supprimer)));
    });
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="6">Erreur de chargement : ${echapper(e.message)}</td></tr>`;
  }
}

async function validerDemande(id) {
  try {
    await appelAPI("/api/membres?id=" + id, { method: "PATCH", body: JSON.stringify({ action: "valider" }) });
    afficherMessage("zone-message-membres", "Accès validé ✓ Vous pouvez ajuster son grade dans le tableau ci-dessous.", "succes");
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-membres", e.message, "erreur");
  }
}

async function refuserDemande(id) {
  const ok = await confirmerAction("La personne devra se reconnecter avec Discord pour refaire une demande.", "Refuser cette demande ?");
  if (!ok) return;
  try {
    await appelAPI("/api/membres?id=" + id, { method: "DELETE" });
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-membres", e.message, "erreur");
  }
}

async function modifierCompte(id, changements) {
  try {
    await appelAPI("/api/membres?id=" + id, { method: "PATCH", body: JSON.stringify(changements) });
    afficherMessage("zone-message-membres", "Compte mis à jour ✓", "succes");
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-membres", e.message, "erreur");
    chargerTableMembres();
  }
}

async function supprimerCompte(id) {
  const ok = await confirmerAction("Cette action est définitive et ne peut pas être annulée.", "Supprimer ce compte ?");
  if (!ok) return;
  try {
    await appelAPI("/api/membres?id=" + id, { method: "DELETE" });
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-membres", e.message, "erreur");
  }
}

function ouvrirModaleMembre() {
  document.getElementById("membre-discord-pseudo").value = "";
  document.getElementById("membre-grade").value = "Stagiaire";
  afficherMessage("zone-message-modale-membre", "", null);
  document.getElementById("modale-membre").classList.remove("cache");
}

function fermerModaleMembre() {
  document.getElementById("modale-membre").classList.add("cache");
}

document.getElementById("bouton-nouveau-membre").addEventListener("click", () => ouvrirModaleMembre());
document.getElementById("fermer-modale-membre").addEventListener("click", fermerModaleMembre);
document.getElementById("modale-membre").addEventListener("click", (ev) => { if (ev.target.id === "modale-membre") fermerModaleMembre(); });

document.getElementById("formulaire-membre").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-membre", "", null);
  const discordPseudo = document.getElementById("membre-discord-pseudo").value.trim();
  const grade = document.getElementById("membre-grade").value;
  try {
    await appelAPI("/api/membres", { method: "POST", body: JSON.stringify({ discord_pseudo: discordPseudo, grade }) });
    fermerModaleMembre();
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-modale-membre", e.message, "erreur");
  }
});

demarrer();
