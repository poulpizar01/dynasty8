// ============================================================================
// Dynasty 8 — logique de l'espace agents (admin.html)
// ============================================================================

let SESSION = null; // { pseudo, grade, direction }
let CACHE_BIENS = [];
let CACHE_MEMBRES = [];
let IMAGES_BIEN = []; // photos du bien en cours d'édition (URLs et/ou images importées)
let ETAT_INITIAL_BIEN = ""; // instantané du formulaire à l'ouverture, pour détecter les changements non enregistrés

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
  try {
    const moi = await appelAPI("/api/moi");
    if (moi.connecte) {
      SESSION = moi;
      return demarrerEspaceAdmin();
    }
  } catch (e) {
    // Non connecté : on continue vers l'écran de connexion.
  }
  try {
    const etat = await appelAPI("/api/init");
    if (etat.premier_demarrage) {
      document.getElementById("bloc-premier-demarrage").classList.remove("cache");
      document.getElementById("bloc-connexion").classList.add("cache");
    }
  } catch (e) {
    afficherMessage("zone-message", "Impossible de contacter le serveur. Réessayez dans un instant.", "erreur");
  }
}

document.getElementById("formulaire-init").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message", "", null);
  const pseudo = document.getElementById("init-pseudo").value.trim();
  try {
    const r = await appelAPI("/api/init", { method: "POST", body: JSON.stringify({ pseudo }) });
    document.getElementById("bloc-premier-demarrage").classList.add("cache");
    document.getElementById("bloc-code-genere").classList.remove("cache");
    document.getElementById("code-genere").textContent = r.code;
  } catch (e) {
    afficherMessage("zone-message", e.message, "erreur");
  }
});

document.getElementById("bouton-code-note").addEventListener("click", () => {
  document.getElementById("bloc-code-genere").classList.add("cache");
  document.getElementById("bloc-connexion").classList.remove("cache");
});

document.getElementById("formulaire-connexion").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message", "", null);
  const bouton = document.getElementById("bouton-connexion");
  bouton.disabled = true;
  bouton.textContent = "Connexion…";
  try {
    const code = document.getElementById("champ-code").value;
    const moi = await appelAPI("/api/connexion", { method: "POST", body: JSON.stringify({ code }) });
    SESSION = { connecte: true, pseudo: moi.pseudo, grade: moi.grade, direction: String(moi.grade).toLowerCase() === "direction" };
    demarrerEspaceAdmin();
  } catch (e) {
    afficherMessage("zone-message", e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = "Se connecter";
  }
});

document.getElementById("bouton-deconnexion").addEventListener("click", async () => {
  try { await appelAPI("/api/deconnexion", { method: "POST" }); } catch (e) {}
  window.location.reload();
});

// ---------------------------------------------------------------------------
// Espace admin (une fois connecté)
// ---------------------------------------------------------------------------

function demarrerEspaceAdmin() {
  document.body.classList.add("admin-connecte");
  document.getElementById("pseudo-connecte").textContent = SESSION.pseudo;
  if (SESSION.direction) {
    document.getElementById("onglet-membres").classList.remove("cache");
  }
  document.querySelectorAll(".lien-onglet").forEach((btn) => {
    btn.addEventListener("click", () => basculerOnglet(btn.dataset.onglet));
  });
  chargerTableBiens();
}

function basculerOnglet(nom) {
  document.querySelectorAll(".lien-onglet").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  document.getElementById("panneau-annonces").classList.toggle("cache", nom !== "annonces");
  document.getElementById("panneau-membres").classList.toggle("cache", nom !== "membres");
  if (nom === "membres") chargerTableMembres();
}

// ---------------------------------------------------------------------------
// Gestion des annonces (biens)
// ---------------------------------------------------------------------------

