// ============================================================================
// Dynasty 8 — logique de l'espace agents (admin.html)
// ============================================================================

let SESSION = null; // { pseudo, grade, direction }
let CACHE_BIENS = [];
let CACHE_MEMBRES = [];
let IMAGES_BIEN = []; // photos du bien en cours d'édition (URL importées, liens, anciennes images base64)
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
    function surEchap(ev) { if (ev.key === "Escape") { ev.preventDefault(); nettoyer(false); } }

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
        droitsRh: moi.droits_rh || [],
        peutReglerLiens: !!moi.peut_regler_liens,
        stockagePhotos: !!moi.stockage_photos,
        carteReglee: !!moi.carte_reglee,
      };
      definirGrades(moi.grades);
      // Le lien du registre n'est pas dans la page : réglé dans Paramètres,
      // donné aux seuls comptes connectés, masqué s'il est vide.
      const lienRegistre = document.getElementById("lien-registre");
      if (lienRegistre && moi.lien_registre) {
        lienRegistre.href = moi.lien_registre;
        lienRegistre.hidden = false;
      }
      return demarrerEspaceAdmin();
    }
  } catch (e) {
    // Non connecté : on continue vers l'écran de connexion.
  }

  if (etat && etat.startsWith("folkos_")) {
    // Retour de « Se connecter IG » (ordinateur en jeu, voir folkosCallback côté serveur).
    const code = etat.slice(7);
    const messages = {
      "compte-inconnu": "Aucun compte Dynasty 8 n'est lié à votre Discord. Connectez-vous une première fois avec Discord depuis un navigateur, puis réessayez en jeu.",
      "attente": "Votre demande d'accès est en attente de validation par la Direction.",
      "desactive": "Ce compte est désactivé. Contactez la Direction si vous pensez qu'il s'agit d'une erreur.",
      "config": "La connexion en jeu n'est pas encore configurée sur le serveur.",
      "sans-discord": "Votre compte en jeu n'a pas de Discord associé : impossible de retrouver votre compte Dynasty 8.",
    };
    afficherMessage("zone-message", messages[code] || "La connexion depuis l'ordinateur en jeu a échoué. Réessayez, ou connectez-vous avec Discord.", "erreur");
  } else if (etat === "attente") {
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
  construireListesGrades();
  // Stockage des photos non réglé sur le serveur (FBFA_STORAGE_TOKEN et
  // FBFA_STORAGE_BASE absents du .env) : on le dit tout de suite, au lieu de
  // laisser choisir un fichier pour échouer ensuite.
  if (!SESSION.stockagePhotos) {
    for (const id of ["bouton-parcourir", "bouton-profil-photo", "bouton-profil-compte-photo"]) {
      const bouton = document.getElementById(id);
      if (!bouton) continue;
      bouton.disabled = true;
      bouton.title = "Envoi de photos indisponible : le stockage des photos n'est pas configuré sur le serveur.";
      bouton.insertAdjacentHTML("afterend", '<p class="champ-aide" style="margin:6px 0 0;">Envoi de photos indisponible : le stockage n’est pas encore configuré sur le serveur.</p>');
    }
  }
  document.body.classList.add("admin-connecte");
  document.getElementById("pseudo-connecte").textContent = SESSION.pseudo;
  document.getElementById("grade-connecte").textContent = SESSION.grade || "—";
  document.getElementById("avatar-connecte").textContent = initialesPseudo(SESSION.pseudo);
  document.getElementById("messagerie-mon-avatar").textContent = initialesPseudo(SESSION.pseudo);
  document.getElementById("messagerie-mon-pseudo").textContent = SESSION.pseudo;
  // Un membre sans droits sur les annonces (grade "Stagiaire") n'a accès qu'à son profil.
  document.getElementById("onglet-annonces").classList.toggle("cache", !SESSION.peutGererAnnonces);
  if (SESSION.direction) {
    document.getElementById("groupe-direction").classList.remove("cache");
    document.getElementById("onglet-comptes").classList.remove("cache");
    document.getElementById("onglet-comptabilite").classList.remove("cache");
    document.getElementById("onglet-statistiques").classList.remove("cache");
    document.getElementById("onglet-parametres").classList.remove("cache");
  }
  // RH : visible selon les permissions RH du grade (réglables dans l'onglet),
  // pas seulement pour la Direction.
  document.getElementById("onglet-rh").classList.toggle("cache", !SESSION.droitsRh.includes("voir"));
  // Le lien Webmap est réservé au Patron, au Co Patron, et au Développeur web
  // (qui a exactement les mêmes accès que le Patron, y compris ici).
  document.getElementById("onglet-webmap").classList.toggle("cache", !SESSION.peutReglerLiens);
  // Chaque bouton [data-onglet] (WebMap compris, intégrée dans la page) bascule
  // le panneau correspondant.
  document.querySelectorAll(".lien-onglet[data-onglet]").forEach((btn) => {
    btn.addEventListener("click", () => basculerOnglet(btn.dataset.onglet));
  });
  const ongletDepart = SESSION.peutGererAnnonces ? "annonces" : "profil";
  basculerOnglet(ongletDepart);
  if (ongletDepart === "annonces") chargerTableBiens();
  demarrerMessagerie();
  demarrerEnService();
}

// ---------------------------------------------------------------------------
// Encadré « En service » (barre latérale) : qui est en service et depuis
// quand, d'après le salon Discord des services (src/services.js). Relu chaque
// minute ; masqué tant que le salon n'est pas réglé dans Paramètres.
// ---------------------------------------------------------------------------

function dureeDepuis(debutUtc) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(String(debutUtc).replace(" ", "T") + "Z").getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function heureParis(debutUtc) {
  const d = new Date(String(debutUtc).replace(" ", "T") + "Z");
  return isNaN(d) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

async function chargerEnService() {
  const encadre = document.getElementById("encadre-en-service");
  try {
    const r = await appelAPI("/api/services/en-cours");
    encadre.classList.toggle("cache", !r.regle);
    if (!r.regle) return;
    document.getElementById("en-service-nombre").textContent = r.en_service.length;
    document.getElementById("liste-en-service").innerHTML = r.en_service.length
      ? r.en_service.map((p) => `<li title="En service depuis ${echapper(heureParis(p.depuis))}${p.mode ? " — " + echapper(p.mode) : ""}">
          <span class="admin-en-service-nom">${echapper(p.nom)}</span>
          <span class="admin-en-service-depuis">depuis ${echapper(heureParis(p.depuis))} · ${dureeDepuis(p.depuis)}</span>
        </li>`).join("")
      : '<li class="admin-en-service-vide">Personne pour le moment.</li>';
  } catch (e) {
    // Erreur passagère (réseau) : on garde le dernier affichage.
  }
}

function demarrerEnService() {
  chargerEnService();
  setInterval(chargerEnService, 60 * 1000);
}

function basculerOnglet(nom) {
  document.querySelectorAll(".lien-onglet[data-onglet]").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  document.getElementById("panneau-annonces").classList.toggle("cache", nom !== "annonces");
  document.getElementById("panneau-agenda").classList.toggle("cache", nom !== "agenda");
  document.getElementById("panneau-profil").classList.toggle("cache", nom !== "profil");
  document.getElementById("panneau-comptes").classList.toggle("cache", nom !== "comptes");
  document.getElementById("panneau-comptabilite").classList.toggle("cache", nom !== "comptabilite");
  document.getElementById("panneau-statistiques").classList.toggle("cache", nom !== "statistiques");
  document.getElementById("panneau-rh").classList.toggle("cache", nom !== "rh");
  document.getElementById("panneau-coherences").classList.toggle("cache", nom !== "coherences");
  document.getElementById("panneau-webmap").classList.toggle("cache", nom !== "webmap");
  document.getElementById("panneau-parametres").classList.toggle("cache", nom !== "parametres");
  // L'agenda a besoin de toute la largeur disponible (voir style.css) : le
  // reste des onglets garde la mise en page habituelle, limitée en largeur.
  document.getElementById("admin-contenu").classList.toggle("admin-contenu--pleine", nom === "agenda" || nom === "webmap");
  if (nom === "profil") chargerMonProfil();
  if (nom === "comptes") chargerTableMembres();
  if (nom === "agenda") chargerAgenda(true);
  if (nom === "comptabilite") chargerTablette();
  if (nom === "statistiques") { chargerStatistiques(); chargerTableur(); }
  if (nom === "rh") chargerRh();
  if (nom === "coherences") afficherCoherences();
  if (nom === "webmap") afficherCarte();
  if (nom === "parametres") { chargerReglagesLiens(); chargerApparence(); chargerRangsGrades(); chargerSyncSheet(); }
}

// ---------------------------------------------------------------------------
// Onglet « WebMap » — même intégration que les pages publiques (monterCadreCarte
// dans layout.js) : le cadre n'est créé qu'à la première ouverture de l'onglet.
// ---------------------------------------------------------------------------

function afficherCarte() {
  const reglee = SESSION.carteReglee;
  document.getElementById("carte-non-reglee").classList.toggle("cache", reglee);
  const boite = document.getElementById("boite-carte-agents");
  boite.classList.toggle("cache", !reglee);
  if (reglee) monterCadreCarte(boite);
}

// ---------------------------------------------------------------------------
// Onglet « Cohérences » — les guides de cohérence du site public, consultés
// ici sans ouvrir d'autre fenêtre. Le contenu est écrit une seule fois dans
// coherences-guides.js (GUIDES_COHERENCE), partagé avec /coherence.html.
// ---------------------------------------------------------------------------

let ZONE_COHERENCE = null;

function afficherCoherences(zone) {
  ZONE_COHERENCE = zone || ZONE_COHERENCE || ZONES_COHERENCE[0];
  const guide = GUIDES_COHERENCE[ZONE_COHERENCE];
  const zones = document.getElementById("coherences-zones");
  zones.innerHTML = ZONES_COHERENCE.map((z) =>
    `<button type="button" class="compta-sous-onglet ${z === ZONE_COHERENCE ? "actif" : ""}" data-coherence-zone="${echapper(z)}">${GUIDES_COHERENCE[z].icone} ${echapper(z)}</button>`).join("");
  zones.querySelectorAll("[data-coherence-zone]").forEach((b) => b.addEventListener("click", () => afficherCoherences(b.dataset.coherenceZone)));
  document.getElementById("coherences-intro").textContent = guide.intro;
  document.getElementById("coherences-guide-titre").textContent = `Guide complet — ${ZONE_COHERENCE}`;
  monterDiaporamaCoherence(document.getElementById("coherences-diaporama"), ZONE_COHERENCE);
  document.getElementById("coherences-sections").innerHTML = rendreResumeCoherence(ZONE_COHERENCE);
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
    if (!reponse.semaines || !reponse.semaines.length) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      return;
    }
    vide.classList.add("cache");
    resultat.classList.remove("cache");
    // Totaux agence (toutes semaines confondues) — remplace l'ancien tableau
    // semaine par semaine.
    document.getElementById("stats-total-ventes").textContent = reponse.totalVentes ?? 0;
    document.getElementById("stats-total-locations").textContent = reponse.totalLocations ?? 0;
    // Semaine la plus récente ayant des données (voir statsSemaines côté
    // serveur, qui la déduit de la liste déjà triée).
    document.getElementById("stats-semaine-libelle").textContent = reponse.semaineRecente
      ? `Semaine ${reponse.semaineRecente}`
      : "Aucune semaine avec des données pour le moment.";
    document.getElementById("stats-semaine-ventes").textContent = reponse.ventesSemaine ?? 0;
    document.getElementById("stats-semaine-locations").textContent = reponse.locationsSemaine ?? 0;
  } catch (e) {
    afficherMessage("zone-message-statistiques", "Impossible de charger les statistiques : " + e.message, "erreur");
  }
}

// « Chiffres du tableur » : lignes du Google Sheets de la Direction, avec les
// primes calculées côté serveur (mêmes montants que « Mon profil » et la DOT),
// la fiche du référentiel reliée et le compte du site. Lecture seule.
// Sélecteur : la semaine en cours (chiffres actuels du tableur) ou une
// semaine archivée (figée le dimanche à 23:59, heure de Paris).
async function chargerTableur(semaine) {
  afficherMessage("zone-message-tableur", "", null);
  const etatLigne = document.getElementById("tableur-etat");
  const vide = document.getElementById("tableur-vide");
  const resultat = document.getElementById("tableur-resultat");
  const select = document.getElementById("select-semaine-tableur");
  const choisie = semaine === undefined ? select.value : semaine;
  try {
    const r = await appelAPI("/api/stats/tableur" + (choisie ? `?semaine=${encodeURIComponent(choisie)}` : ""));
    const options = [`<option value="">Semaine en cours${r.semaineEnCours ? ` (${echapper(r.semaineEnCours)})` : ""}</option>`]
      .concat((r.archives || []).map((a) => `<option value="${echapper(a.semaine)}">${echapper(a.semaine)} — archivée</option>`));
    select.innerHTML = options.join("");
    select.value = choisie || "";
    ameliorerSelect(select);
    if (r.archive) {
      etatLigne.textContent = `Semaine ${r.archive.semaine} — archivée le ${formaterDateAdmin(r.archive.archiveLe)}`
        + ` (chiffres lus le ${formaterDateAdmin(r.archive.donneesDu)})`
        + (r.archive.enRetard ? ", après coup : le serveur était arrêté dimanche à 23:59." : ".");
    } else {
      etatLigne.textContent = !r.configure
        ? "Synchronisation non configurée sur ce serveur (GOOGLE_SHEET_ID absent du .env)."
        : r.derniereSync
          ? `Dernière lecture du tableur : ${formaterDateAdmin(r.derniereSync)}${r.statut === "erreur" ? " (échec — voir Paramètres)" : ""}.`
          : "Tableur pas encore lu — « Synchroniser maintenant » dans Paramètres.";
    }
    if (!r.lignes.length) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      return;
    }
    vide.classList.add("cache");
    resultat.classList.remove("cache");
    document.getElementById("corps-table-tableur").innerHTML = r.lignes.map((l) => {
      // Fiche RH de la ligne : ID employé et statut lus dans RH.
      const fiche = !l.employe
        ? '<span class="puce puce-or" title="Aucune fiche RH ne porte ce prénom et ce nom : à rattacher dans l’onglet Ressources humaines.">sans fiche RH</span>'
        : `${echapper(l.employe.idEmploye)}${l.employe.statut === "inactif" ? ' <span class="puce puce-masquee">Inactif</span>' : ""}`;
      return `<tr>
        <td><strong>${echapper(l.nom)}</strong></td>
        <td>${echapper(l.grade || "—")}</td>
        <td style="text-align:right;">${l.ventes}</td>
        <td style="text-align:right;">${l.locations}</td>
        <td>${formaterArgentStats(l.primeVente)}</td>
        <td>${formaterArgentStats(l.primeLocations)}</td>
        <td><strong>${formaterArgentStats(l.primeTotale)}</strong></td>
        <td>${fiche}</td>
        <td>${l.compte ? echapper(l.compte) : '<span class="champ-aide">— aucun —</span>'}</td>
      </tr>`;
    }).join("");
  } catch (e) {
    etatLigne.textContent = "";
    afficherMessage("zone-message-tableur", "Impossible de charger les chiffres du tableur : " + e.message, "erreur");
  }
}

