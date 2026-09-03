// ============================================================================
// Dynasty 8 — logique de l'espace agents (admin.html)
// ============================================================================

let SESSION = null; // { pseudo, grade, direction }
let CACHE_BIENS = [];
let CACHE_MEMBRES = [];
let IMAGES_BIEN = []; // photos du bien en cours d'édition (URLs et/ou images importées)
let PHOTO_PROFIL = ""; // photo de profil en cours d'édition (onglet Mon profil)
let PHOTO_PROFIL_COMPTE = ""; // photo en cours d'édition dans la modale « Profil public » (Direction, pour un autre membre)
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
        id: moi.id,
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
  } else if (etat && etat.startsWith("bd_")) {
    afficherMessage("zone-message", "Le service est momentanément indisponible (base de données surchargée). Réessayez dans quelques minutes.", "erreur");
  } else if (etat) {
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
  document.getElementById("messagerie-mon-avatar").textContent = initialesPseudo(SESSION.pseudo);
  document.getElementById("messagerie-mon-pseudo").textContent = SESSION.pseudo;
  // Un membre sans droits sur les annonces (grade "Stagiaire") n'a accès qu'à son profil.
  document.getElementById("onglet-annonces").classList.toggle("cache", !SESSION.peutGererAnnonces);
  if (SESSION.direction) {
    document.getElementById("onglet-comptes").classList.remove("cache");
    document.getElementById("onglet-comptabilite").classList.remove("cache");
    document.getElementById("onglet-statistiques").classList.remove("cache");
    document.getElementById("onglet-parametres").classList.remove("cache");
  }
  // Le lien Webmap est réservé au Patron, au Co Patron, et au Développeur web
  // (qui a exactement les mêmes accès que le Patron, y compris ici).
  document.getElementById("lien-webmap").classList.toggle("cache", !["Patron", "Co Patron", "Développeur web"].includes(SESSION.grade));
  // [data-onglet] exclut volontairement le lien Webmap : c'est un vrai lien externe
  // (nouvel onglet), pas un onglet à basculer dans la page.
  document.querySelectorAll(".lien-onglet[data-onglet]").forEach((btn) => {
    btn.addEventListener("click", () => basculerOnglet(btn.dataset.onglet));
  });
  const ongletDepart = SESSION.peutGererAnnonces ? "annonces" : "profil";
  basculerOnglet(ongletDepart);
  if (ongletDepart === "annonces") chargerTableBiens();
  demarrerMessagerie();
}

function basculerOnglet(nom) {
  document.querySelectorAll(".lien-onglet[data-onglet]").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  document.getElementById("panneau-annonces").classList.toggle("cache", nom !== "annonces");
  document.getElementById("panneau-agenda").classList.toggle("cache", nom !== "agenda");
  document.getElementById("panneau-profil").classList.toggle("cache", nom !== "profil");
  document.getElementById("panneau-comptes").classList.toggle("cache", nom !== "comptes");
  document.getElementById("panneau-comptabilite").classList.toggle("cache", nom !== "comptabilite");
  document.getElementById("panneau-statistiques").classList.toggle("cache", nom !== "statistiques");
  document.getElementById("panneau-parametres").classList.toggle("cache", nom !== "parametres");
  // L'agenda a besoin de toute la largeur disponible (voir style.css) : le
  // reste des onglets garde la mise en page habituelle, limitée en largeur.
  document.getElementById("admin-contenu").classList.toggle("admin-contenu--pleine", nom === "agenda");
  if (nom === "profil") chargerMonProfil();
  if (nom === "comptes") chargerTableMembres();
  if (nom === "agenda") chargerAgenda(true);
  if (nom === "comptabilite") chargerTablette();
  if (nom === "statistiques") { chargerStatistiques(); chargerAgentsStats(); }
  if (nom === "parametres") chargerParametresRoxwood();
}

// ---------------------------------------------------------------------------
// Onglet « Statistiques » — les ventes/locations arrivent automatiquement
// via le bot (POST /api/stats/ventes avec sa clé secrète) ; cet écran se
// contente d'afficher, semaine par semaine, ce qui a déjà été reçu.
// ---------------------------------------------------------------------------
async function chargerStatistiques() {
  afficherMessage("zone-message-statistiques", "", null);
  try {
    const reponse = await appelAPI("/api/stats/semaines");
    const vide = document.getElementById("statistiques-vide");
    const resultat = document.getElementById("statistiques-resultat");
    const recap = document.getElementById("statistiques-recap");
    if (!reponse.semaines || !reponse.semaines.length) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      recap.classList.add("cache");
      return;
    }
    vide.classList.add("cache");
    resultat.classList.remove("cache");
    recap.classList.remove("cache");
    document.getElementById("corps-table-statistiques").innerHTML = reponse.semaines.map((s) => {
      const periode = s.debut && s.fin ? `${formaterDateCourte(s.debut)} → ${formaterDateCourte(s.fin)}` : "—";
      return `<tr><td><strong>${s.code}</strong></td><td>${periode}</td><td>${s.lignes}</td>` +
        `<td><button type="button" class="bouton-lien" data-voir-recap="${s.code}">Voir le récap par agent →</button></td></tr>`;
    }).join("");

    // Le sélecteur de semaine du récap par agent reprend la même liste (déjà
    // triée du plus récent au plus ancien par l'API).
    const select = document.getElementById("select-semaine-recap");
    const semaineChoisieAvant = select.value;
    select.innerHTML = reponse.semaines.map((s) => `<option value="${s.code}">${s.code}</option>`).join("");
    select.value = reponse.semaines.some((s) => s.code === semaineChoisieAvant)
      ? semaineChoisieAvant
      : reponse.semaines[0].code;
    // Même habillage que le menu déroulant de semaine dans DOT (voir plus
    // bas dans ce fichier) — sinon ce menu-ci garde le rendu natif du
    // navigateur, qui détonne sur le thème sombre du site.
    ameliorerSelect(select);
    chargerRecap(select.value);
  } catch (e) {
    afficherMessage("zone-message-statistiques", "Impossible de charger les statistiques : " + e.message, "erreur");
  }
}

document.getElementById("corps-table-statistiques").addEventListener("click", (e) => {
  const bouton = e.target.closest("[data-voir-recap]");
  if (!bouton) return;
  document.getElementById("select-semaine-recap").value = bouton.dataset.voirRecap;
  chargerRecap(bouton.dataset.voirRecap);
  document.getElementById("statistiques-recap").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("select-semaine-recap").addEventListener("change", (e) => chargerRecap(e.target.value));

async function chargerRecap(semaine) {
  if (!semaine) return;
  afficherMessage("zone-message-recap", "", null);
  try {
    const reponse = await appelAPI(`/api/stats/recap?semaine=${encodeURIComponent(semaine)}`);
    const vide = document.getElementById("recap-vide");
    const resultat = document.getElementById("recap-resultat");
    if (!reponse.agents || !reponse.agents.length) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      return;
    }
    vide.classList.add("cache");
    resultat.classList.remove("cache");
    document.getElementById("corps-table-recap").innerHTML = reponse.agents.map((a) => {
      const grade = echapper(a.grade) + (a.gradeConnu ? "" :
        ' <span class="puce puce-or" title="Cet agent n\'est pas encore déclaré dans le référentiel — grade par défaut appliqué.">par défaut</span>');
      return `<tr>
        <td><strong>${echapper(a.identite)}</strong>${a.identiteRp ? `<br><span style="font-size:0.82rem;color:var(--text-faint);">${echapper(a.identiteRp)}</span>` : ""}</td>
        <td>${grade}</td>
        <td>${a.nbAchats}</td>
        <td>${a.nbLocations}</td>
        <td>${a.quotaRealise}</td>
        <td>${formaterArgentStats(a.primeVente)}</td>
        <td>${formaterArgentStats(a.primeLocations)}</td>
        <td><strong>${formaterArgentStats(a.totalAVerser)}</strong></td>
      </tr>`;
    }).join("");
  } catch (e) {
    afficherMessage("zone-message-recap", "Impossible de charger le récapitulatif : " + e.message, "erreur");
  }
}

function formaterDateCourte(isoAAAAMMJJ) {
  const [a, m, j] = String(isoAAAAMMJJ).split("-");
  return `${j}/${m}/${a}`;
}

// Même logique d'espacement des milliers que formaterPrix() (layout.js), mais
// sans le suffixe "HT" : les primes ne sont pas des prix du catalogue.
function formaterArgentStats(valeur) {
  const n = Math.round(Number(valeur) || 0);
  const chiffres = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "-" : "") + chiffres + " $";
}

// ---------------------------------------------------------------------------
// « Gérer les agents » (Statistiques) — référentiel pseudo Discord <->
// identité RP <-> grade (table stats_agents). Ne concerne que les grades
// commerciaux (les mêmes que le moteur de calcul des primes connaît — voir
// GRADES_STATS dans src/stats-calc.js) : Développeur web, DRH et Secrétaire
// de Direction n'ont pas de quota/prime, donc pas de sens ici.
// ---------------------------------------------------------------------------

const NOMS_GRADES_STATS = GRADES
  .filter((g) => !["Développeur web", "DRH", "Secrétaire de Direction"].includes(g.nom))
  .map((g) => g.nom);
const OPTIONS_GRADES_STATS_HTML = NOMS_GRADES_STATS.map((n) => `<option value="${echapper(n)}">${echapper(n)}</option>`).join("");
document.getElementById("agent-grade").innerHTML = OPTIONS_GRADES_STATS_HTML;

let CACHE_AGENTS_STATS = [];

async function chargerAgentsStats() {
  afficherMessage("zone-message-agents", "", null);
  try {
    const reponse = await appelAPI("/api/stats/agents");
    CACHE_AGENTS_STATS = reponse.agents || [];
    const vide = document.getElementById("agents-vide");
    const resultat = document.getElementById("agents-resultat");
    if (!CACHE_AGENTS_STATS.length) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      return;
    }
    vide.classList.add("cache");
    resultat.classList.remove("cache");
    nettoyerSelectsPortee("agents-stats");
    document.getElementById("corps-table-agents").innerHTML = CACHE_AGENTS_STATS.map((a) => `
      <tr data-ligne="${a.id}">
        <td><input type="text" class="table-input" value="${echapper(a.discord_pseudo)}" data-agent-pseudo="${a.id}" maxlength="100"></td>
        <td><input type="text" class="table-input" value="${echapper(a.identite_rp)}" data-agent-rp="${a.id}" maxlength="100" placeholder="—"></td>
        <td><select class="table-select" data-agent-grade="${a.id}" style="border-color:${couleurGrade(a.grade)};">${OPTIONS_GRADES_STATS_HTML}</select></td>
        <td><button type="button" class="actions-icone actions-icone--danger" data-agent-supprimer="${a.id}" title="Supprimer" aria-label="Supprimer">🗑️</button></td>
      </tr>`).join("");
    document.getElementById("corps-table-agents").querySelectorAll("[data-agent-grade]").forEach((sel) => {
      sel.value = CACHE_AGENTS_STATS.find((a) => a.id === Number(sel.dataset.agentGrade)).grade;
      sel.style.borderColor = couleurGrade(sel.value);
      sel.addEventListener("change", () => {
        sel.style.borderColor = couleurGrade(sel.value);
        modifierAgentStats(Number(sel.dataset.agentGrade), { grade: sel.value });
      });
      ameliorerSelect(sel, couleurGrade, "agents-stats");
    });
    document.getElementById("corps-table-agents").querySelectorAll("[data-agent-pseudo]").forEach((champ) => {
      champ.addEventListener("change", () => {
        const pseudo = champ.value.trim();
        if (!pseudo) { champ.value = CACHE_AGENTS_STATS.find((a) => a.id === Number(champ.dataset.agentPseudo)).discord_pseudo; return; }
        modifierAgentStats(Number(champ.dataset.agentPseudo), { discordPseudo: pseudo });
      });
    });
    document.getElementById("corps-table-agents").querySelectorAll("[data-agent-rp]").forEach((champ) => {
      champ.addEventListener("change", () => {
        modifierAgentStats(Number(champ.dataset.agentRp), { identiteRp: champ.value.trim() });
      });
    });
    document.getElementById("corps-table-agents").querySelectorAll("[data-agent-supprimer]").forEach((btn) => {
      btn.addEventListener("click", () => supprimerAgentStats(Number(btn.dataset.agentSupprimer)));
    });
  } catch (e) {
    afficherMessage("zone-message-agents", "Impossible de charger les agents : " + e.message, "erreur");
  }
}