async function chargerTableBiens() {
  const corps = document.getElementById("corps-table-biens");
  corps.innerHTML = `<tr><td colspan="6">Chargement…</td></tr>`;
  try {
    const data = await appelAPI("/api/biens");
    CACHE_BIENS = data.biens || [];
    if (!CACHE_BIENS.length) {
      corps.innerHTML = `<tr><td colspan="6">Aucune annonce pour le moment. Cliquez sur « Nouvelle annonce » pour commencer.</td></tr>`;
      return;
    }
    corps.innerHTML = CACHE_BIENS.map((b) => `
      <tr>
        <td>${echapper(b.titre)}${b.coup_de_coeur ? ' <span class="puce puce-or">Coup de cœur</span>' : ""}${b.standing ? ' <span class="puce puce-or">Exception</span>' : ""}</td>
        <td>${ETIQUETTES_CATEGORIE[b.categorie] || b.categorie}</td>
        <td>${echapper(b.sous_categorie || "—")}${b.coherence ? ` <span class="champ-aide" style="display:inline;">· ${echapper(b.coherence)}</span>` : ""}</td>
        <td>${formaterPrix(b.prix)}${b.transaction_type === "location" ? " /sem." : ""}</td>
        <td>${b.vendu ? '<span class="puce puce-or">Vendu</span>' : (b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-off">Masquée</span>')}</td>
        <td><div class="actions-ligne"><button class="btn btn-fantome btn-petit" data-editer="${b.id}">Modifier</button></div></td>
      </tr>`).join("");
    corps.querySelectorAll("[data-editer]").forEach((btn) => {
      btn.addEventListener("click", () => ouvrirModaleBien(Number(btn.dataset.editer)));
    });
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="6">Erreur de chargement : ${echapper(e.message)}</td></tr>`;
  }
}

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

// ---- photos : ajout par URL ou depuis l'ordinateur, prévisualisation ------

function redimensionnerImage(fichier) {
  return new Promise((resolve, reject) => {
    if (!fichier.type.startsWith("image/")) return reject(new Error(`« ${fichier.name} » n'est pas une image.`));
    if (fichier.size > 15 * 1024 * 1024) return reject(new Error(`« ${fichier.name} » dépasse 15 Mo.`));
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error(`Impossible de lire « ${fichier.name} ».`));
    lecteur.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(`Fichier image invalide : « ${fichier.name} ».`));
      image.onload = () => {
        const LARGEUR_MAX = 1280;
        let { width, height } = image;
        if (width > LARGEUR_MAX) {
          height = Math.round(height * (LARGEUR_MAX / width));
          width = LARGEUR_MAX;
        }
        const toile = document.createElement("canvas");
        toile.width = width;
        toile.height = height;
        toile.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(toile.toDataURL("image/jpeg", 0.72));
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
  document.getElementById("bien-image-url").disabled = complet;
  document.getElementById("bouton-ajouter-url").disabled = complet;
  document.getElementById("bouton-parcourir").disabled = complet;
  afficherErreurImages(complet ? "Limite de 5 photos atteinte. Retirez une photo pour en ajouter une autre." : "");
}

function ajouterImageBien(valeur) {
  if (IMAGES_BIEN.length >= 5) return;
  IMAGES_BIEN.push(valeur);
  redessinerImagesBien();
}

document.getElementById("bouton-ajouter-url").addEventListener("click", () => {
  const champ = document.getElementById("bien-image-url");
  const valeur = champ.value.trim();
  if (!valeur) return;
  try {
    new URL(valeur);
  } catch (e) {
    afficherErreurImages("Ce lien ne ressemble pas à une adresse valide.");
    return;
  }
  ajouterImageBien(valeur);
  champ.value = "";
});

document.getElementById("bien-image-url").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    document.getElementById("bouton-ajouter-url").click();
  }
});

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

// ---- ouverture / fermeture de la modale, avec protection contre la perte de données ----