document.getElementById("select-semaine-tableur").addEventListener("change", (e) => chargerTableur(e.target.value));

// Même logique d'espacement des milliers que formaterPrix() (layout.js), mais
// sans le suffixe "HT" : les primes ne sont pas des prix du catalogue.
function formaterArgentStats(valeur) {
  const n = Math.round(Number(valeur) || 0);
  const chiffres = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "-" : "") + chiffres + " $";
}

// ---------------------------------------------------------------------------
// Onglet « RH » — fiches employés (src/rh.js côté serveur), source de vérité
// de l'identité, du grade et du statut de chacun. Les droits viennent du
// serveur et y sont revérifiés à chaque appel : l'interface ne fait que
// masquer ce qui serait de toute façon refusé.
// ---------------------------------------------------------------------------

const LIBELLES_PERMISSIONS_RH = {
  voir: "Consulter", creer: "Ajouter", modifier: "Modifier",
  desactiver: "Désactiver", reactiver: "Réactiver", sensible: "Téléphone et RIB",
};
// Grades dans l'ordre hiérarchique en vigueur (reçus de /api/moi, voir
// definirGrades dans layout.js). Les menus sont construits après la connexion.
const nomsGrades = () => D8_GRADES.map((g) => g.nom);
const rangGrade = (nom) => { const g = D8_GRADES.find((x) => x.nom === nom); return g ? g.rang : 999; };
let OPTIONS_GRADES_HTML = "";
function construireListesGrades() {
  OPTIONS_GRADES_HTML = nomsGrades().map((g) => `<option value="${echapper(g)}">${echapper(g)}</option>`).join("");
  document.getElementById("employe-grade").innerHTML = OPTIONS_GRADES_HTML;
  const filtre = document.getElementById("filtre-rh-grade");
  const choisi = filtre.value;
  filtre.innerHTML = `<option value="">Tous les grades</option>${OPTIONS_GRADES_HTML}`;
  filtre.value = choisi;
  document.getElementById("membre-grade").innerHTML = OPTIONS_GRADES_HTML;
}

let CACHE_EMPLOYES = [];
let DROITS_RH = new Set();
let FICHE_OUVERTE = null; // id de la fiche en cours d'édition ; null = création

const aDroitRh = (droit) => DROITS_RH.has(droit);

function formaterDateCourte(iso) {
  if (!iso) return "—";
  const [a, m, j] = String(iso).split("-");
  return `${j}/${m}/${a}`;
}

async function chargerRh() {
  afficherMessage("zone-message-rh", "", null);
  try {
    const r = await appelAPI("/api/rh/employes");
    CACHE_EMPLOYES = r.employes || [];
    DROITS_RH = new Set(r.droits || []);
    document.getElementById("bouton-nouvel-employe").classList.toggle("cache", !aDroitRh("creer"));
    document.getElementById("rh-nb-actifs").textContent = r.effectif.actifs;
    document.getElementById("rh-nb-inactifs").textContent = r.effectif.inactifs;
    document.getElementById("rh-repartition").textContent = r.effectif.parGrade.length
      ? "Effectif actif par grade : " + r.effectif.parGrade.map((g) => `${g.grade} ${g.nombre}`).join(" · ")
      : "";
    ameliorerSelect(document.getElementById("filtre-rh-grade"));
    ameliorerSelect(document.getElementById("filtre-rh-statut"));
    ameliorerSelect(document.getElementById("tri-rh"));
    afficherEmployes();
    chargerARattacher();
    chargerArriveesBot();
    if (aDroitRh("parametrer")) chargerPermissionsRh();
    else document.getElementById("rh-permissions").classList.add("cache");
  } catch (e) {
    afficherMessage("zone-message-rh", "Impossible de charger RH : " + e.message, "erreur");
  }
}

function afficherEmployes() {
  const recherche = document.getElementById("recherche-employes").value.trim().toLowerCase();
  const grade = document.getElementById("filtre-rh-grade").value;
  const statut = document.getElementById("filtre-rh-statut").value;
  const tri = document.getElementById("tri-rh").value;
  const liste = CACHE_EMPLOYES.filter((e) =>
    (!grade || e.grade === grade)
    && (!statut || e.statut === statut)
    && (!recherche || [e.nomComplet, e.idEmploye, e.discordPseudo, e.discordId]
      .some((v) => String(v || "").toLowerCase().includes(recherche)))
  );
  // Tri : hiérarchie (rang du grade, réglable dans Paramètres, puis nom) ou
  // ordre alphabétique des noms. Les actifs restent devant les anciens.
  const parNom = (a, b) => a.nomComplet.localeCompare(b.nomComplet, "fr", { sensitivity: "base" });
  const parStatut = (a, b) => (a.statut === b.statut ? 0 : a.statut === "actif" ? -1 : 1);
  liste.sort(tri === "alpha"
    ? (a, b) => parStatut(a, b) || parNom(a, b)
    : (a, b) => parStatut(a, b) || rangGrade(a.grade) - rangGrade(b.grade) || parNom(a, b));
  document.getElementById("rh-vide").classList.toggle("cache", liste.length > 0);
  document.getElementById("rh-resultat").classList.toggle("cache", liste.length === 0);
  const corps = document.getElementById("corps-table-employes");
  corps.innerHTML = liste.map((e) => {
    const aCompleter = e.aCompleter
      ? ' <span class="puce puce-or" title="ID employé provisoire, ou prénom / nom manquant : à compléter dans la fiche.">à compléter</span>'
      : "";
    const statut = e.statut === "actif"
      ? '<span class="puce puce-ok">Actif</span>'
      : `<span class="puce puce-masquee">Inactif</span>${e.dateDepart ? `<br><span class="champ-aide">parti le ${formaterDateCourte(e.dateDepart)}</span>` : ""}`;
    const discord = [e.discordPseudo, e.discordId].filter(Boolean).map(echapper).join("<br>") || '<span class="champ-aide">—</span>';
    const bascule = e.statut === "actif"
      ? (aDroitRh("desactiver") ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-desactiver="${e.id}">Désactiver</button>` : "")
      : (aDroitRh("reactiver") ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-reactiver="${e.id}">Réactiver</button>` : "");
    return `<tr>
      <td>${echapper(e.idEmploye)}${e.idProvisoire ? '<br><span class="champ-aide">provisoire</span>' : ""}</td>
      <td><strong>${echapper(e.nomComplet)}</strong>${aCompleter}</td>
      <td>${echapper(e.grade)}</td>
      <td>${statut}</td>
      <td>${discord}</td>
      <td>${formaterDateCourte(e.dateArrivee)}</td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-fantome btn-petit" data-rh-fiche="${e.id}">${aDroitRh("modifier") ? "Fiche / modifier" : "Fiche"}</button> ${bascule}</td>
    </tr>`;
  }).join("");
  corps.querySelectorAll("[data-rh-fiche]").forEach((b) => b.addEventListener("click", () => ouvrirFicheEmploye(Number(b.dataset.rhFiche))));
  corps.querySelectorAll("[data-rh-desactiver]").forEach((b) => b.addEventListener("click", () => desactiverEmploye(Number(b.dataset.rhDesactiver))));
  corps.querySelectorAll("[data-rh-reactiver]").forEach((b) => b.addEventListener("click", () => reactiverEmploye(Number(b.dataset.rhReactiver))));
}

document.getElementById("recherche-employes").addEventListener("input", afficherEmployes);
document.getElementById("filtre-rh-grade").addEventListener("change", afficherEmployes);
document.getElementById("tri-rh").addEventListener("change", afficherEmployes);
document.getElementById("filtre-rh-statut").addEventListener("change", afficherEmployes);

// Fiche : consultation, modification, ou création (id absent, avec un
// pré-remplissage éventuel venu de « À rattacher »).
async function ouvrirFicheEmploye(id, preremplissage) {
  afficherMessage("zone-message-modale-employe", "", null);
  let f = { grade: "Agent", ...(preremplissage || {}) };
  if (id) {
    try {
      f = await appelAPI(`/api/rh/employes/${id}`);
    } catch (e) {
      afficherMessage("zone-message-rh", e.message, "erreur");
      return;
    }
  }
  FICHE_OUVERTE = id || null;
  const peutEcrire = id ? aDroitRh("modifier") : aDroitRh("creer");
  document.getElementById("modale-employe-titre").textContent = id ? `Fiche employé — ${f.nomComplet}` : "Ajouter un membre";
  const champs = {
    "employe-prenom": f.prenom, "employe-nom": f.nom, "employe-id": f.idEmploye,
    "employe-discord-id": f.discordId, "employe-discord-pseudo": f.discordPseudo,
    "employe-telephone": f.telephone, "employe-rib": f.rib,
    "employe-arrivee": f.dateArrivee, "employe-depart": f.dateDepart,
  };
  for (const [idChamp, valeur] of Object.entries(champs)) {
    const champ = document.getElementById(idChamp);
    champ.value = valeur || "";
    champ.disabled = !peutEcrire;
  }
  const grade = document.getElementById("employe-grade");
  // Grade hors liste (ancienne fiche) : affiché tel quel, jamais réécrit en silence.
  if (f.grade && !nomsGrades().includes(f.grade)) {
    grade.insertAdjacentHTML("beforeend", `<option value="${echapper(f.grade)}">${echapper(f.grade)} (hors liste)</option>`);
  }
  grade.value = f.grade || "Agent";
  grade.disabled = !peutEcrire;
  // La date d'arrivée est exigée à la création ; une fiche reprise de
  // l'existant peut ne pas en avoir encore.
  document.getElementById("employe-arrivee").required = !id;
  // Téléphone et RIB : le serveur ne les envoie qu'avec la permission « sensible ».
  document.getElementById("employe-bloc-sensible").classList.toggle("cache", !aDroitRh("sensible"));
  const bouton = document.getElementById("employe-enregistrer");
  bouton.classList.toggle("cache", !peutEcrire);
  bouton.textContent = id ? "Enregistrer les modifications" : "Ajouter le membre";
  document.getElementById("employe-statut").textContent = id
    ? `Statut : ${f.statut === "actif" ? "actif" : "inactif"}${f.idProvisoire ? " — ID employé provisoire (reprise de l'existant) : à remplacer par le vrai." : ""}`
    : "";
  const h = f.historique;
  document.getElementById("employe-historique").innerHTML = h ? [
    `Ventes rattachées : <strong>${h.ventesEnregistrees}</strong>${h.derniereVente ? ` — dernière reçue le ${formaterDateAdmin(h.derniereVente)}` : ""}`,
    h.tableurSemaineEnCours
      ? `Tableur, semaine en cours : ${h.tableurSemaineEnCours.ventes} vente(s), ${h.tableurSemaineEnCours.locations} location(s)`
      : "Absent du tableur cette semaine",
    `Semaines archivées du tableur : ${h.semainesArchivees}`,
    f.compteDuSite ? `Compte du site : ${echapper(f.compteDuSite.pseudo)}` : "Aucun compte du site relié (même ID Discord)",
  ].join("<br>") : "";
  document.getElementById("modale-employe").classList.remove("cache");
  if (peutEcrire) document.getElementById("employe-prenom").focus();
}

function fermerModaleEmploye() {
  document.getElementById("modale-employe").classList.add("cache");
}
document.getElementById("bouton-nouvel-employe").addEventListener("click", () => ouvrirFicheEmploye(null));
document.getElementById("fermer-modale-employe").addEventListener("click", fermerModaleEmploye);
document.getElementById("modale-employe").addEventListener("click", (ev) => { if (ev.target.id === "modale-employe") fermerModaleEmploye(); });

document.getElementById("formulaire-employe").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-employe", "", null);
  const val = (id) => document.getElementById(id).value.trim();
  const corps = {
    prenom: val("employe-prenom"),
    nom: val("employe-nom"),
    idEmploye: val("employe-id"),
    grade: document.getElementById("employe-grade").value,
    discordId: val("employe-discord-id"),
    discordPseudo: val("employe-discord-pseudo"),
    dateArrivee: val("employe-arrivee"),
    dateDepart: val("employe-depart"),
  };
  if (aDroitRh("sensible")) {
    corps.telephone = val("employe-telephone");
    corps.rib = val("employe-rib");
  }
  const creation = !FICHE_OUVERTE;
  try {
    if (creation) await appelAPI("/api/rh/employes", { method: "POST", body: JSON.stringify(corps) });
    else await appelAPI(`/api/rh/employes/${FICHE_OUVERTE}`, { method: "PATCH", body: JSON.stringify(corps) });
    fermerModaleEmploye();
    afficherMessage("zone-message-rh", creation ? "Membre ajouté ✓" : "Fiche mise à jour ✓", "succes");
    chargerRh();
  } catch (e) {
    afficherMessage("zone-message-modale-employe", e.message, "erreur");
  }
});