async function modifierAgentStats(id, changements) {
  try {
    await appelAPI(`/api/stats/agents/${id}`, { method: "PATCH", body: JSON.stringify(changements) });
    afficherMessage("zone-message-agents", "Agent mis à jour ✓", "succes");
    chargerAgentsStats();
    document.getElementById("select-semaine-recap").value && chargerRecap(document.getElementById("select-semaine-recap").value);
  } catch (e) {
    afficherMessage("zone-message-agents", e.message, "erreur");
    chargerAgentsStats();
  }
}

async function supprimerAgentStats(id) {
  const ok = await confirmerAction(
    "Cet agent redeviendra « inconnu » dans le récap (pseudo brut, grade par défaut) tant qu'il n'est pas ajouté de nouveau.",
    "Supprimer cet agent du référentiel ?"
  );
  if (!ok) return;
  try {
    await appelAPI(`/api/stats/agents/${id}`, { method: "DELETE" });
    chargerAgentsStats();
    document.getElementById("select-semaine-recap").value && chargerRecap(document.getElementById("select-semaine-recap").value);
  } catch (e) {
    afficherMessage("zone-message-agents", e.message, "erreur");
  }
}

function ouvrirModaleAgent() {
  document.getElementById("agent-discord-pseudo").value = "";
  document.getElementById("agent-identite-rp").value = "";
  document.getElementById("agent-grade").value = "Agent";
  afficherMessage("zone-message-modale-agent", "", null);
  document.getElementById("modale-agent").classList.remove("cache");
  document.getElementById("agent-discord-pseudo").focus();
}
function fermerModaleAgent() {
  document.getElementById("modale-agent").classList.add("cache");
}
document.getElementById("bouton-nouvel-agent").addEventListener("click", ouvrirModaleAgent);
document.getElementById("fermer-modale-agent").addEventListener("click", fermerModaleAgent);
document.getElementById("modale-agent").addEventListener("click", (ev) => { if (ev.target.id === "modale-agent") fermerModaleAgent(); });

document.getElementById("formulaire-agent").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-agent", "", null);
  const discordPseudo = document.getElementById("agent-discord-pseudo").value.trim();
  const identiteRp = document.getElementById("agent-identite-rp").value.trim();
  const grade = document.getElementById("agent-grade").value;
  try {
    await appelAPI("/api/stats/agents", { method: "POST", body: JSON.stringify({ discordPseudo, identiteRp, grade }) });
    fermerModaleAgent();
    chargerAgentsStats();
    document.getElementById("select-semaine-recap").value && chargerRecap(document.getElementById("select-semaine-recap").value);
  } catch (e) {
    afficherMessage("zone-message-modale-agent", e.message, "erreur");
  }
});

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
// Onglet « Mon agenda » — planning personnel privé (une semaine à la fois).
// Chaque membre ne voit et ne modifie que ses propres événements : le serveur
// s'en charge (voir agenda() dans src/index.js), le rôle du JS ici est juste
// d'afficher joliment une grille de 7 jours × 24 heures et de gérer les clics.
// ---------------------------------------------------------------------------