function etatFormulaireBien() {
  return JSON.stringify({
    titre: document.getElementById("bien-titre").value,
    categorie: document.getElementById("bien-categorie").value,
    sousCategorie: document.getElementById("bien-sous-categorie").value,
    meuble: document.getElementById("bien-meuble").checked,
    prix: document.getElementById("bien-prix").value,
    transaction: document.getElementById("bien-transaction").value,
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
  document.getElementById("bien-prix").value = bien ? bien.prix : "";
  document.getElementById("bien-transaction").value = bien ? bien.transaction_type : "vente";
  document.getElementById("bien-coffre").value = bien && bien.coffre_kg != null ? bien.coffre_kg : "";
  const champCoherence = document.getElementById("bien-coherence");
  champCoherence.value = bien && bien.coherence ? bien.coherence : (categorie === "garage" ? "Garage" : "Habitation");
  delete champCoherence.dataset.modifieManuellement;
  document.getElementById("bien-vip").value = bien ? bien.vip || "" : "";
  document.getElementById("bien-description").value = bien ? bien.description || "" : "";
  document.getElementById("bien-image-url").value = "";
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
  const prixBrut = document.getElementById("bien-prix").value;
  const prix = Number(prixBrut);
  let valide = true;
  if (!titre) {
    document.getElementById("erreur-bien-titre").classList.remove("cache");
    valide = false;
  }
  if (prixBrut === "" || !Number.isFinite(prix) || prix < 0) {
    document.getElementById("erreur-bien-prix").classList.remove("cache");
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
    prix,
    transaction_type: document.getElementById("bien-transaction").value,
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
// Gestion de l'équipe (membres) — réservé à la Direction
// ---------------------------------------------------------------------------

async function chargerTableMembres() {
  const corps = document.getElementById("corps-table-membres");
  corps.innerHTML = `<tr><td colspan="6">Chargement…</td></tr>`;
  try {
    const data = await appelAPI("/api/membres");
    CACHE_MEMBRES = data.membres || [];
    corps.innerHTML = CACHE_MEMBRES.map((m) => `
      <tr>
        <td>${echapper(m.pseudo)}</td>
        <td>${echapper(m.grade)}</td>
        <td>•••• ${echapper(m.code_indice)}</td>
        <td>${m.actif ? '<span class="puce puce-ok">Actif</span>' : '<span class="puce puce-off">Désactivé</span>'}</td>
        <td>${m.derniere_visite ? echapper(m.derniere_visite) : "Jamais connecté"}</td>
        <td><div class="actions-ligne"><button class="btn btn-fantome btn-petit" data-editer="${m.id}">Modifier</button></div></td>
      </tr>`).join("");
    corps.querySelectorAll("[data-editer]").forEach((btn) => {
      btn.addEventListener("click", () => ouvrirModaleMembre(Number(btn.dataset.editer)));
    });
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="6">Erreur de chargement : ${echapper(e.message)}</td></tr>`;
  }
}

function ouvrirModaleMembre(id) {
  const membre = id ? CACHE_MEMBRES.find((m) => m.id === id) : null;
  document.getElementById("titre-modale-membre").textContent = membre ? "Modifier l'agent" : "Nouvel agent";
  document.getElementById("membre-id").value = membre ? membre.id : "";
  document.getElementById("membre-pseudo").value = membre ? membre.pseudo : "";
  document.getElementById("membre-grade").value = membre ? membre.grade : "Agent";
  document.getElementById("membre-actif").checked = membre ? !!membre.actif : true;
  document.getElementById("ligne-membre-actif").classList.toggle("cache", !membre);
  document.getElementById("bouton-regenerer-code").classList.toggle("cache", !membre);
  document.getElementById("bouton-supprimer-membre").classList.toggle("cache", !membre);
  document.getElementById("bloc-code-membre").classList.add("cache");
  document.getElementById("formulaire-membre").classList.remove("cache");
  afficherMessage("zone-message-modale-membre", "", null);
  document.getElementById("modale-membre").classList.remove("cache");
}

function fermerModaleMembre() {
  document.getElementById("modale-membre").classList.add("cache");
}

document.getElementById("bouton-nouveau-membre").addEventListener("click", () => ouvrirModaleMembre(null));
document.getElementById("fermer-modale-membre").addEventListener("click", fermerModaleMembre);
document.getElementById("modale-membre").addEventListener("click", (ev) => { if (ev.target.id === "modale-membre") fermerModaleMembre(); });

document.getElementById("formulaire-membre").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-membre", "", null);
  const id = document.getElementById("membre-id").value;
  const pseudo = document.getElementById("membre-pseudo").value.trim();
  const grade = document.getElementById("membre-grade").value;
  const actif = document.getElementById("membre-actif").checked;
  try {
    if (id) {
      await appelAPI("/api/membres?id=" + id, { method: "PATCH", body: JSON.stringify({ pseudo, grade, actif }) });
      fermerModaleMembre();
      chargerTableMembres();
    } else {
      const r = await appelAPI("/api/membres", { method: "POST", body: JSON.stringify({ pseudo, grade }) });
      document.getElementById("formulaire-membre").classList.add("cache");
      document.getElementById("bloc-code-membre").classList.remove("cache");
      document.getElementById("code-membre-genere").textContent = r.code;
      chargerTableMembres();
    }
  } catch (e) {
    afficherMessage("zone-message-modale-membre", e.message, "erreur");
  }
});

document.getElementById("bouton-fermer-code-membre").addEventListener("click", fermerModaleMembre);

document.getElementById("bouton-regenerer-code").addEventListener("click", async () => {
  const id = document.getElementById("membre-id").value;
  if (!id) return;
  const ok = await confirmerAction("L'ancien code cessera de fonctionner immédiatement.", "Générer un nouveau code pour cet agent ?");
  if (!ok) return;
  try {
    const r = await appelAPI("/api/membres?id=" + id, { method: "PATCH", body: JSON.stringify({ action: "regenerer" }) });
    document.getElementById("formulaire-membre").classList.add("cache");
    document.getElementById("bloc-code-membre").classList.remove("cache");
    document.getElementById("code-membre-genere").textContent = r.code;
  } catch (e) {
    afficherMessage("zone-message-modale-membre", e.message, "erreur");
  }
});

document.getElementById("bouton-supprimer-membre").addEventListener("click", async () => {
  const id = document.getElementById("membre-id").value;
  if (!id) return;
  const ok = await confirmerAction("Cette action est définitive et ne peut pas être annulée.", "Supprimer l'accès de cet agent ?");
  if (!ok) return;
  try {
    await appelAPI("/api/membres?id=" + id, { method: "DELETE" });
    fermerModaleMembre();
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-modale-membre", e.message, "erreur");
  }
});

demarrer();