async function desactiverEmploye(id) {
  const e = CACHE_EMPLOYES.find((x) => x.id === id);
  const ok = await confirmerAction(
    `${e ? e.nomComplet : "Cet employé"} quittera l'effectif actif, avec la date d'aujourd'hui comme date de départ. Sa fiche et tout son historique (ventes, DOT, archives du tableur) sont conservés, et il pourra être réactivé.`,
    "Désactiver cet employé ?"
  );
  if (!ok) return;
  try {
    await appelAPI(`/api/rh/employes/${id}/desactiver`, { method: "POST", body: JSON.stringify({}) });
    afficherMessage("zone-message-rh", "Employé désactivé ✓", "succes");
    chargerRh();
  } catch (err) {
    afficherMessage("zone-message-rh", err.message, "erreur");
  }
}

async function reactiverEmploye(id) {
  const e = CACHE_EMPLOYES.find((x) => x.id === id);
  const ok = await confirmerAction(
    `${e ? e.nomComplet : "Cet employé"} réintègre l'effectif actif ; sa date de départ est effacée.`,
    "Réactiver cet employé ?"
  );
  if (!ok) return;
  try {
    await appelAPI(`/api/rh/employes/${id}/reactiver`, { method: "POST", body: JSON.stringify({}) });
    afficherMessage("zone-message-rh", "Employé réactivé ✓", "succes");
    chargerRh();
  } catch (err) {
    afficherMessage("zone-message-rh", err.message, "erreur");
  }
}

// « À rattacher » : vendeurs des ventes et lignes du tableur sans fiche RH.
async function chargerARattacher() {
  const bloc = document.getElementById("rh-a-rattacher");
  const contenu = document.getElementById("rh-a-rattacher-contenu");
  try {
    const r = await appelAPI("/api/rh/a-rattacher");
    const bouton = (attributs) => aDroitRh("creer")
      ? `<button type="button" class="btn btn-fantome btn-petit" ${attributs}>Créer la fiche</button>` : "";
    const parties = [];
    if (r.vendeurs.length) {
      parties.push(`<p class="champ-aide" style="margin:14px 0 6px;"><strong>Ventes reçues du bot sans fiche</strong> — le pseudo envoyé ne correspond au pseudo Discord d'aucune fiche.</p>
        <div style="overflow-x:auto;"><table class="table-admin"><thead><tr><th>Pseudo reçu</th><th style="text-align:right;">Ventes</th><th>Dernière semaine</th><th></th></tr></thead><tbody>
        ${r.vendeurs.map((v) => `<tr><td>${echapper(v.pseudo)}</td><td style="text-align:right;">${v.ventes}</td><td>${echapper(v.derniereSemaine || "—")}</td>
          <td>${bouton(`data-rh-creer-pseudo="${echapper(v.pseudo)}"`)}</td></tr>`).join("")}
        </tbody></table></div>`);
    }
    if (r.tableur.length) {
      parties.push(`<p class="champ-aide" style="margin:14px 0 6px;"><strong>Lignes du tableur sans fiche</strong> — le nom écrit ne correspond au « Prénom Nom » d'aucune fiche.</p>
        <div style="overflow-x:auto;"><table class="table-admin"><thead><tr><th>Nom dans le tableur</th><th>Grade</th><th style="text-align:right;">Ventes</th><th style="text-align:right;">Locations</th><th></th></tr></thead><tbody>
        ${r.tableur.map((l) => `<tr><td>${echapper(l.nom)}</td><td>${echapper(l.grade || "—")}</td><td style="text-align:right;">${l.ventes}</td><td style="text-align:right;">${l.locations}</td>
          <td>${bouton(`data-rh-creer-nom="${echapper(l.nom)}" data-rh-creer-grade="${echapper(l.grade || "")}"`)}</td></tr>`).join("")}
        </tbody></table></div>`);
    }
    bloc.classList.toggle("cache", !parties.length);
    contenu.innerHTML = parties.join("");
    contenu.querySelectorAll("[data-rh-creer-pseudo]").forEach((b) =>
      b.addEventListener("click", () => ouvrirFicheEmploye(null, { discordPseudo: b.dataset.rhCreerPseudo })));
    contenu.querySelectorAll("[data-rh-creer-nom]").forEach((b) => b.addEventListener("click", () => {
      const morceaux = b.dataset.rhCreerNom.trim().split(/\s+/);
      ouvrirFicheEmploye(null, { prenom: morceaux.shift() || "", nom: morceaux.join(" "), grade: b.dataset.rhCreerGrade || "Agent" });
    }));
  } catch (e) {
    bloc.classList.add("cache");
  }
}

// « Arrivées reçues du bot » : candidatures acceptées dans le bot Discord,
// transformées en fiches, et réglages de la réception (Patron, Co Patron,
// Développeur web). Les questions du formulaire se règlent par leur libellé.
const LIBELLES_ARRIVEE_BOT = {
  creee: '<span class="puce puce-ok">Fiche créée</span>',
  existante: '<span class="puce puce-masquee">Déjà une fiche</span>',
  refusee: '<span class="puce puce-or">À traiter</span>',
  attente: '<span class="puce puce-or">En attente d’approbation</span>',
  ecartee: '<span class="puce puce-masquee">Écartée</span>',
};
// Champ renvoyé par l'API -> champ du formulaire.
const CHAMPS_REGLAGES_BOT = {
  serveurDiscord: "rh-bot-serveur",
  questionIdentite: "rh-bot-q-identite",
  questionIdEmploye: "rh-bot-q-id-employe",
  questionPrenom: "rh-bot-q-prenom",
  questionNom: "rh-bot-q-nom",
  questionTelephone: "rh-bot-q-telephone",
  questionRib: "rh-bot-q-rib",
};