let AGENDA_DECALAGE_SEMAINE = 0; // 0 = semaine en cours, +1 = semaine suivante, -1 = précédente...
let CACHE_EVENEMENTS = [];
const AGENDA_HEURE_HAUTEUR = 48; // hauteur en pixels d'une heure dans la grille
const AGENDA_NOMS_JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function formaterDateISO(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const j = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${j}`;
}

function lundiDeLaSemaine(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const jour = d.getDay(); // 0 = dimanche ... 6 = samedi
  d.setDate(d.getDate() + (jour === 0 ? -6 : 1 - jour));
  return d;
}

function joursAffichesAgenda() {
  const lundi = lundiDeLaSemaine(new Date());
  lundi.setDate(lundi.getDate() + AGENDA_DECALAGE_SEMAINE * 7);
  const jours = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lundi);
    d.setDate(lundi.getDate() + i);
    jours.push(d);
  }
  return jours;
}

function estAujourdhui(date) {
  const n = new Date();
  return date.getFullYear() === n.getFullYear() && date.getMonth() === n.getMonth() && date.getDate() === n.getDate();
}

function minutesDepuisMinuit(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function heureActuelleHHMM() {
  const n = new Date();
  return String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0");
}

function majEnteteAgenda(jours) {
  const debut = jours[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const fin = jours[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  document.getElementById("agenda-plage-dates").textContent = `Du ${debut} au ${fin}`;
}

function defilerVersMaintenant() {
  const conteneur = document.getElementById("agenda-grille-conteneur");
  if (!conteneur) return;
  const minutes = minutesDepuisMinuit(heureActuelleHHMM());
  conteneur.scrollTop = Math.max(0, (minutes / 60) * AGENDA_HEURE_HAUTEUR - AGENDA_HEURE_HAUTEUR * 2);
}

function rendreGrilleAgenda(jours) {
  const grille = document.getElementById("agenda-grille");

  const entete = jours.map((d, i) => `
    <div class="agenda-entete-jour ${estAujourdhui(d) ? "agenda-aujourdhui" : ""}">
      <span class="agenda-entete-jour-nom">${AGENDA_NOMS_JOURS[i]}</span>
      <span class="agenda-entete-jour-date">${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}</span>
    </div>`).join("");

  let colonneHeures = "";
  for (let h = 0; h < 24; h++) {
    colonneHeures += `<div class="agenda-heure-label">${String(h).padStart(2, "0")}:00</div>`;
  }

  const colonnesJours = jours.map((d) => {
    const jourISO = formaterDateISO(d);
    let cases = "";
    for (let h = 0; h < 24; h++) {
      const heureDebut = String(h).padStart(2, "0") + ":00";
      const heureFin = h === 23 ? "23:59" : String(h + 1).padStart(2, "0") + ":00";
      cases += `<button type="button" class="agenda-case" data-jour="${jourISO}" data-heure-debut="${heureDebut}" data-heure-fin="${heureFin}" aria-label="Ajouter un événement le ${jourISO} à ${heureDebut}"></button>`;
    }
    const evenementsHtml = CACHE_EVENEMENTS.filter((e) => e.jour === jourISO).map((e) => {
      const debutMin = minutesDepuisMinuit(e.heure_debut);
      const finMin = Math.max(minutesDepuisMinuit(e.heure_fin), debutMin + 15);
      const top = (debutMin / 60) * AGENDA_HEURE_HAUTEUR;
      const hauteur = Math.max(((finMin - debutMin) / 60) * AGENDA_HEURE_HAUTEUR, 22);
      return `
        <div class="agenda-evenement" style="top:${top}px;height:${hauteur}px;" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(e.titre)}, de ${e.heure_debut} à ${e.heure_fin}">
          <span class="agenda-evenement-heure">${e.heure_debut}–${e.heure_fin}</span>
          <span class="agenda-evenement-titre">${echapper(e.titre)}</span>
        </div>`;
    }).join("");
    const maintenant = estAujourdhui(d)
      ? `<div class="agenda-maintenant" style="top:${(minutesDepuisMinuit(heureActuelleHHMM()) / 60) * AGENDA_HEURE_HAUTEUR}px;"></div>`
      : "";
    return `<div class="agenda-jour">${cases}${evenementsHtml}${maintenant}</div>`;
  }).join("");

  grille.innerHTML = `
    <div class="agenda-entete-jours">
      <div class="agenda-case-coin"></div>
      ${entete}
    </div>
    <div class="agenda-corps">
      <div class="agenda-colonne-heures">${colonneHeures}</div>
      <div class="agenda-jours">${colonnesJours}</div>
    </div>`;

  grille.querySelectorAll(".agenda-case").forEach((btn) => {
    btn.addEventListener("click", () => {
      ouvrirModaleEvenement({ jour: btn.dataset.jour, heureDebut: btn.dataset.heureDebut, heureFin: btn.dataset.heureFin });
    });
  });
  grille.querySelectorAll(".agenda-evenement").forEach((el) => {
    const ouvrir = () => {
      const e = CACHE_EVENEMENTS.find((x) => String(x.id) === el.dataset.id);
      if (!e) return;
      ouvrirModaleEvenement({ id: e.id, jour: e.jour, heureDebut: e.heure_debut, heureFin: e.heure_fin, titre: e.titre, notes: e.notes });
    };
    el.addEventListener("click", ouvrir);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(); }
    });
  });
}

async function chargerAgenda(reinitialiserDefilement) {
  const jours = joursAffichesAgenda();
  majEnteteAgenda(jours);
  afficherMessage("zone-message-agenda", "", null);
  try {
    const debut = formaterDateISO(jours[0]);
    const fin = formaterDateISO(jours[6]);
    const data = await appelAPI(`/api/agenda?debut=${debut}&fin=${fin}`);
    CACHE_EVENEMENTS = data.evenements || [];
  } catch (e) {
    afficherMessage("zone-message-agenda", "Impossible de charger votre agenda : " + e.message, "erreur");
    CACHE_EVENEMENTS = [];
  }
  const conteneur = document.getElementById("agenda-grille-conteneur");
  const scrollAvant = conteneur ? conteneur.scrollTop : 0;
  rendreGrilleAgenda(jours);
  if (reinitialiserDefilement) {
    defilerVersMaintenant();
  } else if (conteneur) {
    conteneur.scrollTop = scrollAvant;
  }
}

document.getElementById("agenda-semaine-precedente").addEventListener("click", () => {
  AGENDA_DECALAGE_SEMAINE--;
  chargerAgenda(true);
});
document.getElementById("agenda-semaine-suivante").addEventListener("click", () => {
  AGENDA_DECALAGE_SEMAINE++;
  chargerAgenda(true);
});
document.getElementById("agenda-aujourdhui").addEventListener("click", () => {
  AGENDA_DECALAGE_SEMAINE = 0;
  chargerAgenda(true);
});
document.getElementById("agenda-nouvel-evenement").addEventListener("click", () => {
  const jours = joursAffichesAgenda();
  const jourDepart = jours.find((d) => estAujourdhui(d)) || jours[0];
  ouvrirModaleEvenement({ jour: formaterDateISO(jourDepart) });
});

// ---- modale « ajouter / modifier un événement » ---------------------------

function ouvrirModaleEvenement(options) {
  const o = options || {};
  const estEdition = !!o.id;
  document.getElementById("titre-modale-evenement").textContent = estEdition ? "Modifier l'événement" : "Nouvel événement";
  document.getElementById("evenement-id").value = o.id || "";
  document.getElementById("evenement-titre").value = o.titre || "";
  document.getElementById("evenement-jour").value = o.jour || formaterDateISO(new Date());
  document.getElementById("evenement-heure-debut").value = o.heureDebut || "09:00";
  document.getElementById("evenement-heure-fin").value = o.heureFin || "10:00";
  document.getElementById("evenement-notes").value = o.notes || "";
  document.getElementById("bouton-supprimer-evenement").classList.toggle("cache", !estEdition);
  document.querySelectorAll("#formulaire-evenement .champ-erreur").forEach((p) => p.classList.add("cache"));
  afficherMessage("zone-message-modale-evenement", "", null);
  document.getElementById("modale-evenement").classList.remove("cache");
  document.getElementById("evenement-titre").focus();
}

function fermerModaleEvenement() {
  document.getElementById("modale-evenement").classList.add("cache");
}

document.getElementById("fermer-modale-evenement").addEventListener("click", fermerModaleEvenement);
document.getElementById("bouton-annuler-evenement").addEventListener("click", fermerModaleEvenement);
document.getElementById("modale-evenement").addEventListener("click", (ev) => { if (ev.target.id === "modale-evenement") fermerModaleEvenement(); });
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !document.getElementById("modale-evenement").classList.contains("cache")) {
    fermerModaleEvenement();
  }
});

document.getElementById("formulaire-evenement").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-evenement", "", null);
  document.querySelectorAll("#formulaire-evenement .champ-erreur").forEach((p) => p.classList.add("cache"));

  const titre = document.getElementById("evenement-titre").value.trim();
  const jour = document.getElementById("evenement-jour").value;
  const heureDebut = document.getElementById("evenement-heure-debut").value;
  const heureFin = document.getElementById("evenement-heure-fin").value;
  let valide = true;
  if (!titre) {
    document.getElementById("erreur-evenement-titre").classList.remove("cache");
    valide = false;
  }
  if (!heureDebut || !heureFin || heureFin <= heureDebut) {
    document.getElementById("erreur-evenement-heures").classList.remove("cache");
    valide = false;
  }
  if (!valide) {
    afficherMessage("zone-message-modale-evenement", "Corrigez les champs indiqués en rouge avant d'enregistrer.", "erreur");
    return;
  }

  const id = document.getElementById("evenement-id").value;
  const payload = {
    titre,
    jour,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    notes: document.getElementById("evenement-notes").value.trim(),
  };
  const bouton = document.querySelector('#formulaire-evenement button[type="submit"]');
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";
  try {
    if (id) {
      await appelAPI("/api/agenda?id=" + id, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await appelAPI("/api/agenda", { method: "POST", body: JSON.stringify(payload) });
    }
    fermerModaleEvenement();
    chargerAgenda(false);
  } catch (e) {
    afficherMessage("zone-message-modale-evenement", e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
  }
});

document.getElementById("bouton-supprimer-evenement").addEventListener("click", async () => {
  const id = document.getElementById("evenement-id").value;
  if (!id) return;
  const ok = await confirmerAction("Cette action est définitive et ne peut pas être annulée.", "Supprimer cet événement ?");
  if (!ok) return;
  try {
    await appelAPI("/api/agenda?id=" + id, { method: "DELETE" });
    fermerModaleEvenement();
    chargerAgenda(false);
  } catch (e) {
    afficherMessage("zone-message-modale-evenement", e.message, "erreur");
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
      <td>${b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-off">Masquée</span>'}</td>
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
        <div>${b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-off">Masquée</span>'}${b.coup_de_coeur ? ' <span class="puce puce-or">Coup de cœur</span>' : ""}</div>
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
// Comptabilité — réservé à la Direction
// Sous-onglet « Tablettes » : on colle un tableau (copié depuis un tableur ou
// un bot Discord) dans une modale, le navigateur le découpe lui-même en
// colonnes et en lignes pour un aperçu immédiat, puis n'envoie au serveur QUE
// le résultat déjà structuré (colonnes[] + lignes[][]) — jamais le texte brut.
// « Paramètres » configure la rémunération (voir plus bas dans ce fichier :
// chargerRemuneration).
// ---------------------------------------------------------------------------

document.querySelectorAll(".compta-sous-onglet").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".compta-sous-onglet").forEach((b) => b.classList.toggle("actif", b === btn));
    const nom = btn.dataset.comptaOnglet;
    document.getElementById("compta-panneau-tablettes").classList.toggle("cache", nom !== "tablettes");
    document.getElementById("compta-panneau-parametres").classList.toggle("cache", nom !== "parametres");
    document.getElementById("compta-panneau-dot").classList.toggle("cache", nom !== "dot");
    if (nom === "dot") chargerDot();
    if (nom === "parametres") chargerRemuneration();
  });
});

// ---------------------------------------------------------------------------
// Comptabilité -> Paramètres : rémunération (salaire fixe, primes par palier,
// droits par grade). Modifie directement stats_taux_commission et
// stats_baremes_primes — les mêmes tables déjà utilisées par le récap de
// l'onglet Statistiques et par la déclaration DOT (voir calculerRecapSemaine
// côté serveur) : rien à synchroniser, un changement ici s'applique
// automatiquement au prochain calcul, sans redéploiement.
// ---------------------------------------------------------------------------

function switchRemunerationHtml(attribut, cle, actif) {
  return `<label class="d8-switch"><input type="checkbox" ${attribut}="${echapper(cle)}" ${actif ? "checked" : ""}><span class="d8-switch-piste"></span></label>`;
}

async function chargerRemuneration() {
  afficherMessage("zone-message-parametres", "", null);
  try {
    const r = await appelAPI("/api/stats/remuneration");
    document.getElementById("corps-table-remuneration-grades").innerHTML = r.grades.map((g) => `
      <tr>
        <td><span class="puce" style="background:${couleurGrade(g.grade)}26;color:${couleurGrade(g.grade)};">${echapper(g.grade)}</span></td>
        <td style="text-align:center;">${switchRemunerationHtml("data-salaire-actif", g.grade, g.salaireActif)}</td>
        <td style="text-align:right;"><input type="number" class="table-input" min="0" step="1000" style="text-align:right;max-width:160px;" data-salaire-montant="${echapper(g.grade)}" value="${g.salaireFixe}"></td>
        <td style="text-align:center;">${switchRemunerationHtml("data-prime-vente-active", g.grade, g.primeVenteActive)}</td>
        <td style="text-align:center;">${switchRemunerationHtml("data-prime-location-active", g.grade, g.primeLocationActive)}</td>
      </tr>`).join("");
    cablerRemunerationGrades();

    rendreBaremesPrimes("vente", r.baremesVentes);
    rendreBaremesPrimes("location", r.baremesLocations);
  } catch (e) {
    document.getElementById("corps-table-remuneration-grades").innerHTML = `<tr><td colspan="5">Erreur de chargement.</td></tr>`;
    afficherMessage("zone-message-parametres", "Impossible de charger les réglages de rémunération : " + e.message, "erreur");
  }
}

function cablerRemunerationGrades() {
  const corps = document.getElementById("corps-table-remuneration-grades");
  corps.querySelectorAll("[data-salaire-actif]").forEach((el) => {
    el.addEventListener("change", () => modifierGradeRemuneration(el.dataset.salaireActif, { salaireActif: el.checked }));
  });
  corps.querySelectorAll("[data-prime-vente-active]").forEach((el) => {
    el.addEventListener("change", () => modifierGradeRemuneration(el.dataset.primeVenteActive, { primeVenteActive: el.checked }));
  });
  corps.querySelectorAll("[data-prime-location-active]").forEach((el) => {
    el.addEventListener("change", () => modifierGradeRemuneration(el.dataset.primeLocationActive, { primeLocationActive: el.checked }));
  });
  corps.querySelectorAll("[data-salaire-montant]").forEach((el) => {
    el.addEventListener("change", () => {
      const val = el.value === "" ? 0 : Number(el.value);
      if (!isFinite(val) || val < 0) {
        afficherMessage("zone-message-parametres", "Le montant du salaire doit être un nombre positif.", "erreur");
        chargerRemuneration();
        return;
      }
      modifierGradeRemuneration(el.dataset.salaireMontant, { salaireFixe: val });
    });
  });
}

async function modifierGradeRemuneration(grade, patch) {
  try {
    await appelAPI(`/api/stats/remuneration/grades/${encodeURIComponent(grade)}`, { method: "PATCH", body: JSON.stringify(patch) });
    afficherMessage("zone-message-parametres", "Enregistré ✓", "succes");
  } catch (e) {
    afficherMessage("zone-message-parametres", "Impossible d'enregistrer : " + e.message, "erreur");
    chargerRemuneration();
  }
}

function rendreBaremesPrimes(type, paliers) {
  const corps = document.getElementById(`corps-table-baremes-${type}`);
  if (!paliers.length) {
    corps.innerHTML = `<tr><td colspan="3">Aucun palier — ajoutez-en un ci-dessous.</td></tr>`;
    return;
  }
  corps.innerHTML = paliers.map((p) => `
    <tr>
      <td><input type="number" class="table-input" min="1" step="1" style="max-width:110px;" data-palier-seuil="${p.id}" value="${p.seuil}"></td>
      <td style="text-align:right;"><input type="number" class="table-input" min="0" step="1000" style="max-width:140px;text-align:right;" data-palier-montant="${p.id}" value="${p.montant}"></td>
      <td><button type="button" class="actions-icone actions-icone--danger" data-palier-supprimer="${p.id}" title="Supprimer ce palier" aria-label="Supprimer ce palier">🗑️</button></td>
    </tr>`).join("");
  corps.querySelectorAll("[data-palier-seuil]").forEach((el) => {
    el.addEventListener("change", () => modifierPalierPrime(el.dataset.palierSeuil, { seuil: Number(el.value) }));
  });
  corps.querySelectorAll("[data-palier-montant]").forEach((el) => {
    el.addEventListener("change", () => modifierPalierPrime(el.dataset.palierMontant, { montant: Number(el.value) }));
  });
  corps.querySelectorAll("[data-palier-supprimer]").forEach((btn) => {
    btn.addEventListener("click", () => supprimerPalierPrime(btn.dataset.palierSupprimer));
  });
}

async function modifierPalierPrime(id, patch) {
  try {
    await appelAPI(`/api/stats/baremes/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    afficherMessage("zone-message-parametres", "Enregistré ✓", "succes");
  } catch (e) {
    afficherMessage("zone-message-parametres", "Impossible d'enregistrer : " + e.message, "erreur");
  } finally {
    chargerRemuneration();
  }
}