async function chargerArriveesBot() {
  const bloc = document.getElementById("rh-bot");
  try {
    const r = await appelAPI("/api/rh/bot");
    const reglable = aDroitRh("parametrer");
    // Rien à montrer tant que le bot n'est ni branché ni réglable par ce compte.
    bloc.classList.toggle("cache", !r.configure && !r.arrivees.length && !reglable);
    document.getElementById("rh-bot-etat").textContent = r.configure
      ? "Réception active : le serveur a le secret de l'abonnement « Candidatures » du bot."
      : "Réception non configurée : la variable RECRUTEMENT_WEBHOOK_SECRET manque dans le .env du serveur.";
    const formulaire = document.getElementById("rh-bot-reglages");
    formulaire.classList.toggle("cache", !reglable);
    if (reglable) {
      const select = document.getElementById("rh-bot-grade");
      select.innerHTML = `<option value="">— à régler —</option>`
        + r.grades.map((g) => `<option value="${echapper(g)}">${echapper(g)}</option>`).join("");
      select.value = r.reglages.gradeArrivee || "";
      ameliorerSelect(select);
      for (const [champ, id] of Object.entries(CHAMPS_REGLAGES_BOT)) document.getElementById(id).value = r.reglages[champ] || "";
      document.getElementById("rh-bot-questions-vues").innerHTML =
        r.questionsVues.map((q) => `<option value="${echapper(q)}"></option>`).join("");
    }
    const peutCreer = aDroitRh("creer");
    document.getElementById("rh-bot-contenu").innerHTML = r.arrivees.length
      ? `<div style="overflow-x:auto;"><table class="table-admin"><thead><tr><th>Reçu le</th><th>Candidat</th><th>ID Discord</th><th>Résultat</th><th>Fiche</th></tr></thead><tbody>
        ${r.arrivees.map((a) => `<tr>
          <td>${formaterDateAdmin(a.recuLe)}</td>
          <td>${echapper(a.nomRecu || "—")}</td>
          <td>${echapper(a.discordId || "—")}</td>
          <td>${LIBELLES_ARRIVEE_BOT[a.resultat] || echapper(a.resultat)}${a.motif ? `<div class="champ-aide">${echapper(a.motif)}</div>` : ""}</td>
          <td>${a.employe
            ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-bot-fiche="${a.employe.id}">${echapper(a.employe.idEmploye)} — ${echapper(a.employe.nomComplet)}</button>${a.employe.statut === "inactif" ? ' <span class="puce puce-masquee">Inactif</span>' : ""}`
            : peutCreer && (a.traitable || a.ecartable)
              ? (a.traitable ? `<button type="button" class="btn btn-fantome btn-petit" data-rh-bot-action="traiter" data-rh-bot-id="${a.id}">${a.resultat === "attente" ? "Approuver" : "Retraiter"}</button> ` : "")
                + `<button type="button" class="btn btn-fantome btn-petit" data-rh-bot-action="ecarter" data-rh-bot-id="${a.id}">Écarter</button>`
              : "—"}</td>
        </tr>`).join("")}
        </tbody></table></div>`
      : '<p class="champ-aide">Aucune candidature acceptée reçue pour le moment.</p>';
    document.querySelectorAll("[data-rh-bot-fiche]").forEach((b) =>
      b.addEventListener("click", () => ouvrirFicheEmploye(Number(b.dataset.rhBotFiche))));
    document.querySelectorAll("[data-rh-bot-action]").forEach((b) => b.addEventListener("click", async () => {
      const ecarter = b.dataset.rhBotAction === "ecarter";
      if (ecarter && !(await confirmerAction("Écarter cette candidature ? Aucune fiche ne sera créée, et ses réponses seront effacées."))) return;
      b.disabled = true;
      try {
        const res = await appelAPI(`/api/rh/bot/arrivees/${b.dataset.rhBotId}/${b.dataset.rhBotAction}`, { method: "POST", body: "{}" });
        if (ecarter) afficherMessage("zone-message-rh-bot", "Candidature écartée ✓", "succes");
        else if (res.resultat === "creee") afficherMessage("zone-message-rh-bot", "Fiche créée ✓", "succes");
        else afficherMessage("zone-message-rh-bot", res.motif || "Toujours à traiter.", res.ok ? "succes" : "erreur");
        chargerRh();
      } catch (e) {
        afficherMessage("zone-message-rh-bot", e.message, "erreur");
        b.disabled = false;
      }
    }));
  } catch (e) {
    bloc.classList.add("cache");
  }
}

document.getElementById("rh-bot-reglages").addEventListener("submit", async (e) => {
  e.preventDefault();
  const corps = { gradeArrivee: document.getElementById("rh-bot-grade").value };
  for (const [champ, id] of Object.entries(CHAMPS_REGLAGES_BOT)) corps[champ] = document.getElementById(id).value.trim();
  try {
    await appelAPI("/api/rh/bot/reglages", { method: "PUT", body: JSON.stringify(corps) });
    afficherMessage("zone-message-rh-bot", "Réglages du bot enregistrés ✓", "succes");
    chargerArriveesBot();
  } catch (err) {
    afficherMessage("zone-message-rh-bot", err.message, "erreur");
  }
});

// Matrice des permissions RH (Patron, Co Patron, Développeur web).
async function chargerPermissionsRh() {
  const bloc = document.getElementById("rh-permissions");
  afficherMessage("zone-message-rh-permissions", "", null);
  try {
    const r = await appelAPI("/api/rh/permissions");
    bloc.classList.remove("cache");
    document.getElementById("rh-permissions-entete").innerHTML =
      `<tr><th>Grade</th>${r.permissions.map((p) => `<th style="text-align:center;">${echapper(LIBELLES_PERMISSIONS_RH[p] || p)}</th>`).join("")}</tr>`;
    const toujours = r.gradesAdmin.map((g) => `<tr><td>${echapper(g)} <span class="champ-aide">— toujours</span></td>
      ${r.permissions.map(() => '<td style="text-align:center;"><input type="checkbox" checked disabled aria-label="toujours autorisé"></td>').join("")}</tr>`).join("");
    const reglables = r.grades.map((g) => `<tr><td>${echapper(g.grade)}</td>
      ${r.permissions.map((p) => `<td style="text-align:center;"><input type="checkbox" data-rh-perm-grade="${echapper(g.grade)}" data-rh-perm="${p}" ${g.permissions.includes(p) ? "checked" : ""} aria-label="${echapper(`${g.grade} : ${LIBELLES_PERMISSIONS_RH[p] || p}`)}"></td>`).join("")}</tr>`).join("");
    const corps = document.getElementById("rh-permissions-corps");
    corps.innerHTML = toujours + reglables;
    corps.querySelectorAll("[data-rh-perm-grade]").forEach((caseACocher) => caseACocher.addEventListener("change", async () => {
      const grade = caseACocher.dataset.rhPermGrade;
      const cases = [...corps.querySelectorAll("[data-rh-perm-grade]")].filter((c) => c.dataset.rhPermGrade === grade);
      const permissions = cases.filter((c) => c.checked).map((c) => c.dataset.rhPerm);
      try {
        await appelAPI("/api/rh/permissions", { method: "PUT", body: JSON.stringify({ grade, permissions }) });
        afficherMessage("zone-message-rh-permissions", `Permissions de « ${grade} » enregistrées ✓`, "succes");
        chargerPermissionsRh();
      } catch (e) {
        afficherMessage("zone-message-rh-permissions", e.message, "erreur");
        chargerPermissionsRh();
      }
    }));
  } catch (e) {
    afficherMessage("zone-message-rh-permissions", "Impossible de charger les permissions : " + e.message, "erreur");
  }
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
    EDITEUR_PHOTO_PROFIL.charger(moiActuel.photo || "");
    majCompteurBioProfil();
    afficherPrimesProfil(moiActuel.primes);
  } catch (e) {
    afficherMessage("zone-message-profil", "Impossible de charger votre profil : " + e.message, "erreur");
  }
}

// Ventes/locations/primes synchronisées depuis le Google Sheets de recap
// (voir /api/moi côté serveur, qui recalcule les primes avec les barèmes de
// Comptabilité -> Paramètres — jamais les colonnes N/O du Sheet).
function afficherPrimesProfil(primes) {
  const p = primes || { ventes: 0, locations: 0, primeVente: 0, primeLocations: 0, primeTotale: 0, synchronise: false, derniereSync: null };
  document.getElementById("primes-profil-ventes").textContent = p.ventes;
  document.getElementById("primes-profil-locations").textContent = p.locations;
  document.getElementById("primes-profil-prime-vente").textContent = formaterArgentStats(p.primeVente);
  document.getElementById("primes-profil-prime-location").textContent = formaterArgentStats(p.primeLocations);
  document.getElementById("primes-profil-total").textContent = formaterArgentStats(p.primeTotale);
  document.getElementById("primes-profil-non-synchronise").classList.toggle("cache", !!p.synchronise);
  document.getElementById("primes-profil-maj").textContent = p.derniereSync
    ? "Dernière mise à jour du Sheet : " + formaterDateAdmin(p.derniereSync)
    : "";
}

// Photo de profil : importée vers le stockage externe dès la sélection (même
// mécanisme que les photos d'annonces, voir envoyerPhoto()), puis enregistrée
// avec le reste du profil. Tant que « Enregistrer » n'a pas réussi, l'ancienne
// photo reste celle du site ; le fichier importé et jamais enregistré est
// nettoyé par le serveur au bout de 24 h. Un éditeur par emplacement :
// « Mon profil » et la modale « Profil public » de la Direction.
function creerEditeurPhotoProfil({ idApercu, idBoutonChanger, idBoutonRetirer, idErreur, bouton, pseudo }) {
  const etat = { valeur: "", edition: 0, transfert: null, enregistrement: false };

  function afficherErreur(texte) {
    const zone = document.getElementById(idErreur);
    zone.textContent = texte || "";
    zone.classList.toggle("cache", !texte);
  }

  function dessiner() {
    const apercu = document.getElementById(idApercu);
    apercu.textContent = "";
    if (etat.valeur) {
      const img = document.createElement("img");
      img.src = etat.valeur; // propriété DOM : une URL ne peut pas injecter de HTML
      img.alt = "Photo de profil";
      apercu.appendChild(img);
    } else {
      const initiales = document.createElement("span");
      initiales.textContent = initialesPseudo(pseudo());
      apercu.appendChild(initiales);
    }
    apercu.style.opacity = etat.transfert ? "0.5" : "";
    apercu.setAttribute("aria-busy", etat.transfert ? "true" : "false");
    const changer = document.getElementById(idBoutonChanger);
    changer.textContent = etat.transfert ? "⏳ Envoi de la photo…" : "📁 Changer la photo";
    changer.disabled = etat.enregistrement;
    const retirer = document.getElementById(idBoutonRetirer);
    retirer.textContent = etat.transfert ? "✕ Annuler l'envoi" : "✕ Retirer la photo";
    retirer.classList.toggle("cache", !etat.valeur && !etat.transfert);
    retirer.disabled = etat.enregistrement;
    const enregistrer = bouton();
    if (enregistrer && !etat.enregistrement) enregistrer.disabled = !!etat.transfert;
  }

  function annulerTransfert() {
    etat.edition++;
    if (etat.transfert) etat.transfert.abort();
    etat.transfert = null;
  }

  return {
    charger(photo) {
      annulerTransfert();
      etat.valeur = photo || "";
      afficherErreur("");
      dessiner();
    },
    fermer() {
      annulerTransfert();
      dessiner();
    },
    valeur: () => etat.valeur,
    enCours: () => !!etat.transfert,
    debutEnregistrement() { etat.enregistrement = true; dessiner(); },
    finEnregistrement() { etat.enregistrement = false; dessiner(); },
    async importer(fichier) {
      if (etat.enregistrement) return;
      annulerTransfert(); // une nouvelle sélection remplace l'envoi précédent
      const edition = etat.edition;
      const controleur = new AbortController();
      etat.transfert = controleur;
      afficherErreur("");
      dessiner();
      try {
        const blob = await redimensionnerImage(fichier, 480, 0.82);
        if (controleur.signal.aborted) return;
        const { url } = await envoyerPhoto("/api/profil/photo", blob, controleur.signal);
        if (edition !== etat.edition) return; // annulé, remplacé ou formulaire rechargé entre-temps
        etat.valeur = url;
      } catch (e) {
        if (edition === etat.edition && e.name !== "AbortError") afficherErreur(e.message);
      } finally {
        if (edition === etat.edition) {
          etat.transfert = null;
          dessiner();
        }
      }
    },
    retirer() {
      if (etat.transfert) annulerTransfert(); // garde la photo actuelle
      else etat.valeur = "";
      dessiner();
    },
  };
}

const EDITEUR_PHOTO_PROFIL = creerEditeurPhotoProfil({
  idApercu: "profil-photo-apercu",
  idBoutonChanger: "bouton-profil-photo",
  idBoutonRetirer: "bouton-profil-photo-retirer",
  idErreur: "erreur-profil-photo",
  bouton: () => document.getElementById("bouton-enregistrer-profil"),
  pseudo: () => (SESSION ? SESSION.pseudo : "?"),
});

function majCompteurBioProfil() {
  const n = document.getElementById("profil-bio").value.length;
  document.getElementById("profil-bio-compteur").textContent = n + " / 1000";
}

document.getElementById("profil-bio").addEventListener("input", majCompteurBioProfil);

document.getElementById("bouton-profil-photo").addEventListener("click", () => {
  document.getElementById("profil-photo-fichier").click();
});

document.getElementById("profil-photo-fichier").addEventListener("change", (ev) => {
  const fichier = (ev.target.files || [])[0];
  ev.target.value = ""; // permet de resélectionner le même fichier plus tard si besoin
  if (fichier) EDITEUR_PHOTO_PROFIL.importer(fichier);
});

document.getElementById("bouton-profil-photo-retirer").addEventListener("click", () => EDITEUR_PHOTO_PROFIL.retirer());

document.getElementById("formulaire-profil").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-profil", "", null);
  if (EDITEUR_PHOTO_PROFIL.enCours()) {
    afficherMessage("zone-message-profil", "Attendez la fin de l'envoi de la photo avant d'enregistrer.", "erreur");
    return;
  }
  const bouton = document.getElementById("bouton-enregistrer-profil");
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";
  EDITEUR_PHOTO_PROFIL.debutEnregistrement();
  try {
    await appelAPI("/api/moi", {
      method: "PUT",
      body: JSON.stringify({
        poste: document.getElementById("profil-poste").value.trim(),
        specialite: document.getElementById("profil-specialite").value.trim(),
        bio: document.getElementById("profil-bio").value.trim(),
        photo: EDITEUR_PHOTO_PROFIL.valeur(),
      }),
    });
    afficherMessage("zone-message-profil", "Profil enregistré ✓ Les changements sont déjà visibles sur la page équipe du site.", "succes");
  } catch (e) {
    afficherMessage("zone-message-profil", e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
    EDITEUR_PHOTO_PROFIL.finEnregistrement();
  }
});

// ---------------------------------------------------------------------------
// Onglet « Mon agenda » — planning personnel privé (une semaine à la fois).
// Chaque membre ne voit et ne modifie que ses propres événements : le serveur
// s'en charge (voir agenda() dans src/index.js), le rôle du JS ici est juste
// d'afficher joliment une grille de 7 jours × 24 heures et de gérer les clics.
// ---------------------------------------------------------------------------

let AGENDA_VUE = "semaine"; // "mois" | "semaine" | "jour"
let AGENDA_REF = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })(); // n'importe quel jour de la période affichée
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

function capitaliser(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function nomCourtJour(d) { return capitaliser(d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")); }

// Bornes de la période affichée selon la vue (jour, semaine, ou grille du mois
// = du lundi de la semaine du 1er au dimanche de la semaine du dernier jour).
function periodeAgenda() {
  const ref = new Date(AGENDA_REF); ref.setHours(0, 0, 0, 0);
  if (AGENDA_VUE === "jour") return { debut: new Date(ref), fin: new Date(ref) };
  if (AGENDA_VUE === "semaine") {
    const lundi = lundiDeLaSemaine(ref);
    const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
    return { debut: lundi, fin: dim };
  }
  const premier = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const dernier = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const debut = lundiDeLaSemaine(premier);
  const fin = lundiDeLaSemaine(dernier); fin.setDate(fin.getDate() + 6);
  return { debut, fin };
}

// Jours affichés en vue jour (1) ou semaine (7), pour la grille horaire.
function joursAffiches() {
  if (AGENDA_VUE === "jour") { const d = new Date(AGENDA_REF); d.setHours(0, 0, 0, 0); return [d]; }
  const lundi = lundiDeLaSemaine(AGENDA_REF);
  const jours = [];
  for (let i = 0; i < 7; i++) { const d = new Date(lundi); d.setDate(lundi.getDate() + i); jours.push(d); }
  return jours;
}

// Décale la date de référence d'une unité de la vue active.
function decalerAgenda(sens) {
  const d = new Date(AGENDA_REF);
  if (AGENDA_VUE === "jour") d.setDate(d.getDate() + sens);
  else if (AGENDA_VUE === "semaine") d.setDate(d.getDate() + 7 * sens);
  else d.setMonth(d.getMonth() + sens);
  AGENDA_REF = d;
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

function majEnteteAgenda() {
  const span = document.getElementById("agenda-plage-dates");
  const { debut, fin } = periodeAgenda();
  if (AGENDA_VUE === "jour") {
    span.textContent = capitaliser(AGENDA_REF.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  } else if (AGENDA_VUE === "semaine") {
    const d = debut.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const f = fin.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    span.textContent = `Du ${d} au ${f}`;
  } else {
    span.textContent = capitaliser(AGENDA_REF.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  }
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
      <span class="agenda-entete-jour-nom">${nomCourtJour(d)}</span>
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
        <div class="agenda-evenement agenda-vis-${e.visibilite || "perso"}" title="${LIBELLES_VISIBILITE[e.visibilite] || "Perso"}${e.auteur && !e.mien ? " — ajouté par " + echapper(e.auteur) : ""}" style="top:${top}px;height:${hauteur}px;" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(e.titre)}, de ${e.heure_debut} à ${e.heure_fin}">
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
      ouvrirModaleEvenement({ id: e.id, jour: e.jour, heureDebut: e.heure_debut, heureFin: e.heure_fin, titre: e.titre, notes: e.notes, evenement: e });
    };
    el.addEventListener("click", ouvrir);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(); }
    });
  });
}

function rendreMoisAgenda() {
  const grille = document.getElementById("agenda-grille");
  const { debut, fin } = periodeAgenda();
  const moisCourant = AGENDA_REF.getMonth();
  const jours = []; const d = new Date(debut);
  while (d <= fin) { jours.push(new Date(d)); d.setDate(d.getDate() + 1); }

  const entete = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    .map((n) => `<div class="agenda-mois-entete-jour">${n}</div>`).join("");

  const cases = jours.map((jd) => {
    const iso = formaterDateISO(jd);
    const horsMois = jd.getMonth() !== moisCourant;
    const evs = CACHE_EVENEMENTS.filter((e) => e.jour === iso)
      .sort((a, b) => minutesDepuisMinuit(a.heure_debut) - minutesDepuisMinuit(b.heure_debut));
    const chips = evs.slice(0, 4).map((e) => `
      <div class="agenda-mois-evenement agenda-vis-${e.visibilite || "perso"}" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(e.titre)} à ${e.heure_debut}">
        <span class="agenda-mois-heure">${e.heure_debut}</span><span class="agenda-mois-evenement-titre">${echapper(e.titre)}</span>
      </div>`).join("");
    const plus = evs.length > 4 ? `<div class="agenda-mois-plus">+${evs.length - 4} autre${evs.length - 4 > 1 ? "s" : ""}</div>` : "";
    return `
      <div class="agenda-mois-case ${horsMois ? "agenda-mois-hors" : ""} ${estAujourdhui(jd) ? "agenda-mois-aujourdhui" : ""}" data-jour="${iso}" role="button" tabindex="0" aria-label="Ajouter un événement le ${iso}">
        <span class="agenda-mois-num">${jd.getDate()}</span>
        <div class="agenda-mois-evenements">${chips}${plus}</div>
      </div>`;
  }).join("");

  grille.innerHTML = `<div class="agenda-mois"><div class="agenda-mois-entete">${entete}</div><div class="agenda-mois-corps">${cases}</div></div>`;

  grille.querySelectorAll(".agenda-mois-evenement").forEach((el) => {
    const ouvrir = (ev) => {
      ev.stopPropagation();
      const e = CACHE_EVENEMENTS.find((x) => String(x.id) === el.dataset.id);
      if (!e) return;
      ouvrirModaleEvenement({ id: e.id, jour: e.jour, heureDebut: e.heure_debut, heureFin: e.heure_fin, titre: e.titre, notes: e.notes, evenement: e });
    };
    el.addEventListener("click", ouvrir);
    el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(ev); } });
  });
  grille.querySelectorAll(".agenda-mois-case").forEach((cell) => {
    const creer = () => ouvrirModaleEvenement({ jour: cell.dataset.jour });
    cell.addEventListener("click", creer);
    cell.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); creer(); } });
  });
}

async function chargerAgenda(reinitialiserDefilement) {
  majEnteteAgenda();
  afficherMessage("zone-message-agenda", "", null);
  const { debut, fin } = periodeAgenda();
  try {
    const data = await appelAPI(`/api/agenda?debut=${formaterDateISO(debut)}&fin=${formaterDateISO(fin)}`);
    CACHE_EVENEMENTS = data.evenements || [];
    if (data.droits) AGENDA_DROITS = data.droits;
  } catch (e) {
    afficherMessage("zone-message-agenda", "Impossible de charger votre agenda : " + e.message, "erreur");
    CACHE_EVENEMENTS = [];
  }
  const conteneur = document.getElementById("agenda-grille-conteneur");
  conteneur.classList.toggle("agenda-conteneur-mois", AGENDA_VUE === "mois");
  if (AGENDA_VUE === "mois") {
    rendreMoisAgenda();
    return;
  }
  const scrollAvant = conteneur ? conteneur.scrollTop : 0;
  rendreGrilleAgenda(joursAffiches());
  if (reinitialiserDefilement) defilerVersMaintenant();
  else if (conteneur) conteneur.scrollTop = scrollAvant;
}

document.getElementById("agenda-semaine-precedente").addEventListener("click", () => {
  decalerAgenda(-1);
  chargerAgenda(true);
});
document.getElementById("agenda-semaine-suivante").addEventListener("click", () => {
  decalerAgenda(1);
  chargerAgenda(true);
});
document.getElementById("agenda-aujourdhui").addEventListener("click", () => {
  AGENDA_REF = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  chargerAgenda(true);
});
document.querySelectorAll(".agenda-vue-bouton").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.vue === AGENDA_VUE) return;
    AGENDA_VUE = btn.dataset.vue;
    document.querySelectorAll(".agenda-vue-bouton").forEach((b) => b.classList.toggle("actif", b === btn));
    chargerAgenda(true);
  });
});
document.getElementById("agenda-nouvel-evenement").addEventListener("click", () => {
  // Par défaut sur aujourd'hui si la période affichée le contient, sinon sur
  // son premier jour (ex. un mois passé ou futur).
  const { debut, fin } = periodeAgenda();
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const dansPeriode = auj >= debut && auj <= fin;
  ouvrirModaleEvenement({ jour: formaterDateISO(dansPeriode ? auj : debut) });
});

// ---- modale « ajouter / modifier un événement » ---------------------------

// Droits renvoyés par GET /api/agenda (voir src/agenda.js) et fiches RH
// proposées pour un « Perso » destiné à quelqu'un d'autre (chargées une fois).
let AGENDA_DROITS = { cree: ["perso"], perso_autrui: false };
let AGENDA_PERSONNES = null;
const LIBELLES_VISIBILITE = { perso: "Perso", patrons: "Patrons", direction: "Direction", tous: "Tous" };

async function remplirChoixPour() {
  const select = document.getElementById("evenement-pour");
  if (AGENDA_PERSONNES === null) {
    try {
      AGENDA_PERSONNES = (await appelAPI("/api/agenda/personnes")).personnes || [];
    } catch (e) {
      AGENDA_PERSONNES = [];
    }
  }
  select.innerHTML = `<option value="">Moi (note privée)</option>` + AGENDA_PERSONNES
    .map((p) => `<option value="${p.id}"${p.discord ? "" : " disabled"}>${echapper(p.nom)}${p.discord ? "" : " — sans ID Discord dans sa fiche"}</option>`).join("");
  ameliorerSelect(select);
}

function majChampPour() {
  const edition = !!document.getElementById("evenement-id").value;
  const perso = document.getElementById("evenement-visibilite").value === "perso";
  document.getElementById("champ-evenement-pour").classList.toggle("cache", edition || !perso || !AGENDA_DROITS.perso_autrui);
}

function ouvrirModaleEvenement(options) {
  const o = options || {};
  const e = o.evenement || null;
  const estEdition = !!o.id;
  const modifiable = !e || e.modifiable;
  document.getElementById("titre-modale-evenement").textContent = !modifiable ? "Événement" : estEdition ? "Modifier l'événement" : "Nouvel événement";
  document.getElementById("evenement-id").value = o.id || "";
  document.getElementById("evenement-titre").value = o.titre || "";
  document.getElementById("evenement-jour").value = o.jour || formaterDateISO(new Date());
  document.getElementById("evenement-heure-debut").value = o.heureDebut || "09:00";
  document.getElementById("evenement-heure-fin").value = o.heureFin || "10:00";
  document.getElementById("evenement-notes").value = o.notes || "";

  // Visible par : ce que ce compte peut créer (+ la valeur actuelle en édition).
  const visibilite = e ? e.visibilite : "perso";
  const choix = [...new Set([...AGENDA_DROITS.cree, visibilite])];
  const selectVis = document.getElementById("evenement-visibilite");
  selectVis.innerHTML = choix.map((v) => `<option value="${v}">${LIBELLES_VISIBILITE[v] || v}</option>`).join("");
  selectVis.value = visibilite;
  ameliorerSelect(selectVis);
  document.getElementById("evenement-pour").value = "";
  if (!estEdition && AGENDA_DROITS.perso_autrui) remplirChoixPour();
  majChampPour();

  // Origine : qui l'a ajouté, pour qui, envoyé dans un ticket.
  const origine = document.getElementById("evenement-origine");
  const lignes = [];
  if (e && !e.mien && e.auteur) lignes.push(`Ajouté par ${e.auteur}.`);
  if (e && e.pour) lignes.push(`Pour ${e.pour}${e.envoye_discord ? " — envoyé dans son ticket Discord" : ""}.`);
  origine.textContent = lignes.join(" ");
  origine.classList.toggle("cache", !lignes.length);

  document.querySelectorAll("#formulaire-evenement input, #formulaire-evenement textarea, #formulaire-evenement select")
    .forEach((c) => { c.disabled = !modifiable; });
  document.getElementById("bouton-enregistrer-evenement").classList.toggle("cache", !modifiable);
  document.getElementById("bouton-supprimer-evenement").classList.toggle("cache", !estEdition || !modifiable);
  document.querySelectorAll("#formulaire-evenement .champ-erreur").forEach((p) => p.classList.add("cache"));
  afficherMessage("zone-message-modale-evenement", "", null);
  document.getElementById("modale-evenement").classList.remove("cache");
  if (modifiable) document.getElementById("evenement-titre").focus();
}

document.getElementById("evenement-visibilite").addEventListener("change", majChampPour);

function fermerModaleEvenement() {
  fermerSelectOuvert();
  document.getElementById("modale-evenement").classList.add("cache");
}

document.getElementById("fermer-modale-evenement").addEventListener("click", fermerModaleEvenement);
document.getElementById("bouton-annuler-evenement").addEventListener("click", fermerModaleEvenement);
document.getElementById("modale-evenement").addEventListener("click", (ev) => { if (ev.target.id === "modale-evenement") fermerModaleEvenement(); });
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !document.getElementById("modale-evenement").classList.contains("cache")) {
    ev.preventDefault();
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
    visibilite: document.getElementById("evenement-visibilite").value || "perso",
  };
  const pour = document.getElementById("evenement-pour").value;
  if (!id && payload.visibilite === "perso" && pour) payload.pour_employe_id = Number(pour);
  const bouton = document.querySelector('#formulaire-evenement button[type="submit"]');
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";
  let envoyeDiscord = false;
  try {
    if (id) {
      await appelAPI("/api/agenda?id=" + id, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      envoyeDiscord = !!(await appelAPI("/api/agenda", { method: "POST", body: JSON.stringify(payload) })).envoye_discord;
    }
    fermerModaleEvenement();
    await chargerAgenda(false);
    if (envoyeDiscord) afficherMessage("zone-message-agenda", "Événement créé ✓ — envoyé dans le ticket Discord de la personne.", "succes");
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
  const masquees = total - visibles;
  const coupsDeCoeur = liste.filter((b) => b.coup_de_coeur).length;
  const valeurTotale = liste.reduce((s, b) => s + (b.dispo_vente ? Number(b.prix) || 0 : 0), 0);
  const prixMoyen = total ? Math.round(valeurTotale / total) : 0;
  return { total, visibles, masquees, coupsDeCoeur, valeurTotale, prixMoyen };
}

function rendreStats() {
  const s = calculerStatsBiens(CACHE_BIENS);
  document.getElementById("admin-stats").innerHTML = `
    <div class="stat-carte">
      <span class="stat-icone stat-icone--or"><svg class="ico"><use href="#ico-home"></use></svg></span>
      <div><div class="stat-valeur">${s.total}</div><div class="stat-libelle">Annonces</div><div class="stat-sous-libelle">Total des biens</div></div>
    </div>
    <div class="stat-carte">
      <span class="stat-icone stat-icone--vert"><svg class="ico"><use href="#ico-eye"></use></svg></span>
      <div><div class="stat-valeur">${s.visibles}</div><div class="stat-libelle">Visibles</div><div class="stat-sous-libelle">En ligne sur le site</div></div>
    </div>
    <div class="stat-carte">
      <span class="stat-icone stat-icone--or"><svg class="ico"><use href="#ico-star"></use></svg></span>
      <div><div class="stat-valeur">${s.coupsDeCoeur}</div><div class="stat-libelle">Coups de cœur</div><div class="stat-sous-libelle">En vitrine sur l'accueil</div></div>
    </div>
    <div class="stat-carte">
      <span class="stat-icone stat-icone--mauve"><svg class="ico"><use href="#ico-eyeoff"></use></svg></span>
      <div><div class="stat-valeur">${s.masquees}</div><div class="stat-libelle">Masquée${s.masquees > 1 ? "s" : ""}</div><div class="stat-sous-libelle">Hors catalogue public</div></div>
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
  return `<div class="table-biens-vignette">${b.images && b.images[0] ? `<img src="${echapper(b.images[0])}" alt="">` : ""}</div>`;
}