async function supprimerPalierPrime(id) {
  const ok = await confirmerAction("Ce palier de prime sera définitivement supprimé.", "Supprimer ce palier ?");
  if (!ok) return;
  try {
    await appelAPI(`/api/stats/baremes/${id}`, { method: "DELETE" });
    chargerRemuneration();
  } catch (e) {
    afficherMessage("zone-message-parametres", "Impossible de supprimer : " + e.message, "erreur");
  }
}

document.querySelectorAll(".palier-ajout").forEach((bloc) => {
  const type = bloc.dataset.type;
  bloc.querySelector(".palier-ajouter").addEventListener("click", async () => {
    const seuilEl = bloc.querySelector(".palier-nouveau-seuil");
    const montantEl = bloc.querySelector(".palier-nouveau-montant");
    const seuil = Number(seuilEl.value);
    const montant = Number(montantEl.value);
    if (!seuilEl.value || !Number.isFinite(seuil) || !Number.isInteger(seuil) || seuil <= 0) {
      afficherMessage("zone-message-parametres", "Le seuil (nombre à atteindre) doit être un nombre entier positif.", "erreur");
      return;
    }
    if (montantEl.value === "" || !Number.isFinite(montant) || montant < 0) {
      afficherMessage("zone-message-parametres", "Le montant de la prime doit être un nombre positif.", "erreur");
      return;
    }
    try {
      await appelAPI("/api/stats/baremes", { method: "POST", body: JSON.stringify({ type, seuil, montant }) });
      seuilEl.value = "";
      montantEl.value = "";
      chargerRemuneration();
    } catch (e) {
      afficherMessage("zone-message-parametres", "Impossible d'ajouter ce palier : " + e.message, "erreur");
    }
  });
});

// ---------------------------------------------------------------------------
// Comptabilité -> DOT (§6.3) — la déclaration hebdomadaire versée à la DOT.
// Trois blocs qui se rechargent ensemble à chaque changement de semaine ou
// d'écriture : le résumé chiffré, le journal dépense/retraits (modifiable
// à la main), et le tableau par salarié (calculé, prêt à copier).
// ---------------------------------------------------------------------------

let CACHE_ECRITURES_DOT = [];

async function chargerDot() {
  const select = document.getElementById("select-semaine-dot");
  if (!select.dataset.rempli) {
    try {
      const reponse = await appelAPI("/api/stats/semaines");
      select.innerHTML = (reponse.semaines || []).map((s) => `<option value="${s.code}">${s.code}</option>`).join("");
      select.dataset.rempli = "1";
      // Sans ça, ce menu déroulant garde le rendu natif du navigateur (fond
      // blanc, police système) qui détonne sur le thème sombre du site — voir
      // ameliorerSelect dans layout.js, déjà utilisé pour les autres menus.
      ameliorerSelect(select);
    } catch (e) { /* la liste des semaines n'a pas pu charger — le résumé s'affichera quand même sans les primes */ }
  }
  await Promise.all([chargerDotResume(), chargerDotEcritures(), chargerDotSalaries()]);
}

document.getElementById("select-semaine-dot").addEventListener("change", () => {
  chargerDotResume();
  chargerDotSalaries();
});

function ligneResumeDot(libelle, valeur, gras) {
  return `<tr><td>${libelle}</td><td style="text-align:right;">${gras ? `<strong>${valeur}</strong>` : valeur}</td></tr>`;
}

async function chargerDotResume() {
  afficherMessage("zone-message-dot", "", null);
  const semaine = document.getElementById("select-semaine-dot").value;
  try {
    const r = await appelAPI("/api/comptabilite/dot/resume" + (semaine ? `?semaine=${encodeURIComponent(semaine)}` : ""));
    document.getElementById("dot-resume-vide").classList.toggle("cache", r.montantTotalPrimes != null);
    const val = (v) => (v == null ? "—" : formaterArgentStats(v));
    // Le CA Brut reflète toujours le dernier relevé Tablettes importé, quel
    // qu'il soit — pas d'avertissement sur son contenu, la Direction gère
    // elle-même ce qu'elle importe.
    document.getElementById("corps-table-dot-resume").innerHTML = [
      ligneResumeDot("CA Brut" + (r.caBrutTrouve ? "" : " <span class=\"champ-aide\">(aucun relevé Tablettes importé)</span>"), val(r.caBrut)),
      ligneResumeDot("Dépense déductible", val(r.depenseDeductible)),
      ligneResumeDot("Bénéfice imposable", val(r.beneficeImposable)),
      ligneResumeDot("Taux d'imposition", r.tauxImposition == null ? "—" : Math.round(r.tauxImposition * 100) + " %"),
      ligneResumeDot("Montant des impôts", val(r.montantImpots)),
      ligneResumeDot("Bénéfice après impôts", val(r.beneficeApresImpots), true),
      ligneResumeDot("Montant total des primes" + (semaine ? "" : " <span class=\"champ-aide\">(choisissez une semaine)</span>"), val(r.montantTotalPrimes)),
      ligneResumeDot("Bénéfice après primes", val(r.beneficeApresPrimes)),
      ligneResumeDot("Retraits", val(r.retraits)),
      ligneResumeDot("Bénéfice net", val(r.beneficeNet), true),
    ].join("");
    document.getElementById("dot-plafonds").innerHTML = r.plafonds
      ? `Plafonds de la tranche : salaire max. ${formaterArgentStats(r.plafonds.salaireMaxEmploye)} (employé) / ${formaterArgentStats(r.plafonds.salaireMaxPatron)} (patron) — prime max. ${formaterArgentStats(r.plafonds.primeMaxEmploye)} (employé) / ${formaterArgentStats(r.plafonds.primeMaxPatron)} (patron).`
      : "";
  } catch (e) {
    afficherMessage("zone-message-dot", "Impossible de charger le résumé DOT : " + e.message, "erreur");
  }
}

async function chargerDotEcritures() {
  try {
    const r = await appelAPI("/api/comptabilite/dot/ecritures");
    CACHE_ECRITURES_DOT = r.ecritures || [];
    const rendre = (type, idCorps) => {
      const lignes = CACHE_ECRITURES_DOT.filter((e) => e.type === type);
      document.getElementById(idCorps).innerHTML = lignes.length
        ? lignes.map((e) => `
          <tr>
            <td>${echapper(e.date_ecriture) || "—"}</td>
            <td>${echapper(e.justificatif)}</td>
            <td>${formaterArgentStats(e.montant)}</td>
            <td><button type="button" class="actions-icone actions-icone--danger" data-ecriture-supprimer="${e.id}" title="Supprimer" aria-label="Supprimer">🗑️</button></td>
          </tr>`).join("")
        : `<tr><td colspan="4" class="champ-aide">Aucune ligne pour le moment.</td></tr>`;
    };
    rendre("depense", "corps-table-dot-depenses");
    rendre("retrait", "corps-table-dot-retraits");
    document.querySelectorAll("[data-ecriture-supprimer]").forEach((btn) => {
      btn.addEventListener("click", () => supprimerEcritureDot(Number(btn.dataset.ecritureSupprimer)));
    });
  } catch (e) {
    afficherMessage("zone-message-dot", "Impossible de charger les écritures : " + e.message, "erreur");
  }
}

async function supprimerEcritureDot(id) {
  const ok = await confirmerAction("Cette ligne sera retirée du calcul du bénéfice imposable.", "Supprimer cette écriture ?");
  if (!ok) return;
  try {
    await appelAPI(`/api/comptabilite/dot/ecritures/${id}`, { method: "DELETE" });
    await Promise.all([chargerDotEcritures(), chargerDotResume()]);
  } catch (e) {
    afficherMessage("zone-message-dot", e.message, "erreur");
  }
}

// « Réinitialiser » un des deux tableaux (dépenses OU retraits) : supprime
// toutes ses lignes d'un coup (l'autre tableau n'est jamais touché), comme
// le bouton équivalent de l'onglet Tablettes.
async function reinitialiserEcrituresDot(type) {
  const libelle = type === "depense" ? "des dépenses déductibles" : "des retraits";
  const ok = await confirmerAction(`Toutes les lignes ${libelle} seront supprimées. Cette action est irréversible.`, "Réinitialiser ce tableau ?");
  if (!ok) return;
  try {
    await appelAPI(`/api/comptabilite/dot/ecritures?type=${type}`, { method: "DELETE" });
    await Promise.all([chargerDotEcritures(), chargerDotResume()]);
  } catch (e) {
    afficherMessage("zone-message-dot", e.message, "erreur");
  }
}
document.getElementById("bouton-reinitialiser-depenses").addEventListener("click", () => reinitialiserEcrituresDot("depense"));
document.getElementById("bouton-reinitialiser-retraits").addEventListener("click", () => reinitialiserEcrituresDot("retrait"));

// « Copier le tableau » (dépenses ou retraits) : même principe que pour le
// tableau des salariés — copie au format tableur (colonnes séparées par des
// tabulations), prêt à coller dans Excel/Google Sheets.
async function copierEcrituresDot(type, idCorps) {
  const entetes = ["Date", "Justificatif", "Montant"];
  const lignes = [entetes.join("\t")];
  document.querySelectorAll(`#${idCorps} tr`).forEach((tr) => {
    const cellules = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());
    if (cellules.length === 4) lignes.push(cellules.slice(0, 3).join("\t"));
  });
  try {
    await navigator.clipboard.writeText(lignes.join("\n"));
    afficherMessage("zone-message-dot", "Tableau copié ✓ Vous pouvez le coller dans Excel/Google Sheets.", "succes");
  } catch (e) {
    afficherMessage("zone-message-dot", "Impossible de copier automatiquement — sélectionnez le tableau à la main (Ctrl+C).", "erreur");
  }
}
document.getElementById("bouton-copier-depenses").addEventListener("click", () => copierEcrituresDot("depense", "corps-table-dot-depenses"));
document.getElementById("bouton-copier-retraits").addEventListener("click", () => copierEcrituresDot("retrait", "corps-table-dot-retraits"));

function ouvrirModaleEcritureDot(type) {
  document.getElementById("ecriture-dot-type").value = type;
  document.getElementById("titre-modale-ecriture-dot").textContent = type === "depense" ? "Nouvelle dépense déductible" : "Nouveau retrait";
  document.getElementById("ecriture-dot-date").value = "";
  document.getElementById("ecriture-dot-justificatif").value = "";
  document.getElementById("ecriture-dot-montant").value = "";
  afficherMessage("zone-message-modale-ecriture-dot", "", null);
  document.getElementById("modale-ecriture-dot").classList.remove("cache");
  document.getElementById("ecriture-dot-justificatif").focus();
}
function fermerModaleEcritureDot() {
  document.getElementById("modale-ecriture-dot").classList.add("cache");
}
document.getElementById("bouton-nouvelle-depense").addEventListener("click", () => ouvrirModaleEcritureDot("depense"));
document.getElementById("bouton-nouveau-retrait").addEventListener("click", () => ouvrirModaleEcritureDot("retrait"));
document.getElementById("fermer-modale-ecriture-dot").addEventListener("click", fermerModaleEcritureDot);
document.getElementById("modale-ecriture-dot").addEventListener("click", (ev) => { if (ev.target.id === "modale-ecriture-dot") fermerModaleEcritureDot(); });