function rendreTableBiens(liste) {
  const corps = document.getElementById("corps-table-biens");
  corps.innerHTML = liste.map((b) => `
    <tr class="${b.coup_de_coeur ? "ligne-coup-de-coeur" : ""}">
      <td class="cellule-vignette">${ligneVignetteHTML(b)}</td>
      <td><div class="table-biens-titre">${echapper(b.titre)}${b.coup_de_coeur ? ' <span class="table-biens-fav" title="Coup de cœur"><svg class="ico"><use href="#ico-star"></use></svg></span>' : ""}${b.standing ? ' <span class="puce puce-or">Exception</span>' : ""}</div>${b.coherence ? `<div class="table-biens-sous">${echapper(b.coherence)}</div>` : ""}</td>
      <td>${ETIQUETTES_CATEGORIE[b.categorie] || b.categorie}</td>
      <td>${echapper(b.sous_categorie || "—")}</td>
      <td>${b.dispo_vente ? `<div class="table-biens-prix">${formaterPrix(b.prix)}</div>` : ""}${b.dispo_location ? `<div class="table-biens-sous">${formaterPrix(b.prix_location)} /sem.</div>` : ""}</td>
      <td>${b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-masquee">Masquée</span>'}</td>
      <td><div class="actions-ligne">
        <button class="actions-icone" data-editer="${b.id}" title="Modifier" aria-label="Modifier"><svg class="ico"><use href="#ico-pencil"></use></svg></button>
        <button class="actions-icone actions-icone--danger" data-supprimer="${b.id}" title="Supprimer" aria-label="Supprimer"><svg class="ico"><use href="#ico-trash"></use></svg></button>
      </div></td>
    </tr>`).join("");
  corps.querySelectorAll("[data-editer]").forEach((btn) => btn.addEventListener("click", () => ouvrirModaleBien(Number(btn.dataset.editer))));
  corps.querySelectorAll("[data-supprimer]").forEach((btn) => btn.addEventListener("click", () => supprimerBienDepuisListe(Number(btn.dataset.supprimer))));
}

function rendreGrilleBiens(liste) {
  const conteneur = document.getElementById("vue-grille-biens");
  conteneur.innerHTML = liste.map((b) => {
    const meta = [b.sous_categorie, ETIQUETTES_CATEGORIE[b.categorie] || b.categorie, b.coherence].filter(Boolean).map(echapper).join(" · ");
    const prix = b.dispo_vente ? formaterPrix(b.prix) : (b.dispo_location ? formaterPrix(b.prix_location) + " /sem." : "—");
    const loc = b.dispo_vente && b.dispo_location ? `<span class="carte-admin-bien-loc">· ${formaterPrix(b.prix_location)} /sem.</span>` : "";
    return `
    <article class="carte-admin-bien">
      <div class="carte-admin-bien-visuel">
        ${b.images && b.images[0] ? `<img src="${echapper(b.images[0])}" alt="" loading="lazy">` : ""}
        ${b.coup_de_coeur ? '<span class="carte-admin-bien-fav"><svg class="ico"><use href="#ico-star"></use></svg> Coup de cœur</span>' : ""}
        <span class="carte-admin-bien-categorie">${b.standing ? "Exclusif" : (ETIQUETTES_CATEGORIE[b.categorie] || b.categorie)}</span>
      </div>
      <div class="carte-admin-bien-corps">
        <div class="carte-admin-bien-entete">
          <div><h3 class="carte-admin-bien-titre">${echapper(b.titre)}</h3><div class="carte-admin-bien-meta">${meta}</div></div>
          ${b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-masquee">Masquée</span>'}
        </div>
        <div class="carte-admin-bien-pied">
          <span class="carte-admin-bien-prix">${prix}${loc}</span>
          <div class="carte-admin-bien-actions">
            <button class="actions-icone actions-icone--rond" data-editer="${b.id}" title="Modifier" aria-label="Modifier"><svg class="ico"><use href="#ico-pencil"></use></svg></button>
            <button class="actions-icone actions-icone--rond actions-icone--danger" data-supprimer="${b.id}" title="Supprimer" aria-label="Supprimer"><svg class="ico"><use href="#ico-trash"></use></svg></button>
          </div>
        </div>
      </div>
    </article>`;
  }).join("");
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

// ---- photos : import vers le stockage externe, aperçu ----------------------

// Formats sources acceptés ; le navigateur les convertit ensuite en JPEG.
const TYPES_PHOTO_ACCEPTES = ["image/jpeg", "image/png", "image/webp"];

// Réduit et compresse la photo dans le navigateur et renvoie un Blob JPEG,
// envoyé tel quel (en binaire) au serveur. Le fond est peint en blanc pour
// qu'un PNG transparent ne devienne pas noir une fois converti.
function redimensionnerImage(fichier, largeurMax = 1280, qualite = 0.72) {
  return new Promise((resolve, reject) => {
    const typeConnu = TYPES_PHOTO_ACCEPTES.includes(fichier.type) || (!fichier.type && /\.(jpe?g|png|webp)$/i.test(fichier.name));
    if (!typeConnu) return reject(new Error(`« ${fichier.name} » : formats acceptés JPG, PNG ou WEBP.`));
    if (fichier.size > 15 * 1024 * 1024) return reject(new Error(`« ${fichier.name} » dépasse 15 Mo.`));
    const adresse = URL.createObjectURL(fichier);
    const image = new Image();
    image.onerror = () => {
      URL.revokeObjectURL(adresse);
      reject(new Error(`Fichier image invalide : « ${fichier.name} ».`));
    };
    image.onload = () => {
      URL.revokeObjectURL(adresse);
      let width = image.naturalWidth;
      let height = image.naturalHeight;
      if (width > largeurMax) {
        height = Math.round(height * (largeurMax / width));
        width = largeurMax;
      }
      const toile = document.createElement("canvas");
      toile.width = width;
      toile.height = height;
      const contexte = toile.getContext("2d");
      contexte.fillStyle = "#ffffff";
      contexte.fillRect(0, 0, width, height);
      contexte.drawImage(image, 0, 0, width, height);
      toile.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(`Impossible de préparer « ${fichier.name} ».`))),
        "image/jpeg",
        qualite
      );
    };
    image.src = adresse;
  });
}