document.getElementById("formulaire-ecriture-dot").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-ecriture-dot", "", null);
  const type = document.getElementById("ecriture-dot-type").value;
  const date = document.getElementById("ecriture-dot-date").value.trim();
  const justificatif = document.getElementById("ecriture-dot-justificatif").value.trim();
  const montant = document.getElementById("ecriture-dot-montant").value;
  try {
    await appelAPI("/api/comptabilite/dot/ecritures", { method: "POST", body: JSON.stringify({ type, date, justificatif, montant }) });
    fermerModaleEcritureDot();
    await Promise.all([chargerDotEcritures(), chargerDotResume()]);
  } catch (e) {
    afficherMessage("zone-message-modale-ecriture-dot", e.message, "erreur");
  }
});

// Tableau par salarié : la liste des salariés (et Salaire/Prime) vient
// toujours de Statistiques, mais RUN/FACTURE/VENTE viennent maintenant du
// même relevé Tablettes que le CA Brut plus haut (retrouvés par nom) — pour
// rester cohérent avec une seule et même source. Si un salarié n'apparaît
// pas dans le relevé Tablettes, ces trois colonnes restent à 0$.
async function chargerDotSalaries() {
  const semaine = document.getElementById("select-semaine-dot").value;
  const corps = document.getElementById("corps-table-dot-salaries");
  if (!semaine) { corps.innerHTML = `<tr><td colspan="8" class="champ-aide">Choisissez une semaine.</td></tr>`; return; }
  try {
    const r = await appelAPI(`/api/comptabilite/dot/salaries?semaine=${encodeURIComponent(semaine)}`);
    const agents = r.agents || [];
    corps.innerHTML = agents.length
      ? agents.map((a) => `<tr>
            <td>${echapper(a.identiteRp || a.identite)}</td>
            <td>${echapper(a.grade)}</td>
            <td>${formaterArgentStats(a.run)}</td>
            <td>${formaterArgentStats(a.facture)}</td>
            <td>${formaterArgentStats(a.vente)}</td>
            <td><strong>${formaterArgentStats(a.caTotalRealise)}</strong></td>
            <td>${formaterArgentStats(a.salaireFixe)}</td>
            <td>${formaterArgentStats(a.primeTotale)}</td>
          </tr>`).join("")
      : `<tr><td colspan="8" class="champ-aide">Aucune vente/location cette semaine-là.</td></tr>`;
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="8" class="champ-aide">Erreur : ${echapper(e.message)}</td></tr>`;
  }
}

// « Copier le tableau » : copie au format tableur (colonnes séparées par des
// tabulations) — se colle proprement dans Excel/Google Sheets. Les montants
// sont copiés comme des nombres calculés, pas comme des formules : si une
// formule Excel/Sheets est nécessaire (ex: la colonne CA TOTAL REALISE),
// redemandez un fichier prêt à coller, il peut être généré à la demande.
document.getElementById("bouton-copier-salaries").addEventListener("click", async () => {
  const entetes = ["Nom du salarié", "Grade", "RUN", "FACTURE", "VENTE", "CA TOTAL REALISE", "Salaire", "Prime"];
  const lignes = [entetes.join("\t")];
  document.querySelectorAll("#corps-table-dot-salaries tr").forEach((tr) => {
    const cellules = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim());
    if (cellules.length === 8) lignes.push(cellules.join("\t"));
  });
  try {
    await navigator.clipboard.writeText(lignes.join("\n"));
    afficherMessage("zone-message-dot", "Tableau copié ✓ Vous pouvez le coller dans Excel/Google Sheets.", "succes");
  } catch (e) {
    afficherMessage("zone-message-dot", "Impossible de copier automatiquement — sélectionnez le tableau à la main (Ctrl+C).", "erreur");
  }
});

// Découpe un texte collé en colonnes + lignes. On essaie d'abord les
// tabulations (\t) : c'est ce que produit un copier-coller de cellules
// depuis Excel / Google Sheets, y compris les cellules vides — c'est donc la
// méthode la plus fiable. À défaut, on se rabat sur des blocs d'au moins 2
// espaces comme séparateur (utile pour un texte tapé ou copié depuis
// Discord), sachant que dans ce cas une cellule vide au milieu d'une ligne
// (ex : « Rang » sur une ligne TOTAL) ne peut pas être détectée automatiquement
// — d'où le conseil, dans la modale, d'y mettre un tiret avant de coller.
function analyserTexteTablette(texte) {
  const lignesBrutes = String(texte || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (!lignesBrutes.length) return null;
  const decouper = (ligne) => (ligne.includes("\t") ? ligne.split("\t") : ligne.trim().split(/ {2,}/)).map((c) => c.trim());
  const colonnes = decouper(lignesBrutes[0]).filter((c) => c !== "");
  if (!colonnes.length) return null;
  let lignes = lignesBrutes.slice(1).map((ligne) => decouper(ligne));
  // Même correctif que côté serveur (voir corrigerLigneTotaleDecalee dans
  // src/index.js) : la ligne récap "TOTAL" collée depuis le bot/tableur ne
  // contient jamais de case pour "Rang", ce qui décale tout le reste vers la
  // gauche. On la corrige ICI, avant de compléter les cases manquantes et
  // d'afficher l'aperçu, pour que ce qu'on prévisualise soit déjà ce qui sera
  // enregistré (le serveur applique le même correctif de son côté, mais
  // l'aperçu affiché avant clic sur "Enregistrer" ne passe pas par le serveur).
  lignes = corrigerLigneTotaleDecaleeTablette(colonnes, lignes);
  lignes = lignes.map((cellules) => {
    const rangee = [];
    for (let i = 0; i < colonnes.length; i++) rangee.push(cellules[i] === undefined ? "" : cellules[i]);
    return rangee;
  });
  return { colonnes, lignes };
}

// Cherche, parmi les titres de colonnes (déjà mis en minuscules/sans
// espaces), le premier qui correspond à l'un des noms possibles — copie
// exacte de indexColonneTablette côté serveur (src/index.js).
function indexColonneTabletteClient(colonnesNormalisees, aliases) {
  for (const nom of aliases) {
    const i = colonnesNormalisees.indexOf(nom);
    if (i !== -1) return i;
  }
  return -1;
}

// Copie exacte de corrigerLigneTotaleDecalee côté serveur (src/index.js) :
// voir les commentaires là-bas pour le détail du problème corrigé. Gardée
// synchronisée avec le serveur pour que l'aperçu affiché avant d'enregistrer
// corresponde exactement à ce qui sera effectivement sauvegardé.
function corrigerLigneTotaleDecaleeTablette(colonnes, lignes) {
  const colonnesNormalisees = colonnes.map((c) => String(c).trim().toLowerCase());
  const indexRang = indexColonneTabletteClient(colonnesNormalisees, ["rang", "grade"]);
  if (indexRang <= 0 || indexRang >= colonnes.length - 1) return lignes;
  return lignes.map((ligne) => {
    if (
      Array.isArray(ligne) &&
      String(ligne[0] || "").trim().toLowerCase() === "total" &&
      ligne.length < colonnes.length
    ) {
      const corrigee = ligne.slice();
      corrigee.splice(indexRang, 0, "-");
      return corrigee;
    }
    return ligne;
  });
}

function comptaLigneEstTotal(cellules) {
  const premier = (cellules[0] || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return premier === "total" || premier === "totaux";
}

function comptaColonneEstNumerique(lignes, index) {
  const valeurs = lignes.map((l) => (l[index] || "").trim()).filter((v) => v !== "" && v !== "-");
  return valeurs.length > 0 && valeurs.every((v) => /^-?[\d\s.,]+$/.test(v));
}

function rendreTableCompta(colonnes, lignes) {
  const numerique = colonnes.map((_, i) => comptaColonneEstNumerique(lignes, i));
  const thead = `<thead><tr>${colonnes
    .map((c, i) => `<th${numerique[i] ? ' style="text-align:right;"' : ""}>${echapper(c)}</th>`)
    .join("")}</tr></thead>`;
  const tbody = `<tbody>${lignes
    .map((ligne) => {
      const total = comptaLigneEstTotal(ligne);
      const cellules = colonnes
        .map((_, i) => `<td${numerique[i] ? ' style="text-align:right;"' : ""}>${echapper(ligne[i] || "")}</td>`)
        .join("");
      return `<tr${total ? ' class="ligne-total"' : ""}>${cellules}</tr>`;
    })
    .join("")}</tbody>`;
  return thead + tbody;
}

function formaterDateHeureCompta(brut) {
  const iso = String(brut).includes("T") ? brut : String(brut).replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) +
    " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

async function chargerTablette() {
  afficherMessage("zone-message-tablette", "", null);
  try {
    const reponse = await appelAPI("/api/comptabilite/tablettes");
    const vide = document.getElementById("compta-tablette-vide");
    const resultat = document.getElementById("compta-tablette-resultat");
    const boutonReset = document.getElementById("bouton-reinitialiser-tablette");
    if (!reponse.import) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      boutonReset.classList.add("cache");
      return;
    }
    vide.classList.add("cache");
    resultat.classList.remove("cache");
    boutonReset.classList.remove("cache");
    document.getElementById("compta-tablette-info").textContent =
      `Importé par ${reponse.import.importe_par || "un membre"} le ${formaterDateHeureCompta(reponse.import.importe_le)}.`;
    document.getElementById("table-tablette").innerHTML = rendreTableCompta(reponse.import.colonnes, reponse.import.lignes);
  } catch (e) {
    afficherMessage("zone-message-tablette", "Impossible de charger les données : " + e.message, "erreur");
  }
}

function majApercuImportTablette() {
  const texte = document.getElementById("import-tablette-texte").value;
  const analyse = analyserTexteTablette(texte);
  const zoneApercu = document.getElementById("apercu-import-tablette");
  const bouton = document.getElementById("bouton-enregistrer-import-tablette");
  if (!analyse || !analyse.lignes.length) {
    zoneApercu.classList.add("cache");
    bouton.disabled = true;
    return;
  }
  document.getElementById("table-apercu-import").innerHTML = rendreTableCompta(analyse.colonnes, analyse.lignes);
  zoneApercu.classList.remove("cache");
  bouton.disabled = false;
}

function ouvrirModaleImportTablette() {
  document.getElementById("import-tablette-texte").value = "";
  document.getElementById("apercu-import-tablette").classList.add("cache");
  document.getElementById("bouton-enregistrer-import-tablette").disabled = true;
  afficherMessage("zone-message-modale-import", "", null);
  document.getElementById("modale-import-tablette").classList.remove("cache");
  document.getElementById("import-tablette-texte").focus();
}
function fermerModaleImportTablette() {
  document.getElementById("modale-import-tablette").classList.add("cache");
}

document.getElementById("bouton-importer-tablette").addEventListener("click", ouvrirModaleImportTablette);
document.getElementById("fermer-modale-import-tablette").addEventListener("click", fermerModaleImportTablette);
document.getElementById("bouton-annuler-import-tablette").addEventListener("click", fermerModaleImportTablette);
document.getElementById("import-tablette-texte").addEventListener("input", majApercuImportTablette);

document.getElementById("bouton-enregistrer-import-tablette").addEventListener("click", async () => {
  const analyse = analyserTexteTablette(document.getElementById("import-tablette-texte").value);
  if (!analyse || !analyse.lignes.length) {
    afficherMessage("zone-message-modale-import", "Collez d'abord vos données.", "erreur");
    return;
  }
  try {
    await appelAPI("/api/comptabilite/tablettes", {
      method: "POST",
      body: JSON.stringify({ colonnes: analyse.colonnes, lignes: analyse.lignes }),
    });
    fermerModaleImportTablette();
    chargerTablette();
  } catch (e) {
    afficherMessage("zone-message-modale-import", "Impossible d'enregistrer : " + e.message, "erreur");
  }
});

document.getElementById("bouton-reinitialiser-tablette").addEventListener("click", async () => {
  const ok = await confirmerAction(
    "Le tableau affiché dans « Tablettes » sera vidé. Rien n'est perdu : cet ancien relevé reste conservé côté serveur, seul l'affichage redevient vide. Vous pourrez importer un nouveau relevé dès que vous le souhaitez.",
    "Réinitialiser la feuille « Tablettes » ?"
  );
  if (!ok) return;
  try {
    await appelAPI("/api/comptabilite/tablettes", { method: "DELETE" });
    chargerTablette();
  } catch (e) {
    afficherMessage("zone-message-tablette", "Impossible de réinitialiser : " + e.message, "erreur");
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

// Affiche la vraie photo de profil Discord de la personne (récupérée à sa
// dernière connexion) si on l'a, sinon retombe sur le rond avec ses initiales.
function avatarHtml(m) {
  if (m.discord_avatar) {
    return `<img src="${echapper(m.discord_avatar)}" alt="" class="admin-avatar-img" loading="lazy">`;
  }
  return `<span class="admin-avatar">${initialesPseudo(m.pseudo)}</span>`;
}

async function chargerTableMembres() {
  const corps = document.getElementById("corps-table-membres");
  corps.innerHTML = `<tr><td colspan="7">Chargement…</td></tr>`;
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
          ${avatarHtml(m)}
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
      corps.innerHTML = `<tr><td colspan="7">Aucun compte pour le moment. Utilisez « + Créer le compte » pour pré-autoriser un pseudo Discord.</td></tr>`;
      return;
    }
    nettoyerSelectsPortee("comptes"); // retire les menus déroulants de l'affichage précédent avant de le remplacer
    corps.innerHTML = comptes.map((m) => `
      <tr data-ligne="${m.id}">
        <td>${avatarHtml(m)}</td>
        <td><input type="text" class="table-input" value="${echapper(m.pseudo)}" data-identifiant="${m.id}" maxlength="40"></td>
        <td>${m.discord_pseudo ? "@" + echapper(m.discord_pseudo) : "—"}</td>
        <td><select class="table-select" data-grade="${m.id}" style="border-color:${couleurGrade(m.grade)};">${OPTIONS_GRADES_HTML}</select></td>
        <td>${m.statut === "invite"
          ? '<span class="puce puce-or" title="Pré-autorisé, en attente de sa première connexion Discord">Invité</span>'
          : (m.actif ? '<span class="puce puce-ok">Actif</span>' : '<span class="puce puce-off">Suspendu</span>')}</td>
        <td>${m.derniere_visite ? echapper(m.derniere_visite) : "Jamais connecté"}</td>
        <td><div class="actions-ligne">
          <button type="button" class="btn btn-fantome btn-petit" data-profil="${m.id}">✏️ Profil</button>
          <button type="button" class="btn btn-fantome btn-petit" data-suspendre="${m.id}" data-actif="${m.actif ? 1 : 0}">${m.actif ? "Suspendre" : "Réactiver"}</button>
          <button type="button" class="actions-icone actions-icone--danger" data-supprimer="${m.id}" title="Supprimer" aria-label="Supprimer">🗑️</button>
        </div></td>
      </tr>`).join("");
    corps.querySelectorAll("[data-profil]").forEach((btn) => {
      btn.addEventListener("click", () => ouvrirModaleProfilCompte(Number(btn.dataset.profil)));
    });
    corps.querySelectorAll("[data-grade]").forEach((sel) => {
      sel.value = CACHE_MEMBRES.find((m) => m.id === Number(sel.dataset.grade)).grade;
      sel.style.borderColor = couleurGrade(sel.value);
      sel.addEventListener("change", () => {
        sel.style.borderColor = couleurGrade(sel.value);
        modifierCompte(Number(sel.dataset.grade), { grade: sel.value });
      });
      ameliorerSelect(sel, couleurGrade, "comptes");
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

// ---------------------------------------------------------------------------
// Modale « Profil public » — la Direction édite la fiche équipe.html de
// n'importe quel membre (mêmes champs que « Mon profil », pour un autre id).
// ---------------------------------------------------------------------------

function ouvrirModaleProfilCompte(id) {
  const m = CACHE_MEMBRES.find((x) => x.id === id);
  if (!m) return;
  document.getElementById("titre-modale-profil-compte").textContent = "Profil de " + m.pseudo;
  document.getElementById("profil-compte-id").value = m.id;
  document.getElementById("profil-compte-poste").value = m.poste || "";
  document.getElementById("profil-compte-specialite").value = m.specialite || "";
  document.getElementById("profil-compte-bio").value = m.bio || "";
  PHOTO_PROFIL_COMPTE = m.photo || "";
  majApercuPhotoProfilCompte();
  majCompteurBioProfilCompte();
  afficherMessage("zone-message-modale-profil-compte", "", null);
  document.getElementById("modale-profil-compte").classList.remove("cache");
}

function fermerModaleProfilCompte() {
  document.getElementById("modale-profil-compte").classList.add("cache");
}

function majApercuPhotoProfilCompte() {
  const apercu = document.getElementById("profil-compte-photo-apercu");
  const m = CACHE_MEMBRES.find((x) => x.id === Number(document.getElementById("profil-compte-id").value));
  apercu.innerHTML = PHOTO_PROFIL_COMPTE
    ? `<img src="${PHOTO_PROFIL_COMPTE}" alt="Photo de profil">`
    : `<span>${initialesPseudo(m ? m.pseudo : "?")}</span>`;
  document.getElementById("bouton-profil-compte-photo-retirer").classList.toggle("cache", !PHOTO_PROFIL_COMPTE);
}

function majCompteurBioProfilCompte() {
  const n = document.getElementById("profil-compte-bio").value.length;
  document.getElementById("profil-compte-bio-compteur").textContent = n + " / 1000";
}

document.getElementById("profil-compte-bio").addEventListener("input", majCompteurBioProfilCompte);

document.getElementById("fermer-modale-profil-compte").addEventListener("click", fermerModaleProfilCompte);
document.getElementById("modale-profil-compte").addEventListener("click", (ev) => { if (ev.target.id === "modale-profil-compte") fermerModaleProfilCompte(); });

document.getElementById("bouton-profil-compte-photo").addEventListener("click", () => {
  document.getElementById("profil-compte-photo-fichier").click();
});

document.getElementById("profil-compte-photo-fichier").addEventListener("change", async (ev) => {
  const fichier = (ev.target.files || [])[0];
  ev.target.value = "";
  if (!fichier) return;
  const erreur = document.getElementById("erreur-profil-compte-photo");
  erreur.classList.add("cache");
  try {
    PHOTO_PROFIL_COMPTE = await redimensionnerImage(fichier, 480, 0.82);
    majApercuPhotoProfilCompte();
  } catch (e) {
    erreur.textContent = e.message;
    erreur.classList.remove("cache");
  }
});

document.getElementById("bouton-profil-compte-photo-retirer").addEventListener("click", () => {
  PHOTO_PROFIL_COMPTE = "";
  majApercuPhotoProfilCompte();
});

document.getElementById("formulaire-profil-compte").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-profil-compte", "", null);
  const id = document.getElementById("profil-compte-id").value;
  const bouton = document.querySelector('#formulaire-profil-compte button[type="submit"]');
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";
  try {
    await appelAPI("/api/membres?id=" + id, {
      method: "PATCH",
      body: JSON.stringify({
        poste: document.getElementById("profil-compte-poste").value.trim(),
        specialite: document.getElementById("profil-compte-specialite").value.trim(),
        bio: document.getElementById("profil-compte-bio").value.trim(),
        photo: PHOTO_PROFIL_COMPTE,
      }),
    });
    fermerModaleProfilCompte();
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-modale-profil-compte", e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
  }
});

// ---------------------------------------------------------------------------
// Messagerie interne (widget façon MSN / Windows Live Messenger)
// ---------------------------------------------------------------------------
// Persiste par-dessus tous les onglets (voir demarrerEspaceAdmin, qui appelle
// demarrerMessagerie() une fois connecté). Pas de vrai « temps réel » façon
// Discord ici (ça demanderait une architecture bien plus lourde, avec un coût
// et une complexité que le site n'a pas besoin d'avoir) : le widget interroge
// simplement le serveur toutes les 4 secondes ("polling"). Pour une messagerie
// d'équipe interne, c'est largement assez réactif, et personne ne voit la
// différence à l'usage.

let MESSAGERIE_MON_STATUT = "disponible";
let MESSAGERIE_CONTACTS = [];
let MESSAGERIE_RECHERCHE = "";
let MESSAGERIE_FENETRES = []; // [{ membreId, pseudo, avatar, statut, dernierId, minimisee }]
let MESSAGERIE_PREMIER_CHARGEMENT = true;
let MESSAGERIE_NON_LUS_PRECEDENT = 0;
let MESSAGERIE_AUDIO_CTX = null;
const MESSAGERIE_MAX_FENETRES = 3;
const MESSAGERIE_INTERVALLE_MS = 4000;

const MESSAGERIE_LIBELLES_STATUT = {
  disponible: "Disponible",
  absent: "Absent",
  occupe: "Ne pas déranger",
  invisible: "Invisible",
  hors_ligne: "Hors ligne",
};
function libelleStatutMessagerie(s) {
  return MESSAGERIE_LIBELLES_STATUT[s] || "Hors ligne";
}

// Petit « ding » synthétisé (pas de fichier audio à héberger, fonctionne
// partout) : deux notes courtes pour un message, quatre pour un clin d'œil.
function jouerSonMessagerie(type) {
  try {
    if (!MESSAGERIE_AUDIO_CTX) MESSAGERIE_AUDIO_CTX = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = MESSAGERIE_AUDIO_CTX;
    if (ctx.state === "suspended") ctx.resume();
    const notes = type === "clin_oeil" ? [440, 660, 440, 660] : [660, 880];
    let t = ctx.currentTime;
    notes.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.11;
    });
  } catch (e) {
    // Audio indisponible (lecture automatique bloquée par le navigateur tant
    // qu'on n'a pas interagi avec la page, très ancien navigateur...) : on se
    // tait simplement, ce n'est jamais bloquant pour l'agent.
  }
}

function secouerElement(el) {
  if (!el) return;
  el.classList.add("messagerie-secousse");
  setTimeout(() => el.classList.remove("messagerie-secousse"), 500);
}

function avatarHtmlMessagerie(c) {
  if (c.avatar) return `<img src="${echapper(c.avatar)}" alt="" class="messagerie-avatar-img">`;
  return `<span class="messagerie-avatar">${initialesPseudo(c.pseudo)}</span>`;
}

// ---- liste de contacts (« buddy list ») -----------------------------------

async function chargerContactsMessagerie() {
  try {
    const data = await appelAPI("/api/chat/contacts");
    MESSAGERIE_MON_STATUT = data.statut || "disponible";
    MESSAGERIE_CONTACTS = data.contacts || [];
    const totalNonLus = MESSAGERIE_CONTACTS.reduce((s, c) => s + (c.non_lus || 0), 0);
    if (!MESSAGERIE_PREMIER_CHARGEMENT && totalNonLus > MESSAGERIE_NON_LUS_PRECEDENT) {
      jouerSonMessagerie("texte");
      secouerElement(document.getElementById("messagerie-bouton-liste"));
    }
    MESSAGERIE_NON_LUS_PRECEDENT = totalNonLus;
    MESSAGERIE_PREMIER_CHARGEMENT = false;
    majMonStatutAffiche();
    rendreListeContacts();
    majBadgeTotal(totalNonLus);
    // Les fenêtres déjà ouvertes affichent aussi le statut de la personne :
    // pas besoin d'attendre le prochain sondage de CETTE fenêtre pour le savoir.
    MESSAGERIE_FENETRES.forEach((f) => {
      const c = MESSAGERIE_CONTACTS.find((x) => x.id === f.membreId);
      if (c) majEnteteFenetre(f, c.statut);
    });
  } catch (e) {
    // Un sondage qui échoue ponctuellement (coupure réseau...) ne doit jamais
    // interrompre le travail de l'agent avec un message d'erreur intrusif.
  }
}

function rendreListeContacts() {
  const conteneur = document.getElementById("messagerie-contacts");
  const q = MESSAGERIE_RECHERCHE.trim().toLowerCase();
  const liste = MESSAGERIE_CONTACTS.filter((c) => !q || c.pseudo.toLowerCase().includes(q));
  if (!liste.length) {
    conteneur.innerHTML = `<div class="messagerie-vide">${MESSAGERIE_CONTACTS.length ? "Aucun contact ne correspond à votre recherche." : "Aucun autre membre pour le moment."}</div>`;
    return;
  }
  conteneur.innerHTML = liste.map((c) => `
    <button type="button" class="messagerie-contact" data-id="${c.id}">
      <span class="messagerie-avatar-bloc">
        ${avatarHtmlMessagerie(c)}
        <span class="messagerie-pastille messagerie-statut-${c.statut}" title="${libelleStatutMessagerie(c.statut)}"></span>
      </span>
      <span class="messagerie-contact-texte">
        <strong>${echapper(c.pseudo)}</strong>
        <span class="messagerie-contact-apercu">${c.dernier_message ? echapper(c.dernier_message) : libelleStatutMessagerie(c.statut)}</span>
      </span>
      ${c.non_lus ? `<span class="messagerie-badge">${c.non_lus > 9 ? "9+" : c.non_lus}</span>` : ""}
    </button>`).join("");
  conteneur.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = MESSAGERIE_CONTACTS.find((x) => x.id === Number(btn.dataset.id));
      if (c) ouvrirFenetreChat(c);
    });
  });
}

function majBadgeTotal(total) {
  const badge = document.getElementById("messagerie-badge-total");
  badge.textContent = total > 9 ? "9+" : String(total);
  badge.classList.toggle("cache", !total);
}

function majMonStatutAffiche() {
  document.getElementById("mon-statut-pastille").className = "messagerie-pastille messagerie-statut-" + MESSAGERIE_MON_STATUT;
  document.getElementById("mon-statut-texte").textContent = libelleStatutMessagerie(MESSAGERIE_MON_STATUT);
}

document.getElementById("messagerie-bouton-liste").addEventListener("click", () => {
  document.getElementById("messagerie-liste").classList.toggle("cache");
});
document.getElementById("messagerie-fermer-liste").addEventListener("click", () => {
  document.getElementById("messagerie-liste").classList.add("cache");
});
document.getElementById("messagerie-recherche").addEventListener("input", (ev) => {
  MESSAGERIE_RECHERCHE = ev.target.value;
  rendreListeContacts();
});

document.getElementById("bouton-mon-statut").addEventListener("click", (ev) => {
  ev.stopPropagation();
  const menu = document.getElementById("menu-mon-statut");
  const vaOuvrir = menu.classList.contains("cache");
  menu.classList.toggle("cache", !vaOuvrir);
  document.getElementById("bouton-mon-statut").setAttribute("aria-expanded", String(vaOuvrir));
});
document.getElementById("menu-mon-statut").querySelectorAll("[data-statut]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const statut = btn.dataset.statut;
    document.getElementById("menu-mon-statut").classList.add("cache");
    MESSAGERIE_MON_STATUT = statut;
    majMonStatutAffiche();
    try {
      await appelAPI("/api/chat/presence", { method: "PUT", body: JSON.stringify({ statut }) });
    } catch (e) {
      // Le prochain sondage (4s plus tard) resynchronisera de toute façon l'affichage.
    }
  });
});
document.addEventListener("click", (ev) => {
  const menu = document.getElementById("menu-mon-statut");
  if (!menu.classList.contains("cache") && !menu.contains(ev.target) && ev.target.id !== "bouton-mon-statut") {
    menu.classList.add("cache");
    document.getElementById("bouton-mon-statut").setAttribute("aria-expanded", "false");
  }
});

// ---- fenêtres de conversation (plusieurs à la fois, comme MSN) ------------

function rendreCoquilleFenetre(etat) {
  return `
    <div class="messagerie-fenetre-entete">
      <span class="messagerie-pastille messagerie-statut-${etat.statut}"></span>
      <div class="messagerie-fenetre-titre">
        <strong>${echapper(etat.pseudo)}</strong>
        <span class="messagerie-fenetre-statut-texte">${libelleStatutMessagerie(etat.statut)}</span>
      </div>
      <button type="button" class="messagerie-fenetre-icone" data-reduire-bouton title="Réduire" aria-label="Réduire">–</button>
      <button type="button" class="messagerie-fenetre-icone" data-fermer title="Fermer" aria-label="Fermer">✕</button>
    </div>
    <div class="messagerie-fenetre-corps" id="messagerie-corps-${etat.membreId}"></div>
    <div class="messagerie-fenetre-frappe cache" id="messagerie-frappe-${etat.membreId}">${echapper(etat.pseudo)} est en train d'écrire…</div>
    <form class="messagerie-fenetre-pied" id="messagerie-form-${etat.membreId}">
      <textarea id="messagerie-champ-${etat.membreId}" maxlength="1000" placeholder="Écrire un message…" rows="1"></textarea>
      <button type="button" class="messagerie-fenetre-clin-oeil" id="messagerie-clin-oeil-${etat.membreId}" title="Envoyer un clin d'œil">👋</button>
      <button type="submit" class="messagerie-fenetre-envoyer" title="Envoyer" aria-label="Envoyer">➤</button>
    </form>`;
}

function brancherFenetre(etat) {
  const id = etat.membreId;
  const div = document.getElementById("messagerie-fenetre-" + id);
  div.querySelector(".messagerie-fenetre-entete").addEventListener("click", () => basculerReductionFenetre(id));
  div.querySelector("[data-reduire-bouton]").addEventListener("click", (ev) => { ev.stopPropagation(); basculerReductionFenetre(id); });
  div.querySelector("[data-fermer]").addEventListener("click", (ev) => { ev.stopPropagation(); fermerFenetreChat(id); });

  const champ = document.getElementById("messagerie-champ-" + id);
  const form = document.getElementById("messagerie-form-" + id);
  const boutonClin = document.getElementById("messagerie-clin-oeil-" + id);

  let dernierEnvoiFrappe = 0;
  champ.addEventListener("input", () => {
    const maintenant = Date.now();
    if (maintenant - dernierEnvoiFrappe > 1500) {
      dernierEnvoiFrappe = maintenant;
      appelAPI("/api/chat/frappe", { method: "POST", body: JSON.stringify({ avec: id }) }).catch(() => {});
    }
  });
  champ.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const contenu = champ.value.trim();
    if (!contenu) return;
    champ.value = "";
    await envoyerMessageFenetre(etat, "texte", contenu);
  });
  boutonClin.addEventListener("click", () => envoyerMessageFenetre(etat, "clin_oeil", ""));
}

function ouvrirFenetreChat(contact) {
  let etat = MESSAGERIE_FENETRES.find((f) => f.membreId === contact.id);
  if (etat) {
    etat.minimisee = false;
    majReduction(etat);
    const champ = document.getElementById("messagerie-champ-" + contact.id);
    if (champ) champ.focus();
    return;
  }
  const maxFenetres = window.innerWidth < 640 ? 1 : MESSAGERIE_MAX_FENETRES;
  if (MESSAGERIE_FENETRES.length >= maxFenetres) {
    fermerFenetreChat(MESSAGERIE_FENETRES[0].membreId);
  }
  etat = { membreId: contact.id, pseudo: contact.pseudo, avatar: contact.avatar, statut: contact.statut, dernierId: 0, minimisee: false };
  MESSAGERIE_FENETRES.push(etat);
  const div = document.createElement("div");
  div.className = "messagerie-fenetre";
  div.id = "messagerie-fenetre-" + contact.id;
  div.innerHTML = rendreCoquilleFenetre(etat);
  document.getElementById("messagerie-fenetres").appendChild(div);
  brancherFenetre(etat);
  document.getElementById("messagerie-liste").classList.add("cache"); // place à la conversation, comme MSN
  chargerMessagesFenetre(etat, true);
}

function fermerFenetreChat(membreId) {
  MESSAGERIE_FENETRES = MESSAGERIE_FENETRES.filter((f) => f.membreId !== membreId);
  const div = document.getElementById("messagerie-fenetre-" + membreId);
  if (div) div.remove();
}

function basculerReductionFenetre(membreId) {
  const etat = MESSAGERIE_FENETRES.find((f) => f.membreId === membreId);
  if (!etat) return;
  etat.minimisee = !etat.minimisee;
  majReduction(etat);
}

function majReduction(etat) {
  const div = document.getElementById("messagerie-fenetre-" + etat.membreId);
  if (div) div.classList.toggle("messagerie-reduite", etat.minimisee);
}

function majEnteteFenetre(etat, statut) {
  etat.statut = statut;
  const div = document.getElementById("messagerie-fenetre-" + etat.membreId);
  if (!div) return;
  const pastille = div.querySelector(".messagerie-fenetre-entete .messagerie-pastille");
  if (pastille) pastille.className = "messagerie-pastille messagerie-statut-" + statut;
  const texte = div.querySelector(".messagerie-fenetre-statut-texte");
  if (texte) texte.textContent = libelleStatutMessagerie(statut);
}

function formaterHeureMessage(brut) {
  const iso = String(brut).includes("T") ? brut : String(brut).replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function texteMessageHTML(contenu) {
  return echapper(contenu).replace(/\n/g, "<br>");
}

function bulleMessageHTML(m, monId) {
  const mien = Number(m.expediteur_id) === Number(monId);
  if (m.type === "clin_oeil") {
    return `<div class="messagerie-clin-oeil-ligne">👋 ${mien ? "Vous avez envoyé un clin d'œil" : "a envoyé un clin d'œil"}</div>`;
  }
  return `
    <div class="messagerie-bulle-ligne ${mien ? "messagerie-mien" : ""}">
      <div class="messagerie-bulle">${texteMessageHTML(m.contenu)}</div>
      <span class="messagerie-heure">${formaterHeureMessage(m.envoye_le)}</span>
    </div>`;
}

function ajouterMessagesFenetre(etat, messages, forcerDefilement) {
  const corps = document.getElementById("messagerie-corps-" + etat.membreId);
  if (!corps) return;
  const etaitEnBas = corps.scrollHeight - corps.scrollTop - corps.clientHeight < 40;
  messages.forEach((m) => {
    corps.insertAdjacentHTML("beforeend", bulleMessageHTML(m, SESSION.id));
    if (typeof m.id === "number" && m.id > etat.dernierId) etat.dernierId = m.id;
  });
  if (forcerDefilement || etaitEnBas) corps.scrollTop = corps.scrollHeight;
}

async function chargerMessagesFenetre(etat, estChargementInitial) {
  try {
    const data = await appelAPI(`/api/chat/messages?avec=${etat.membreId}&apres_id=${etat.dernierId}`);
    const nouveaux = data.messages || [];
    if (nouveaux.length) {
      ajouterMessagesFenetre(etat, nouveaux, !!estChargementInitial);
      if (!estChargementInitial) {
        const recus = nouveaux.filter((m) => Number(m.expediteur_id) !== Number(SESSION.id));
        if (recus.length) {
          jouerSonMessagerie(recus.some((m) => m.type === "clin_oeil") ? "clin_oeil" : "texte");
          if (recus.some((m) => m.type === "clin_oeil")) secouerElement(document.getElementById("messagerie-fenetre-" + etat.membreId));
        }
      }
    }
    majEnteteFenetre(etat, data.statut || etat.statut);
    const zoneFrappe = document.getElementById("messagerie-frappe-" + etat.membreId);
    if (zoneFrappe) zoneFrappe.classList.toggle("cache", !data.frappe);
  } catch (e) {
    // On retentera au prochain sondage.
  }
}

async function envoyerMessageFenetre(etat, type, contenu) {
  try {
    const r = await appelAPI("/api/chat/messages", { method: "POST", body: JSON.stringify({ avec: etat.membreId, type, contenu }) });
    etat.dernierId = Math.max(etat.dernierId, r.id);
    ajouterMessagesFenetre(etat, [{ id: r.id, expediteur_id: SESSION.id, type, contenu, envoye_le: new Date().toISOString() }], true);
  } catch (e) {
    ajouterMessagesFenetre(etat, [{ id: "e" + Date.now(), expediteur_id: SESSION.id, type: "texte", contenu: "⚠ Message non envoyé : " + e.message, envoye_le: new Date().toISOString() }], true);
  }
}

// ---- démarrage : premier sondage puis toutes les 4 secondes ---------------

function demarrerMessagerie() {
  chargerContactsMessagerie();
  setInterval(() => {
    chargerContactsMessagerie();
    MESSAGERIE_FENETRES.forEach((etat) => chargerMessagesFenetre(etat, false));
  }, MESSAGERIE_INTERVALLE_MS);
}

// ---------------------------------------------------------------------------
// Habillage des menus déroulants (voir ameliorerSelect dans layout.js) —
// remplace le rendu natif (gris, non personnalisable) par un menu flottant
// aux couleurs du site. Fait une seule fois pour les <select> déjà présents
// dans la page ; ceux du tableau des comptes sont habillés à chaque
// reconstruction du tableau (voir chargerTableMembres).
// ---------------------------------------------------------------------------

["filtre-categorie", "filtre-statut", "bien-categorie", "bien-sous-categorie", "bien-coherence", "bien-vip", "membre-grade"]
  .forEach((id) => ameliorerSelect(document.getElementById(id), id === "membre-grade" ? couleurGrade : null));

demarrer();


// =============================================================================
// Paramètres -> Roxwood Network (bot Discord) : un secret webhook par type
// d'événement (voir EVENEMENTS_ROXWOOD / roxwood() côté serveur, dans
// src/index.js), saisi à la main, plus un journal de consultation des
// événements reçus. Rien ici n'alimente Statistiques ou Comptabilité.
// =============================================================================

function initialiserUrlWebhookRoxwood() {
  const input = document.getElementById("roxwood-url-webhook");
  if (!input) return;
  input.value = window.location.origin + "/api/webhooks/roxwood";
  const avertissement = document.getElementById("roxwood-avertissement-url");
  if (avertissement) {
    avertissement.textContent = /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)
      ? "⚠️ Le site n'a pas encore de nom de domaine : cette adresse fonctionne, mais changera le jour où vous en aurez un — pensez à la remettre à jour côté bot à ce moment-là."
      : "";
  }
}

document.getElementById("bouton-copier-url-roxwood")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById("roxwood-url-webhook").value);
    afficherMessage("zone-message-roxwood", "Adresse copiée ✓", "succes");
  } catch (e) {
    afficherMessage("zone-message-roxwood", "Impossible de copier automatiquement — sélectionnez le texte à la main.", "erreur");
  }
});

async function chargerParametresRoxwood() {
  initialiserUrlWebhookRoxwood();
  afficherMessage("zone-message-roxwood", "", null);
  try {
    const r = await appelAPI("/api/roxwood/config");
    document.getElementById("corps-table-roxwood-config").innerHTML = r.types.map((t) => `
      <tr data-type-roxwood="${echapper(t.type)}">
        <td>${echapper(t.libelle)}</td>
        <td>${t.configure ? `<span class="puce puce-ok">✓ Configuré</span>` : `<span class="puce puce-off">Non configuré</span>`}</td>
        <td><input type="password" class="table-input" placeholder="${t.configure ? "•••••••••••••••• (laisser vide pour ne pas changer)" : "Coller le secret ici"}" data-secret-roxwood style="min-width:220px;"></td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn btn-fantome btn-petit" data-enregistrer-roxwood="${echapper(t.type)}">Enregistrer</button>
          ${t.configure ? `<button type="button" class="btn btn-danger btn-petit" data-retirer-roxwood="${echapper(t.type)}">Retirer</button>` : ""}
        </td>
      </tr>`).join("");
    cablerBoutonsRoxwoodConfig();

    const filtre = document.getElementById("roxwood-filtre-type");
    const valeurActuelle = filtre.value;
    filtre.innerHTML = '<option value="">Tous les types</option>' +
      r.types.map((t) => `<option value="${echapper(t.type)}">${echapper(t.libelle)}</option>`).join("");
    filtre.value = valeurActuelle;
  } catch (e) {
    document.getElementById("corps-table-roxwood-config").innerHTML = `<tr><td colspan="4">Erreur de chargement.</td></tr>`;
    afficherMessage("zone-message-roxwood", "Impossible de charger la configuration : " + e.message, "erreur");
  }
  chargerJournalRoxwood();
}

function cablerBoutonsRoxwoodConfig() {
  const corps = document.getElementById("corps-table-roxwood-config");
  corps.querySelectorAll("[data-enregistrer-roxwood]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.enregistrerRoxwood;
      const ligne = corps.querySelector(`tr[data-type-roxwood="${CSS.escape(type)}"]`);
      const secret = ligne.querySelector("[data-secret-roxwood]").value.trim();
      if (!secret) { afficherMessage("zone-message-roxwood", "Collez d'abord le secret copié depuis Discord.", "erreur"); return; }
      try {
        await appelAPI("/api/roxwood/config", { method: "PUT", body: JSON.stringify({ type, secret }) });
        afficherMessage("zone-message-roxwood", "Secret enregistré ✓", "succes");
        chargerParametresRoxwood();
      } catch (e) {
        afficherMessage("zone-message-roxwood", "Impossible d'enregistrer : " + e.message, "erreur");
      }
    });
  });
  corps.querySelectorAll("[data-retirer-roxwood]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.retirerRoxwood;
      const ok = await confirmerAction("Le bot ne pourra plus envoyer ce type d'événement au site tant qu'un nouveau secret n'aura pas été collé ici. Continuer ?", "Retirer ce secret ?");
      if (!ok) return;
      try {
        await appelAPI(`/api/roxwood/config?type=${encodeURIComponent(type)}`, { method: "DELETE" });
        afficherMessage("zone-message-roxwood", "Secret retiré ✓", "succes");
        chargerParametresRoxwood();
      } catch (e) {
        afficherMessage("zone-message-roxwood", "Impossible de retirer : " + e.message, "erreur");
      }
    });
  });
}

document.getElementById("bouton-rafraichir-roxwood")?.addEventListener("click", () => chargerJournalRoxwood());
document.getElementById("roxwood-filtre-type")?.addEventListener("change", () => chargerJournalRoxwood());

function formaterDateRoxwood(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return echapper(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

async function chargerJournalRoxwood() {
  const zone = document.getElementById("roxwood-journal-liste");
  const vide = document.getElementById("roxwood-journal-vide");
  if (!zone || !vide) return;
  const type = document.getElementById("roxwood-filtre-type")?.value || "";
  try {
    const r = await appelAPI(`/api/roxwood/evenements?limite=50${type ? "&type=" + encodeURIComponent(type) : ""}`);
    if (!r.evenements.length) {
      zone.innerHTML = "";
      vide.classList.remove("cache");
      return;
    }
    vide.classList.add("cache");
    zone.innerHTML = r.evenements.map((ev) => `
      <details class="roxwood-evenement">
        <summary>
          <span class="puce puce-or">${echapper(ev.libelle)}</span>
          <span class="champ-aide" style="margin:0;">${formaterDateRoxwood(ev.recuLe)}</span>
        </summary>
        <pre class="roxwood-payload">${echapper(JSON.stringify(ev.payload, null, 2))}</pre>
      </details>`).join("");
  } catch (e) {
    zone.innerHTML = "";
    afficherMessage("zone-message-roxwood", "Impossible de charger le journal : " + e.message, "erreur");
  }
}