// Envoie une photo préparée à /api/biens/photo ou /api/profil/photo, qui la
// contrôle, la transmet à storage.fbfa.fr et renvoie son URL publique.
async function envoyerPhoto(route, blob, signal) {
  try {
    return await appelAPI(route, {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    if (!e.status) throw new Error("Connexion au serveur perdue pendant l'envoi de la photo. Réessayez.");
    if (e.status === 413 && !(e.corps && e.corps.erreur)) throw new Error("Photo trop volumineuse.");
    throw e;
  }
}

// Nombre maximum de photos par annonce (la même limite est vérifiée côté serveur, src/index.js).
const MAX_PHOTOS_BIEN = 10;

// Envois de la modale annonce. EDITION_BIEN change à chaque ouverture ET
// fermeture : un envoi qui se termine après coup (modale fermée, ou rouverte
// sur une autre annonce) le voit et n'ajoute rien. Le fichier déjà reçu par
// le serveur reste alors temporaire et sera nettoyé automatiquement.
let EDITION_BIEN = 0;
let TRANSFERTS_BIEN = []; // { nom, fichier, controleur, enCours } — traités un par un, dans l'ordre
let ERREURS_IMAGES_BIEN = []; // gardées visibles jusqu'à la prochaine ouverture de la modale
let FILE_BIEN_ACTIVE = false;
let SAUVEGARDE_BIEN_EN_COURS = false;

function afficherErreursImagesBien() {
  const zone = document.getElementById("erreur-bien-images");
  const lignes = ERREURS_IMAGES_BIEN.slice(-5);
  if (IMAGES_BIEN.length + TRANSFERTS_BIEN.length >= MAX_PHOTOS_BIEN) {
    lignes.push(`Limite de ${MAX_PHOTOS_BIEN} photos atteinte. Retirez une photo pour en ajouter une autre.`);
  }
  zone.style.whiteSpace = "pre-line";
  zone.textContent = lignes.join("\n");
  zone.classList.toggle("cache", !lignes.length);
}

function ajouterErreurImagesBien(texte) {
  ERREURS_IMAGES_BIEN.push(texte);
  afficherErreursImagesBien();
}

function creerBoutonVignette(libelle, surClic) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "bien-images-retirer";
  bouton.textContent = "✕";
  bouton.setAttribute("aria-label", libelle);
  bouton.title = libelle;
  bouton.addEventListener("click", surClic);
  return bouton;
}

function redessinerImagesBien() {
  const grille = document.getElementById("bien-images-grille");
  grille.textContent = "";
  IMAGES_BIEN.forEach((src, i) => {
    const vignette = document.createElement("div");
    vignette.className = "bien-images-vignette";
    const img = document.createElement("img");
    img.src = src; // propriété DOM : une URL ne peut pas injecter de HTML
    img.alt = `Photo ${i + 1} du bien`;
    vignette.appendChild(img);
    if (i === 0) {
      const principale = document.createElement("span");
      principale.className = "bien-images-principale";
      principale.textContent = "Principale";
      vignette.appendChild(principale);
    }
    const retirer = creerBoutonVignette("Retirer cette photo", () => {
      if (SAUVEGARDE_BIEN_EN_COURS) return;
      IMAGES_BIEN.splice(i, 1);
      redessinerImagesBien();
    });
    retirer.disabled = SAUVEGARDE_BIEN_EN_COURS;
    vignette.appendChild(retirer);
    grille.appendChild(vignette);
  });
  TRANSFERTS_BIEN.forEach((t) => {
    const vignette = document.createElement("div");
    vignette.className = "bien-images-vignette";
    vignette.setAttribute("aria-busy", "true");
    const texte = document.createElement("div");
    texte.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;text-align:center;font-size:0.68rem;line-height:1.25;overflow:hidden;";
    const etat = document.createElement("strong");
    etat.textContent = t.enCours ? "⏳ Envoi…" : "En attente";
    const nom = document.createElement("span");
    nom.textContent = t.nom;
    nom.style.cssText = "opacity:0.7;word-break:break-all;";
    texte.append(etat, nom);
    vignette.appendChild(texte);
    vignette.appendChild(creerBoutonVignette("Annuler l'envoi de cette photo", () => annulerTransfertBien(t)));
    grille.appendChild(vignette);
  });

  const n = TRANSFERTS_BIEN.length;
  document.getElementById("bien-images-compteur").textContent =
    IMAGES_BIEN.length + " / " + MAX_PHOTOS_BIEN + (n ? ` · ${n} en cours d'envoi` : "");
  const bloque = IMAGES_BIEN.length + n >= MAX_PHOTOS_BIEN || SAUVEGARDE_BIEN_EN_COURS;
  document.getElementById("bouton-parcourir").disabled = bloque || !SESSION.stockagePhotos;
  if (!SAUVEGARDE_BIEN_EN_COURS) {
    const enregistrer = document.querySelector('#formulaire-bien button[type="submit"]');
    enregistrer.disabled = n > 0;
    enregistrer.title = n > 0 ? "Attendez la fin de l'envoi des photos" : "";
  }
  afficherErreursImagesBien();
}

function annulerTransfertBien(t) {
  t.controleur.abort();
  TRANSFERTS_BIEN = TRANSFERTS_BIEN.filter((x) => x !== t);
  redessinerImagesBien();
}

// À l'ouverture et à la fermeture de la modale : annule les envois en cours.
function reinitialiserTransfertsBien() {
  EDITION_BIEN++;
  TRANSFERTS_BIEN.forEach((t) => t.controleur.abort());
  TRANSFERTS_BIEN = [];
  ERREURS_IMAGES_BIEN = [];
}

// File d'envoi : un seul fichier transféré à la fois, les autres attendent.
async function traiterFileBien() {
  if (FILE_BIEN_ACTIVE) return;
  FILE_BIEN_ACTIVE = true;
  const edition = EDITION_BIEN;
  try {
    while (edition === EDITION_BIEN && TRANSFERTS_BIEN.length) {
      const t = TRANSFERTS_BIEN[0];
      t.enCours = true;
      redessinerImagesBien();
      try {
        const blob = await redimensionnerImage(t.fichier);
        if (t.controleur.signal.aborted) continue;
        const { url } = await envoyerPhoto("/api/biens/photo", blob, t.controleur.signal);
        if (edition !== EDITION_BIEN || t.controleur.signal.aborted) continue;
        if (IMAGES_BIEN.length < MAX_PHOTOS_BIEN) IMAGES_BIEN.push(url);
      } catch (e) {
        if (edition === EDITION_BIEN && e.name !== "AbortError") {
          ajouterErreurImagesBien(e.message.includes(`« ${t.nom} »`) ? e.message : `« ${t.nom} » : ${e.message}`);
        }
      } finally {
        if (edition === EDITION_BIEN) {
          TRANSFERTS_BIEN = TRANSFERTS_BIEN.filter((x) => x !== t);
          redessinerImagesBien();
        }
      }
    }
  } finally {
    FILE_BIEN_ACTIVE = false;
    // La modale a été rouverte pendant un envoi annulé : on traite la nouvelle file.
    if (edition !== EDITION_BIEN && TRANSFERTS_BIEN.length) traiterFileBien();
  }
}

document.getElementById("bouton-parcourir").addEventListener("click", () => {
  document.getElementById("bien-image-fichier").click();
});

// Chaque photo est redimensionnée/compressée dans le navigateur, puis
// envoyée à /api/biens/photo qui renvoie une URL publique courte — c'est
// cette URL qui est gardée dans IMAGES_BIEN, jamais l'image elle-même.
document.getElementById("bien-image-fichier").addEventListener("change", (ev) => {
  const fichiers = Array.from(ev.target.files || []);
  ev.target.value = ""; // permet de resélectionner le même fichier plus tard si besoin
  if (!fichiers.length || SAUVEGARDE_BIEN_EN_COURS) return;
  const place = MAX_PHOTOS_BIEN - IMAGES_BIEN.length - TRANSFERTS_BIEN.length;
  if (place <= 0) { afficherErreursImagesBien(); return; }
  if (fichiers.length > place) {
    ajouterErreurImagesBien(`Seules les ${place} premières photos sélectionnées ont été retenues (limite de ${MAX_PHOTOS_BIEN}).`);
  }
  fichiers.slice(0, place).forEach((fichier) => {
    TRANSFERTS_BIEN.push({ nom: fichier.name, fichier, controleur: new AbortController(), enCours: false });
  });
  redessinerImagesBien();
  traiterFileBien();
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
  reinitialiserTransfertsBien();
  IMAGES_BIEN = bien && bien.images ? bien.images.slice(0, MAX_PHOTOS_BIEN) : [];
  redessinerImagesBien();
  document.getElementById("modale-bien").classList.remove("cache");
  ETAT_INITIAL_BIEN = etatFormulaireBien();
}

function fermerModaleBien() {
  fermerSelectOuvert();
  reinitialiserTransfertsBien();
  redessinerImagesBien();
  document.getElementById("modale-bien").classList.add("cache");
}

async function demanderFermetureModaleBien() {
  if (SAUVEGARDE_BIEN_EN_COURS) return;
  if (TRANSFERTS_BIEN.length) {
    const ok = await confirmerAction("Des photos sont encore en cours d'envoi : fermer maintenant annule ces envois, et les modifications non enregistrées seront perdues.", "Fermer sans enregistrer ?");
    if (!ok) return;
  } else if (etatFormulaireBien() !== ETAT_INITIAL_BIEN) {
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
    ev.preventDefault();
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
  if (TRANSFERTS_BIEN.length) {
    afficherMessage("zone-message-modale-bien", "Attendez la fin de l'envoi des photos avant d'enregistrer.", "erreur");
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
  SAUVEGARDE_BIEN_EN_COURS = true; // bloque imports et retraits pendant l'envoi du formulaire
  redessinerImagesBien();
  const edition = EDITION_BIEN;
  try {
    if (id) {
      await appelAPI("/api/biens?id=" + id, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await appelAPI("/api/biens", { method: "POST", body: JSON.stringify(payload) });
    }
    ETAT_INITIAL_BIEN = etatFormulaireBien();
    afficherMessage("zone-message-modale-bien", id ? "Bien mis à jour ✓" : "Bien ajouté avec succès ✓", "succes");
    await chargerTableBiens();
    setTimeout(() => { if (edition === EDITION_BIEN) fermerModaleBien(); }, 800);
  } catch (e) {
    afficherMessage("zone-message-modale-bien", e.message, "erreur");
  } finally {
    SAUVEGARDE_BIEN_EN_COURS = false;
    boutonEnregistrer.textContent = texteInitial;
    redessinerImagesBien(); // réactive le bouton (sauf envoi de photo en cours)
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
        <td style="text-align:right;"><input type="number" class="table-input" min="0" step="100" style="text-align:right;max-width:130px;" data-taux-horaire="${echapper(g.grade)}" value="${g.tauxHoraire || 0}" aria-label="Taux horaire de ${echapper(g.grade)}"></td>
      </tr>`).join("");
    cablerRemunerationGrades();

    rendreBaremesPrimes("vente", r.baremesVentes);
    rendreBaremesPrimes("location", r.baremesLocations);
  } catch (e) {
    document.getElementById("corps-table-remuneration-grades").innerHTML = `<tr><td colspan="6">Erreur de chargement.</td></tr>`;
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
  corps.querySelectorAll("[data-taux-horaire]").forEach((el) => {
    el.addEventListener("change", () => {
      const val = el.value === "" ? 0 : Number(el.value);
      if (!isFinite(val) || val < 0) {
        afficherMessage("zone-message-parametres", "Le taux horaire doit être un nombre positif.", "erreur");
        chargerRemuneration();
        return;
      }
      modifierGradeRemuneration(el.dataset.tauxHoraire, { tauxHoraire: val });
    });
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
      ligneResumeDot("Montant total des salaires (fixe + paliers)" + (semaine ? "" : " <span class=\"champ-aide\">(choisissez une semaine)</span>"), val(r.montantTotalPrimes)),
      ligneResumeDot("Bénéfice après salaires", val(r.beneficeApresPrimes)),
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
    // montant copié comme un vrai nombre (« 1 200 $ » -> 1200) pour que le tableur puisse calculer dessus
    if (cellules.length === 4) lignes.push([cellules[0], cellules[1], cellules[2].replace(/[^\d-]/g, "")].join("\t"));
  });
  if (await copierTexte(lignes.join("\n"))) {
    afficherMessage("zone-message-dot", "Tableau copié ✓ Vous pouvez le coller dans Excel/Google Sheets.", "succes");
  } else {
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
  if (!semaine) { DOT_SALARIES = []; corps.innerHTML = `<tr><td colspan="8" class="champ-aide">Choisissez une semaine.</td></tr>`; return; }
  try {
    const r = await appelAPI(`/api/comptabilite/dot/salaries?semaine=${encodeURIComponent(semaine)}`);
    const agents = r.agents || [];
    DOT_SALARIES = agents;
    corps.innerHTML = agents.length
      ? agents.map((a) => `<tr>
            <td>${echapper(a.identiteRp || a.identite)}${a.horsReferentiel ? ' <span class="champ-aide" title="Présent dans le relevé Tablettes, sans fiche dans le référentiel agents (onglet Ressources humaines)">*</span>' : ""}</td>
            <td>${echapper(a.grade)}</td>
            <td>${formaterArgentStats(a.run)}</td>
            <td>${formaterArgentStats(a.facture)}</td>
            <td>${formaterArgentStats(a.vente)}</td>
            <td><strong>${formaterArgentStats(a.caTotalRealise)}</strong></td>
            <td><strong>${formaterArgentStats(a.salaireTotal)}</strong></td>
            <td>${formaterArgentStats(0)}</td>
          </tr>`).join("")
      : `<tr><td colspan="8" class="champ-aide">Aucune vente/location cette semaine-là.</td></tr>`;
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="8" class="champ-aide">Erreur : ${echapper(e.message)}</td></tr>`;
  }
}

// « Copier le tableau » : copie au format tableur (colonnes séparées par des
// tabulations) — se colle proprement dans Excel/Google Sheets :
//   - les montants sont copiés comme de VRAIS nombres (pas « 74 970 $ » en
//     texte), pour que le document puisse calculer dessus ;
//   - la colonne CA TOTAL REALISE est copiée sous forme de FORMULE (=RUN+FACTURE
//     +VENTE, même colonnes que le document DOT : C, D, E) et non comme un
//     chiffre figé, comme dans le document original. Le numéro de la première
//     ligne où l'on colle se règle à côté du bouton (2 par défaut = juste sous
//     les titres).
let DOT_SALARIES = []; // dernier tableau chargé (données brutes, pas le HTML)
function formuleCaTotal(numeroLigne) {
  return `=C${numeroLigne}+D${numeroLigne}+E${numeroLigne}`;
}
document.getElementById("bouton-copier-salaries").addEventListener("click", async () => {
  if (!DOT_SALARIES.length) {
    afficherMessage("zone-message-dot", "Rien à copier : choisissez une semaine avec des salariés.", "erreur");
    return;
  }
  const champLigne = document.getElementById("dot-copie-premiere-ligne");
  let premiereLigne = champLigne ? parseInt(champLigne.value, 10) : 2;
  if (!Number.isInteger(premiereLigne) || premiereLigne < 1) premiereLigne = 2;
  const nombre = (v) => String(Math.round(Number(v) || 0));
  const lignes = DOT_SALARIES.map((a, i) => [
    a.identiteRp || a.identite,
    a.grade,
    nombre(a.run),
    nombre(a.facture),
    nombre(a.vente),
    formuleCaTotal(premiereLigne + i),
    nombre(a.salaireTotal),
    "0",
  ].join("\t"));
  if (await copierTexte(lignes.join("\n"))) {
    afficherMessage("zone-message-dot", `Tableau copié ✓ (${lignes.length} salariés, sans la ligne de titres). Collez-le en ligne ${premiereLigne}, colonne A, du document DOT : la colonne CA TOTAL REALISE arrive en formule.`, "succes");
  } else {
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

// `avecSuppression` : ajoute une colonne avec une croix par ligne (sauf la
// ligne Total) pour retirer un membre du relevé — utilisée seulement sur le
// tableau enregistré, pas sur l'aperçu de la modale d'import.
function rendreTableCompta(colonnes, lignes, avecSuppression) {
  const numerique = colonnes.map((_, i) => comptaColonneEstNumerique(lignes, i));
  const thead = `<thead><tr>${colonnes
    .map((c, i) => `<th${numerique[i] ? ' style="text-align:right;"' : ""}>${echapper(c)}</th>`)
    .join("")}${avecSuppression ? '<th class="compta-col-actions" aria-label="Actions"></th>' : ""}</tr></thead>`;
  const tbody = `<tbody>${lignes
    .map((ligne, index) => {
      const total = comptaLigneEstTotal(ligne);
      const cellules = colonnes
        .map((_, i) => `<td${numerique[i] ? ' style="text-align:right;"' : ""}>${echapper(ligne[i] || "")}</td>`)
        .join("");
      const action = avecSuppression
        ? `<td class="compta-col-actions">${total ? "" : `<button type="button" class="actions-icone actions-icone--danger compta-supprimer-ligne" data-index="${index}" data-nom="${echapper(ligne[0] || "")}" title="Retirer ${echapper(ligne[0] || "cette ligne")} du relevé" aria-label="Retirer ${echapper(ligne[0] || "cette ligne")} du relevé">✕</button>`}</td>`
        : "";
      return `<tr${total ? ' class="ligne-total"' : ""}>${cellules}${action}</tr>`;
    })
    .join("")}</tbody>`;
  return thead + tbody;
}

async function supprimerLigneTablette(index, nom) {
  const ok = await confirmerAction(`« ${nom} » sera retiré du relevé Tablettes. Les totaux (CA brut, DOT) seront recalculés sans cette ligne.`, "Retirer ce membre du relevé ?");
  if (!ok) return;
  try {
    await appelAPI(`/api/comptabilite/tablettes/lignes/${index}`, { method: "DELETE", body: JSON.stringify({ nom }) });
    afficherMessage("zone-message-tablette", `« ${nom} » retiré du relevé ✓`, "succes");
    chargerTablette();
  } catch (e) {
    afficherMessage("zone-message-tablette", "Impossible de retirer cette ligne : " + e.message, "erreur");
  }
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

// Paie à l'heure (voir src/paie-horaire.js) : une ligne par membre d'un grade
// payé à l'heure, avec le calcul écrit en toutes lettres.
function afficherPaieHoraire(p) {
  const bloc = document.getElementById("compta-paie-horaire");
  if (!p || !p.lignes || !p.lignes.length) { bloc.classList.add("cache"); return; }
  bloc.classList.remove("cache");
  document.getElementById("compta-paie-horaire-aide").textContent = p.colonneHeures
    ? `Heures lues dans la colonne « ${p.colonneHeures} » du relevé, payées au taux horaire du grade (Comptabilité → Paramètres), en plus des paliers. Inclus dans le salaire de la DOT.`
    : "Le relevé n'a pas de colonne « Heures de service » : impossible de calculer la paie à l'heure.";
  const heures = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  document.getElementById("corps-table-paie-horaire").innerHTML = p.lignes.map((l) => `<tr>
      <td>${echapper(l.nom)}</td>
      <td>${echapper(l.grade)}${l.gradeSource === "releve" ? ' <span class="champ-aide" title="Sans fiche RH à ce nom : grade lu dans la colonne Rang du relevé">*</span>' : ""}</td>
      <td style="text-align:right;">${l.lisible ? heures(l.minutes) : `<span class="puce puce-off" title="Durée illisible : comptée 0 $">${echapper(l.heures || "vide")}</span>`}</td>
      <td style="text-align:right;">${formaterArgentStats(l.taux)} / h</td>
      <td class="champ-aide">${l.lisible ? `${l.minutes} min ÷ 60 × ${formaterArgentStats(l.taux)}` : "durée illisible"}</td>
      <td style="text-align:right;"><strong>${formaterArgentStats(l.montant)}</strong></td>
    </tr>`).join("") + `<tr class="ligne-total"><td colspan="5">Total paie à l'heure</td><td style="text-align:right;"><strong>${formaterArgentStats(p.total)}</strong></td></tr>`;
}

async function chargerTablette() {
  afficherMessage("zone-message-tablette", "", null);
  try {
    const reponse = await appelAPI("/api/comptabilite/tablettes");
    const vide = document.getElementById("compta-tablette-vide");
    const resultat = document.getElementById("compta-tablette-resultat");
    const boutonReset = document.getElementById("bouton-reinitialiser-tablette");
    if (!reponse.import) {
      afficherPaieHoraire(null);
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
    const table = document.getElementById("table-tablette");
    table.innerHTML = rendreTableCompta(reponse.import.colonnes, reponse.import.lignes, true);
    table.querySelectorAll(".compta-supprimer-ligne").forEach((btn) => {
      btn.addEventListener("click", () => supprimerLigneTablette(Number(btn.dataset.index), btn.dataset.nom));
    });
    afficherPaieHoraire(reponse.paie_horaire);
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


// Affiche la vraie photo de profil Discord de la personne (récupérée à sa
// dernière connexion) si on l'a, sinon retombe sur le rond avec ses initiales.
function avatarHtml(m) {
  if (m.discord_avatar) {
    return `<img src="${echapper(m.discord_avatar)}" alt="" class="admin-avatar-img" loading="lazy">`;
  }
  return `<span class="admin-avatar">${echapper(initialesPseudo(m.pseudo))}</span>`;
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
  EDITEUR_PHOTO_PROFIL_COMPTE.charger(m.photo || "");
  majCompteurBioProfilCompte();
  afficherMessage("zone-message-modale-profil-compte", "", null);
  document.getElementById("modale-profil-compte").classList.remove("cache");
}

function fermerModaleProfilCompte() {
  // Annule un envoi de photo en cours : terminé après coup, il ne pourra pas
  // s'afficher sur le profil d'un autre membre ouvert entre-temps.
  EDITEUR_PHOTO_PROFIL_COMPTE.fermer();
  document.getElementById("modale-profil-compte").classList.add("cache");
}

const EDITEUR_PHOTO_PROFIL_COMPTE = creerEditeurPhotoProfil({
  idApercu: "profil-compte-photo-apercu",
  idBoutonChanger: "bouton-profil-compte-photo",
  idBoutonRetirer: "bouton-profil-compte-photo-retirer",
  idErreur: "erreur-profil-compte-photo",
  bouton: () => document.querySelector('#formulaire-profil-compte button[type="submit"]'),
  pseudo: () => {
    const m = CACHE_MEMBRES.find((x) => x.id === Number(document.getElementById("profil-compte-id").value));
    return m ? m.pseudo : "?";
  },
});

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

document.getElementById("profil-compte-photo-fichier").addEventListener("change", (ev) => {
  const fichier = (ev.target.files || [])[0];
  ev.target.value = "";
  if (fichier) EDITEUR_PHOTO_PROFIL_COMPTE.importer(fichier);
});

document.getElementById("bouton-profil-compte-photo-retirer").addEventListener("click", () => EDITEUR_PHOTO_PROFIL_COMPTE.retirer());

document.getElementById("formulaire-profil-compte").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  afficherMessage("zone-message-modale-profil-compte", "", null);
  if (EDITEUR_PHOTO_PROFIL_COMPTE.enCours()) {
    afficherMessage("zone-message-modale-profil-compte", "Attendez la fin de l'envoi de la photo avant d'enregistrer.", "erreur");
    return;
  }
  const id = document.getElementById("profil-compte-id").value;
  const bouton = document.querySelector('#formulaire-profil-compte button[type="submit"]');
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Enregistrement…";
  EDITEUR_PHOTO_PROFIL_COMPTE.debutEnregistrement();
  try {
    await appelAPI("/api/membres?id=" + id, {
      method: "PATCH",
      body: JSON.stringify({
        poste: document.getElementById("profil-compte-poste").value.trim(),
        specialite: document.getElementById("profil-compte-specialite").value.trim(),
        bio: document.getElementById("profil-compte-bio").value.trim(),
        photo: EDITEUR_PHOTO_PROFIL_COMPTE.valeur(),
      }),
    });
    EDITEUR_PHOTO_PROFIL_COMPTE.finEnregistrement();
    fermerModaleProfilCompte();
    chargerTableMembres();
  } catch (e) {
    afficherMessage("zone-message-modale-profil-compte", e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
    EDITEUR_PHOTO_PROFIL_COMPTE.finEnregistrement();
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
  return `<span class="messagerie-avatar">${echapper(initialesPseudo(c.pseudo))}</span>`;
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


// Formatage court "jj/mm/aaaa hh:mm" d'une date ISO/SQL — utilisé un peu
// partout dans l'admin (horodatages divers).
function formaterDateAdmin(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return echapper(iso);
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

// ---------------------------------------------------------------------------
// Paramètres -> Liens du site (WebMap, cohérences, Google Sheets, registre,
// Discord, boutique...). Rien n'est écrit dans le code : la liste des champs
// vient de GET /api/reglages, et l'enregistrement s'applique aussitôt.
// Patron, Co Patron et Développeur web seulement.
// ---------------------------------------------------------------------------

const TITRES_GROUPES_REGLAGES = {
  prive: "Espace agents et serveur",
  services: "Membres en service (salon Discord des prises et fins de service)",
  agenda: "Agenda (rôles Discord et tickets)",
  public: "Pages publiques",
};

function afficherReglagesLiens(r) {
  const champ = (d) => {
    const origine = d.regle ? "" : '<span class="puce puce-or">non réglé</span>';
    // Selon le type du réglage (voir REGLAGES dans src/reglages.js) : lien,
    // identifiant Discord, ou nombre.
    const attributs = d.type === "snowflakes"
      ? `type="text" maxlength="500" placeholder="ex. 1234567890123456789 9876543210987654321"`
      : d.type === "snowflake"
      ? `type="text" inputmode="numeric" maxlength="21" placeholder="ex. 1234567890123456789"`
      : d.type === "entier"
        ? `type="number" min="${d.min}" max="${d.max}" step="1" placeholder="${d.defaut}" style="max-width:140px;"`
        : `type="url" maxlength="500" placeholder="https://…"`;
    return `<div class="champ">
      <label for="reglage-${d.cle}">${echapper(d.libelle)} ${origine}</label>
      <input ${attributs} id="reglage-${d.cle}" data-reglage="${d.cle}" value="${echapper(d.valeur)}" autocomplete="off" spellcheck="false">
      <p class="champ-aide">${echapper(d.aide)}</p>
    </div>`;
  };
  document.getElementById("reglages-champs").innerHTML = Object.keys(TITRES_GROUPES_REGLAGES).map((groupe) => {
    const champs = r.reglages.filter((d) => d.groupe === groupe);
    return champs.length ? `<p class="champ-aide" style="margin:14px 0 8px;"><strong>${TITRES_GROUPES_REGLAGES[groupe]}</strong></p>${champs.map(champ).join("")}` : "";
  }).join("");
}

async function chargerReglagesLiens() {
  const bloc = document.getElementById("reglages-liens");
  bloc.classList.toggle("cache", !SESSION.peutReglerLiens);
  if (!SESSION.peutReglerLiens) return;
  afficherMessage("zone-message-reglages", "", null);
  try {
    afficherReglagesLiens(await appelAPI("/api/reglages"));
  } catch (e) {
    afficherMessage("zone-message-reglages", "Impossible de charger les liens : " + e.message, "erreur");
  }
  chargerEtatServices();
}

const LIBELLES_ANOMALIES_SERVICE = {
  fin_sans_debut: "fin sans début lu",
  debut_en_double: "nouvelle prise de service sans fin de la précédente",
  cloture_auto: "fermé automatiquement",
};

// Lecture du salon des services : dernière passe, erreur, anomalies récentes.
async function chargerEtatServices() {
  const zone = document.getElementById("etat-services");
  try {
    const r = await appelAPI("/api/services/etat");
    const lignes = [];
    if (!r.jeton_present) lignes.push("⚠️ Membres en service : DISCORD_BOT_TOKEN absent du .env du serveur — le salon ne peut pas être lu.");
    else if (!r.salon_regle) lignes.push("Membres en service : réglez l'ID du salon ci-dessus pour activer l'encadré « En service ».");
    else if (!r.etat || !r.etat.derniere_lecture) lignes.push("Membres en service : première lecture du salon dans moins d'une minute.");
    else if (r.etat.statut === "erreur") lignes.push(`⚠️ Lecture du salon des services : ${echapper(r.etat.erreur)} (${echapper(formaterHorodatageParis(r.etat.derniere_lecture))}).`);
    else lignes.push(`✓ Salon des services lu le ${echapper(formaterHorodatageParis(r.etat.derniere_lecture))} : ${r.etat.nb_lus} nouveau(x) message(s), ${r.etat.nb_reconnus} prise(s)/fin(s) de service reconnue(s). ${r.en_service} personne(s) en service. Clôture automatique après ${r.cloture_heures} h.`);
    if (r.anomalies && r.anomalies.length) {
      lignes.push("Derniers cas particuliers : " + r.anomalies.map((a) =>
        `${echapper(a.employe_nom || "?")} (${echapper(LIBELLES_ANOMALIES_SERVICE[a.anomalie] || a.anomalie)}, début ${echapper(formaterHorodatageParis(a.debut))})`).join(" ; ") + ".");
    }
    zone.innerHTML = lignes.map((l) => `<p style="margin:0 0 6px;">${l}</p>`).join("");
  } catch (e) {
    zone.textContent = "";
  }
}

document.getElementById("formulaire-reglages").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bouton = document.getElementById("reglages-enregistrer");
  const corps = {};
  document.querySelectorAll("[data-reglage]").forEach((c) => { corps[c.dataset.reglage] = c.value.trim(); });
  bouton.disabled = true;
  try {
    afficherReglagesLiens(await appelAPI("/api/reglages", { method: "PUT", body: JSON.stringify(corps) }));
    afficherMessage("zone-message-reglages", "Réglages enregistrés ✓ — ils sont déjà en service.", "succes");
    chargerEtatServices();
    chargerEnService();
    // Le lien du tableur a pu changer : l'état de la synchronisation aussi.
    chargerSyncSheet();
  } catch (err) {
    afficherMessage("zone-message-reglages", err.message, "erreur");
  } finally {
    bouton.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Paramètres -> Apparence (images de la marque, voir src/apparence.js).
// Direction ; vérifié aussi côté serveur. L'image est envoyée telle quelle,
// sans passer par redimensionnerImage() : un logo PNG garde sa transparence.
// ---------------------------------------------------------------------------

let APPARENCE_CIBLE = null; // clé de l'image en cours de remplacement

function afficherApparence(r) {
  const bloque = !r.stockage_configure;
  if (bloque) {
    afficherMessage("zone-message-apparence", "Le stockage des images n'est pas configuré sur le serveur : les images d'origine restent en place et ne peuvent pas être remplacées pour l'instant.", "erreur");
  }
  document.getElementById("apparence-cartes").innerHTML = r.images.map((i) => {
    const version = encodeURIComponent(i.maj || "origine");
    const etat = i.personnalisee
      ? `<span class="puce puce-or">Remplacée</span> <span class="champ-aide">le ${echapper(formaterHorodatageParis(i.maj))}${i.maj_par ? " par " + echapper(i.maj_par) : ""}</span>`
      : `<span class="puce puce-masquee">Image d'origine</span>`;
    return `<div class="apparence-carte">
      <div class="apparence-apercu"><img src="${echapper(i.apercu)}?v=${version}" alt="${echapper(i.libelle)}" loading="lazy"></div>
      <div class="apparence-infos">
        <strong>${echapper(i.libelle)}</strong>
        <p class="champ-aide" style="margin:4px 0;">${echapper(i.aide)} Taille d'origine : ${i.largeur} × ${i.hauteur} px.</p>
        <div>${etat}</div>
        <div class="apparence-actions">
          <button type="button" class="btn btn-or btn-petit" data-apparence-remplacer="${echapper(i.cle)}" ${bloque ? "disabled" : ""}>Remplacer…</button>
          ${i.personnalisee ? `<button type="button" class="btn btn-fantome btn-petit" data-apparence-retablir="${echapper(i.cle)}">Rétablir l'origine</button>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
}

// « 2026-10-08 14:05:00 » (UTC, format de la base) -> date et heure de Paris.
function formaterHorodatageParis(texte) {
  const d = new Date(String(texte || "").replace(" ", "T") + "Z");
  return isNaN(d) ? String(texte || "") : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
}

async function chargerApparence() {
  const bloc = document.getElementById("reglages-apparence");
  bloc.classList.toggle("cache", !SESSION.direction);
  if (!SESSION.direction) return;
  afficherMessage("zone-message-apparence", "", null);
  try {
    afficherApparence(await appelAPI("/api/apparence"));
  } catch (e) {
    afficherMessage("zone-message-apparence", "Impossible de charger les images : " + e.message, "erreur");
  }
}

document.getElementById("apparence-cartes").addEventListener("click", async (e) => {
  const remplacer = e.target.closest("[data-apparence-remplacer]");
  if (remplacer) {
    APPARENCE_CIBLE = remplacer.dataset.apparenceRemplacer;
    const champ = document.getElementById("apparence-fichier");
    champ.value = "";
    champ.click();
    return;
  }
  const retablir = e.target.closest("[data-apparence-retablir]");
  if (!retablir) return;
  if (!(await confirmerAction("Remettre l'image d'origine du site à la place de l'image actuelle ?", "Rétablir l'image d'origine"))) return;
  retablir.disabled = true;
  try {
    const r = await appelAPI(`/api/apparence/image?cle=${encodeURIComponent(retablir.dataset.apparenceRetablir)}`, { method: "DELETE" });
    afficherApparence(r);
    afficherMessage("zone-message-apparence", "Image d'origine rétablie ✓", "succes");
  } catch (err) {
    retablir.disabled = false;
    afficherMessage("zone-message-apparence", err.message, "erreur");
  }
});

document.getElementById("apparence-fichier").addEventListener("change", async (e) => {
  const fichier = e.target.files && e.target.files[0];
  const cle = APPARENCE_CIBLE;
  if (!fichier || !cle) return;
  if (!TYPES_PHOTO_ACCEPTES.includes(fichier.type)) {
    afficherMessage("zone-message-apparence", `« ${fichier.name} » : formats acceptés PNG, JPG ou WEBP.`, "erreur");
    return;
  }
  document.querySelectorAll("[data-apparence-remplacer], [data-apparence-retablir]").forEach((b) => { b.disabled = true; });
  const bouton = document.querySelector(`[data-apparence-remplacer="${cle}"]`);
  if (bouton) bouton.textContent = "Envoi…";
  afficherMessage("zone-message-apparence", "", null);
  try {
    const r = await appelAPI(`/api/apparence/image?cle=${encodeURIComponent(cle)}`, {
      method: "POST",
      headers: { "Content-Type": fichier.type },
      body: fichier,
    });
    afficherApparence(r);
    afficherMessage("zone-message-apparence", r.avertissement || "Image remplacée ✓ — elle est déjà en ligne.", r.avertissement ? "erreur" : "succes");
  } catch (err) {
    chargerApparence();
    afficherMessage("zone-message-apparence", err.status ? err.message : "Connexion au serveur perdue pendant l'envoi. Réessayez.", "erreur");
  }
});

// ---------------------------------------------------------------------------
// Paramètres -> Hiérarchie des grades (rangs, voir src/grades.js). Patron,
// Co Patron et Développeur web seulement ; vérifié aussi côté serveur.
// ---------------------------------------------------------------------------

function afficherRangsGrades(r) {
  document.getElementById("grades-corps").innerHTML = r.grades.map((g) => `<tr>
      <td><span class="puce" style="background:${g.couleur}26;color:${g.couleur};">${echapper(g.nom)}</span></td>
      <td><input type="number" min="1" max="99" step="1" required value="${g.rang}" data-rang-grade="${echapper(g.nom)}" aria-label="Rang de ${echapper(g.nom)}" style="width:80px;"></td>
    </tr>`).join("");
}

async function chargerRangsGrades() {
  const bloc = document.getElementById("reglages-grades");
  bloc.classList.toggle("cache", !SESSION.peutReglerLiens);
  if (!SESSION.peutReglerLiens) return;
  afficherMessage("zone-message-grades", "", null);
  try {
    afficherRangsGrades(await appelAPI("/api/reglages/grades"));
  } catch (e) {
    afficherMessage("zone-message-grades", "Impossible de charger la hiérarchie : " + e.message, "erreur");
  }
}

document.getElementById("formulaire-grades").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rangs = {};
  document.querySelectorAll("[data-rang-grade]").forEach((c) => { rangs[c.dataset.rangGrade] = Number(c.value); });
  const bouton = document.getElementById("grades-enregistrer");
  bouton.disabled = true;
  try {
    const r = await appelAPI("/api/reglages/grades", { method: "PUT", body: JSON.stringify({ rangs }) });
    afficherRangsGrades(r);
    // Les menus et les tris de l'espace agents suivent aussitôt le nouvel ordre.
    definirGrades(r.grades);
    construireListesGrades();
    afficherMessage("zone-message-grades", "Hiérarchie enregistrée ✓ — elle s'applique tout de suite.", "succes");
  } catch (err) {
    afficherMessage("zone-message-grades", err.message, "erreur");
  } finally {
    bouton.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Paramètres -> Synchronisation Google Sheets ("Mon profil" -> ventes/
// locations/primes). Le Sheet fournit seulement les compteurs (colonnes L/M
// -> nb_ventes/nb_locations) ; les montants de primes sont recalculés côté
// serveur avec les barèmes de Comptabilité -> Paramètres, jamais lus depuis
// le Sheet. Associer une ligne à un compte écrit son nom (colonne D) sur
// membres.nom_sheet, pour que les prochaines synchros la retrouvent seules.
// ---------------------------------------------------------------------------

async function chargerSyncSheet() {
  const corps = document.getElementById("corps-table-sync-sheet");
  const etatLigne = document.getElementById("sync-sheet-etat");
  afficherMessage("zone-message-sync-sheet", "", null);
  corps.innerHTML = `<tr><td colspan="5">Chargement…</td></tr>`;
  try {
    const r = await appelAPI("/api/sync-sheet/etat");

    // Sans GOOGLE_SHEET_ID, le bouton ne peut rien faire : on le désactive et
    // on le dit une fois, plutôt que de laisser cliquer vers un « échec ».
    const nonConfigure = r.configure === false;
    const bouton = document.getElementById("bouton-synchroniser-sheet");
    if (bouton) {
      bouton.disabled = nonConfigure;
      bouton.title = nonConfigure ? "Réglez d’abord le lien du Google Sheets dans « Liens du site »" : "";
    }

    if (nonConfigure) {
      etatLigne.textContent = "Synchronisation en attente : réglez le lien du Google Sheets dans « Liens du site », plus haut.";
    } else if (!r.etat || r.etat.statut === "desactive") {
      etatLigne.textContent = "Pas encore synchronisé.";
    } else if (r.etat.statut === "erreur") {
      etatLigne.textContent = `Dernière tentative en échec (${formaterDateAdmin(r.etat.derniere_sync)}) : ${r.etat.erreur}`;
    } else if (!r.etat.nb_lignes) {
      // Lecture réussie mais aucun agent trouvé : presque toujours le mauvais onglet du classeur.
      etatLigne.textContent = `Dernière synchro : ${formaterDateAdmin(r.etat.derniere_sync)} — le classeur a été lu, mais aucune ligne d’agent n’y a été trouvée. Le lien réglé pointe sans doute sur le mauvais onglet : ouvrez l’onglet du récapitulatif des ventes dans Google Sheets, copiez l’adresse de la barre du navigateur (elle se termine par « gid=… ») et collez-la dans « Liens du site ».`;
    } else {
      etatLigne.textContent = `Dernière synchro : ${formaterDateAdmin(r.etat.derniere_sync)} — ${r.etat.nb_lignes} ligne(s) lue(s), ${r.etat.nb_apparies} reconnue(s) (compte du site retrouvé).`;
    }

    if (!r.lignes.length) {
      corps.innerHTML = nonConfigure
        ? `<tr><td colspan="5">Aucune ligne : le lien du Google Sheets n'est pas encore réglé.</td></tr>`
        : `<tr><td colspan="5">Aucune ligne lue pour le moment — cliquez sur « Synchroniser maintenant ».</td></tr>`;
      return;
    }
    corps.innerHTML = r.lignes.map((l) => `
      <tr>
        <td>${echapper(l.nom_sheet)}</td>
        <td>${echapper(l.grade_sheet || "—")}</td>
        <td style="text-align:right;">${l.nb_ventes}</td>
        <td style="text-align:right;">${l.nb_locations}</td>
        <td>${l.membre_pseudo ? echapper(l.membre_pseudo) : '<span class="champ-aide" title="Aucun compte du site ne porte ce nom : créez ou corrigez la fiche agent (identité RP) dans l’onglet RH.">— aucun compte reconnu —</span>'}</td>
      </tr>`).join("");
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="5">Erreur de chargement : ${echapper(e.message)}</td></tr>`;
  }
}

document.getElementById("bouton-synchroniser-sheet")?.addEventListener("click", async (ev) => {
  const bouton = ev.currentTarget;
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = "Synchronisation…";
  try {
    const r = await appelAPI("/api/sync-sheet/synchroniser", { method: "POST" });
    // RH fait foi : la synchro ne crée aucune fiche, elle signale les lignes sans fiche.
    const sansFiche = (r.etat && r.etat.sansFicheRh) || 0;
    const detail = sansFiche ? ` — ${sansFiche} ligne(s) sans fiche RH : voir RH → À rattacher.` : "";
    afficherMessage("zone-message-sync-sheet", "Synchronisation terminée ✓" + detail, "succes");
    chargerSyncSheet();
  } catch (e) {
    afficherMessage("zone-message-sync-sheet", "Échec de la synchronisation : " + e.message, "erreur");
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
  }
});
