/* GESTION — agenda : événements personnels et partagés (Patrons, Direction, Tous) selon les rôles Discord. Ce que
   chacun voit, crée et modifie est décidé par le serveur (server/src/entreprise/routes/agenda.ts) ; la page ne fait
   qu'afficher les droits qu'il renvoie.
   Vues : jour, semaine (grille horaire), mois ; sur téléphone, une vue liste s'impose (bandeau de la semaine et
   rendez-vous du jour choisi), une grille de 7 colonnes n'y étant pas lisible. */

let AGENDA_VUE_CHOISIE = "semaine"; // "jour" | "semaine" | "mois" : le choix de la personne sur écran large
// Le site vit à l’heure de Paris (serveur RP français) : « aujourd’hui » et la ligne de l’heure actuelle en dépendent,
// quel que soit le fuseau réglé sur l’ordinateur de la personne.
const PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function maintenantParis() {
  const p = Object.fromEntries(PARIS.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
const aujourdhuiParis = () => new Date(maintenantParis().iso + "T00:00");
let AGENDA_REF = aujourdhuiParis(); // jour affiché ou choisi
let CACHE_EVENEMENTS = [];
const AGENDA_HEURE_HAUTEUR = 52; // hauteur en pixels d'une heure dans la grille
const AGENDA_TELEPHONE = matchMedia("(max-width: 760px)");
const agendaVue = () => (AGENDA_TELEPHONE.matches ? "liste" : AGENDA_VUE_CHOISIE);

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
const nomCourtJour = d => d.toLocaleDateString("fr-FR", { weekday: "short" });
const jourLong = d => capitaliser(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));

// Bornes de la période chargée : un jour, une semaine (aussi pour la liste du téléphone), ou la grille du mois
// (du lundi de la semaine du 1er au dimanche de la semaine du dernier jour).
function periodeAgenda() {
  const ref = new Date(AGENDA_REF); ref.setHours(0, 0, 0, 0);
  const vue = agendaVue();
  if (vue === "jour") return { debut: new Date(ref), fin: new Date(ref) };
  if (vue === "semaine" || vue === "liste") {
    const lundi = lundiDeLaSemaine(ref);
    const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
    return { debut: lundi, fin: dim };
  }
  const debut = lundiDeLaSemaine(new Date(ref.getFullYear(), ref.getMonth(), 1));
  const fin = lundiDeLaSemaine(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)); fin.setDate(fin.getDate() + 6);
  return { debut, fin };
}

function joursDeLaPeriode() {
  const { debut, fin } = periodeAgenda();
  const jours = []; const d = new Date(debut);
  while (d <= fin) { jours.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return jours;
}

// Décale le jour de référence d'une unité de la vue (la liste avance d'une semaine, en gardant le jour choisi).
function decalerAgenda(sens) {
  const d = new Date(AGENDA_REF);
  const vue = agendaVue();
  if (vue === "jour") d.setDate(d.getDate() + sens);
  else if (vue === "semaine" || vue === "liste") d.setDate(d.getDate() + 7 * sens);
  else { d.setDate(1); d.setMonth(d.getMonth() + sens); }
  AGENDA_REF = d;
}

const estAujourdhui = date => formaterDateISO(date) === maintenantParis().iso;

function minutesDepuisMinuit(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const heureActuelleHHMM = () => maintenantParis().hhmm;

const evenementsDu = iso => CACHE_EVENEMENTS.filter(e => e.jour === iso)
  .sort((a, b) => minutesDepuisMinuit(a.heure_debut) - minutesDepuisMinuit(b.heure_debut));

function majEnteteAgenda() {
  const span = document.getElementById("agenda-plage-dates");
  const { debut, fin } = periodeAgenda();
  const vue = agendaVue();
  // le bouton de retour à la période actuelle nomme ce qu'il affiche ; les flèches aussi (lecteurs d'écran)
  const nomPeriode = { jour: ["Aujourd’hui", "Jour précédent", "Jour suivant"], semaine: ["Cette semaine", "Semaine précédente", "Semaine suivante"],
    mois: ["Ce mois-ci", "Mois précédent", "Mois suivant"], liste: ["Aujourd’hui", "Période précédente", "Période suivante"] }[vue];
  document.getElementById("agenda-aujourdhui").textContent = nomPeriode[0];
  document.getElementById("agenda-semaine-precedente").setAttribute("aria-label", nomPeriode[1]);
  document.getElementById("agenda-semaine-suivante").setAttribute("aria-label", nomPeriode[2]);
  const mois = d => d.toLocaleDateString("fr-FR", { month: "long" });
  if (vue === "jour") span.textContent = capitaliser(AGENDA_REF.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  else if (vue === "mois" || vue === "liste") span.textContent = capitaliser(AGENDA_REF.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  else span.textContent = debut.getMonth() === fin.getMonth()
    ? `Du ${debut.getDate()} au ${fin.getDate()} ${mois(fin)} ${fin.getFullYear()}`
    : `Du ${debut.getDate()} ${mois(debut)} au ${fin.getDate()} ${mois(fin)} ${fin.getFullYear()}`;
  document.querySelectorAll(".agenda-vue-bouton").forEach(b => {
    const actif = b.dataset.vue === AGENDA_VUE_CHOISIE;
    b.classList.toggle("actif", actif);
    b.setAttribute("aria-pressed", String(actif));
  });
}

function defilerVersMaintenant() {
  const conteneur = document.getElementById("agenda-grille-conteneur");
  const minutes = Math.max(minutesDepuisMinuit(heureActuelleHHMM()) - 90, 7 * 60); // un peu avant maintenant, 7 h au plus tôt
  conteneur.scrollTop = (minutes / 60) * AGENDA_HEURE_HAUTEUR;
}

// Événements qui se chevauchent : côte à côte plutôt que l'un sur l'autre. Chaque groupe d'événements liés par un
// chevauchement est réparti en colonnes ; chacun reçoit sa colonne et le nombre de colonnes de son groupe.
function disposerEvenements(evts) {
  const places = evts.map(e => ({ e, debut: minutesDepuisMinuit(e.heure_debut), fin: Math.max(minutesDepuisMinuit(e.heure_fin), minutesDepuisMinuit(e.heure_debut) + 15) }));
  let groupe = [], finGroupe = -1;
  const fermer = () => {
    const colonnes = [];
    for (const p of groupe) {
      let c = colonnes.findIndex(fin => fin <= p.debut);
      if (c < 0) { c = colonnes.length; colonnes.push(0); }
      colonnes[c] = p.fin; p.col = c;
    }
    for (const p of groupe) p.nbCols = colonnes.length;
  };
  for (const p of places) {
    if (groupe.length && p.debut >= finGroupe) { fermer(); groupe = []; finGroupe = -1; }
    groupe.push(p); finGroupe = Math.max(finGroupe, p.fin);
  }
  if (groupe.length) fermer();
  return places;
}

const descriptionEvenement = e => `${e.titre}, de ${e.heure_debut} à ${e.heure_fin}, visible par ${LIBELLES_VISIBILITE[visibiliteDe(e)]}`;

// ---- vues jour et semaine : grille horaire ----
function rendreGrilleAgenda(jours) {
  const grille = document.getElementById("agenda-grille");
  grille.style.setProperty("--agenda-jours", jours.length);
  grille.style.setProperty("--agenda-heure", AGENDA_HEURE_HAUTEUR + "px");

  const entete = jours.map(d => `
    <button type="button" class="agenda-jour-entete${estAujourdhui(d) ? " aujourdhui" : ""}" data-aller-jour="${formaterDateISO(d)}"${jours.length > 1 ? ` aria-label="Voir la journée du ${jourLong(d)}"` : " disabled"}>
      <span class="agenda-jour-nom">${nomCourtJour(d)}</span><span class="agenda-jour-num">${d.getDate()}</span>
    </button>`).join("");

  let heures = "";
  for (let h = 1; h < 24; h++) heures += `<span style="top:${h * AGENDA_HEURE_HAUTEUR}px">${String(h).padStart(2, "0")}:00</span>`;

  const colonnes = jours.map(d => {
    const iso = formaterDateISO(d);
    let cases = "";
    for (let h = 0; h < 24; h++) {
      const debut = String(h).padStart(2, "0") + ":00";
      const fin = h === 23 ? "23:59" : String(h + 1).padStart(2, "0") + ":00";
      cases += `<button type="button" class="agenda-case" data-jour="${iso}" data-heure-debut="${debut}" data-heure-fin="${fin}" aria-label="Ajouter un événement le ${jourLong(d)} à ${debut}"></button>`;
    }
    const evts = disposerEvenements(evenementsDu(iso)).map(p => {
      const top = (p.debut / 60) * AGENDA_HEURE_HAUTEUR;
      const hauteur = Math.max(((p.fin - p.debut) / 60) * AGENDA_HEURE_HAUTEUR - 2, 22);
      const largeur = 100 / p.nbCols;
      return `
        <div class="agenda-evenement agenda-vis-${visibiliteDe(p.e)}${hauteur < 44 ? " court" : ""}" data-id="${p.e.id}" tabindex="0" role="button"
             style="top:${top}px;height:${hauteur}px;left:calc(${p.col * largeur}% + 2px);width:calc(${largeur}% - 4px)" aria-label="${echapper(descriptionEvenement(p.e))}">
          <span class="agenda-evenement-titre">${echapper(p.e.titre)}</span>
          <span class="agenda-evenement-heure">${p.e.heure_debut} – ${p.e.heure_fin}</span>
        </div>`;
    }).join("");
    const maintenant = estAujourdhui(d)
      ? `<div class="agenda-maintenant" style="top:${(minutesDepuisMinuit(heureActuelleHHMM()) / 60) * AGENDA_HEURE_HAUTEUR}px"></div>` : "";
    return `<div class="agenda-colonne${estAujourdhui(d) ? " aujourdhui" : ""}">${cases}${evts}${maintenant}</div>`;
  }).join("");

  grille.className = "agenda-grille agenda-horaire";
  grille.innerHTML = `
    <div class="agenda-horaire-entete"><span class="agenda-coin"></span>${entete}</div>
    <div class="agenda-horaire-corps"><div class="agenda-heures" aria-hidden="true">${heures}</div>${colonnes}</div>`;
}

// ---- vue mois ----
function rendreMoisAgenda() {
  const grille = document.getElementById("agenda-grille");
  const moisCourant = AGENDA_REF.getMonth();
  const nomsJours = joursDeLaPeriode().slice(0, 7).map(d => `<span>${nomCourtJour(d)}</span>`).join("");
  const cases = joursDeLaPeriode().map(d => {
    const iso = formaterDateISO(d);
    const evs = evenementsDu(iso);
    const puces = evs.slice(0, 3).map(e => `
      <span class="agenda-mois-evenement agenda-vis-${visibiliteDe(e)}" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(descriptionEvenement(e))}">
        <span class="agenda-mois-heure">${e.heure_debut}</span> ${echapper(e.titre)}
      </span>`).join("");
    const plus = evs.length > 3 ? `<button type="button" class="agenda-mois-plus" data-aller-jour="${iso}">${evs.length - 3} de plus</button>` : "";
    return `
      <div class="agenda-mois-case${d.getMonth() !== moisCourant ? " hors-mois" : ""}${estAujourdhui(d) ? " aujourdhui" : ""}" data-jour="${iso}">
        <button type="button" class="agenda-mois-num" data-aller-jour="${iso}" aria-label="Voir la journée du ${jourLong(d)}">${d.getDate()}</button>
        <div class="agenda-mois-evenements">${puces}${plus}</div>
        <button type="button" class="agenda-mois-ajouter" data-ajouter-jour="${iso}" aria-label="Ajouter un événement le ${jourLong(d)}"><svg class="ico" aria-hidden="true"><use href="#ico-plus"></use></svg></button>
      </div>`;
  }).join("");
  grille.className = "agenda-grille agenda-mois";
  grille.innerHTML = `<div class="agenda-mois-entete">${nomsJours}</div><div class="agenda-mois-corps">${cases}</div>`;
}

// ---- vue liste (téléphone) : bandeau de la semaine, rendez-vous du jour choisi ----
function rendreListeAgenda() {
  const grille = document.getElementById("agenda-grille");
  const choisi = formaterDateISO(AGENDA_REF);
  const bandeau = joursDeLaPeriode().map(d => {
    const iso = formaterDateISO(d);
    const points = evenementsDu(iso).slice(0, 3).map(e => `<i class="agenda-vis-${visibiliteDe(e)}"></i>`).join("");
    const nb = evenementsDu(iso).length;
    return `<button type="button" class="agenda-bandeau-jour${iso === choisi ? " actif" : ""}${estAujourdhui(d) ? " aujourdhui" : ""}" data-choisir-jour="${iso}"
        aria-pressed="${iso === choisi}" aria-label="${jourLong(d)}${nb ? `, ${nb} événement${nb > 1 ? "s" : ""}` : ""}">
      <span class="agenda-jour-nom">${nomCourtJour(d)}</span><span class="agenda-jour-num">${d.getDate()}</span><span class="agenda-points">${points}</span>
    </button>`;
  }).join("");
  const evs = evenementsDu(choisi);
  const liste = evs.length
    ? `<ul class="agenda-liste-evenements">${evs.map(e => `
        <li><div class="agenda-carte agenda-vis-${visibiliteDe(e)}" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(descriptionEvenement(e))}">
          <span class="agenda-carte-heures">${e.heure_debut}<small>${e.heure_fin}</small></span>
          <span class="agenda-carte-texte"><strong>${echapper(e.titre)}</strong><small>${LIBELLES_VISIBILITE[visibiliteDe(e)]}${e.auteur && !e.mien ? ` · ajouté par ${echapper(e.auteur)}` : ""}</small></span>
        </div></li>`).join("")}</ul>`
    : `<p class="agenda-vide">Rien de prévu ce jour-là.</p>`;
  grille.className = "agenda-grille agenda-liste";
  grille.innerHTML = `
    <div class="agenda-bandeau" role="group" aria-label="Jours de la semaine">${bandeau}</div>
    <h2 class="agenda-liste-titre">${jourLong(AGENDA_REF)}</h2>
    ${liste}
    <button type="button" class="btn btn-fantome agenda-liste-ajouter" data-ajouter-jour="${choisi}"><svg class="ico" aria-hidden="true"><use href="#ico-plus"></use></svg> Ajouter un événement</button>`;
}

function rendreAgenda(reinitialiserDefilement) {
  const vue = agendaVue();
  const conteneur = document.getElementById("agenda-grille-conteneur");
  conteneur.dataset.vue = vue;
  if (vue === "mois") return rendreMoisAgenda();
  if (vue === "liste") return rendreListeAgenda();
  const scrollAvant = conteneur.scrollTop;
  rendreGrilleAgenda(joursDeLaPeriode());
  if (reinitialiserDefilement) defilerVersMaintenant();
  else conteneur.scrollTop = scrollAvant;
}

async function chargerAgenda(reinitialiserDefilement) {
  majEnteteAgenda();
  gestion.message("zone-message-agenda", "");
  const { debut, fin } = periodeAgenda();
  try {
    const data = await socle.api(`/api/agenda?debut=${formaterDateISO(debut)}&fin=${formaterDateISO(fin)}`);
    CACHE_EVENEMENTS = data.evenements || [];
    if (data.droits) AGENDA_DROITS = data.droits;
  } catch (e) {
    gestion.message("zone-message-agenda", "Impossible de charger l’agenda : " + e.message);
    CACHE_EVENEMENTS = [];
  }
  rendreAgenda(reinitialiserDefilement);
}

// Un seul écouteur pour la grille, quelle que soit la vue (elle est redessinée à chaque changement).
const grilleAgenda = document.getElementById("agenda-grille");
function ouvrirEvenementExistant(id) {
  const e = CACHE_EVENEMENTS.find(x => String(x.id) === String(id));
  if (e) ouvrirModaleEvenement({ id: e.id, jour: e.jour, heureDebut: e.heure_debut, heureFin: e.heure_fin, titre: e.titre, notes: e.notes, evenement: e });
}
grilleAgenda.addEventListener("click", ev => {
  const cible = ev.target.closest("[data-id], [data-aller-jour], [data-choisir-jour], [data-ajouter-jour], .agenda-case");
  if (!cible) return;
  if (cible.dataset.id) return ouvrirEvenementExistant(cible.dataset.id);
  if (cible.dataset.allerJour) { AGENDA_REF = new Date(cible.dataset.allerJour + "T00:00"); AGENDA_VUE_CHOISIE = "jour"; return chargerAgenda(true); }
  if (cible.dataset.choisirJour) { AGENDA_REF = new Date(cible.dataset.choisirJour + "T00:00"); majEnteteAgenda(); return rendreAgenda(false); }
  if (cible.dataset.ajouterJour) return ouvrirModaleEvenement({ jour: cible.dataset.ajouterJour });
  ouvrirModaleEvenement({ jour: cible.dataset.jour, heureDebut: cible.dataset.heureDebut, heureFin: cible.dataset.heureFin });
});
grilleAgenda.addEventListener("keydown", ev => {
  const el = ev.target.closest("[data-id][role=button]");
  if (el && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ouvrirEvenementExistant(el.dataset.id); }
});

document.getElementById("agenda-semaine-precedente").addEventListener("click", () => { decalerAgenda(-1); chargerAgenda(true); });
document.getElementById("agenda-semaine-suivante").addEventListener("click", () => { decalerAgenda(1); chargerAgenda(true); });
document.getElementById("agenda-aujourdhui").addEventListener("click", () => {
  AGENDA_REF = aujourdhuiParis();
  chargerAgenda(true);
});
document.querySelectorAll(".agenda-vue-bouton").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.vue === AGENDA_VUE_CHOISIE) return;
    AGENDA_VUE_CHOISIE = btn.dataset.vue;
    chargerAgenda(true);
  });
});
AGENDA_TELEPHONE.addEventListener("change", () => chargerAgenda(true));
document.getElementById("agenda-nouvel-evenement").addEventListener("click", () => {
  // le jour choisi (liste, jour), sinon aujourd'hui s'il est dans la période affichée, sinon son premier jour
  const { debut, fin } = periodeAgenda();
  const auj = aujourdhuiParis();
  const vue = agendaVue();
  const jour = vue === "liste" || vue === "jour" ? AGENDA_REF : auj >= debut && auj <= fin ? auj : debut;
  ouvrirModaleEvenement({ jour: formaterDateISO(jour) });
});

// ---- fenêtre « ajouter / modifier un événement » ----

// droits renvoyés par GET /api/agenda ; fiches RH proposées pour un « Perso » destiné à quelqu'un d'autre (lues une fois)
let AGENDA_DROITS = { cree: ["perso"], perso_autrui: false };
let AGENDA_PERSONNES = null;
const LIBELLES_VISIBILITE = { perso: "Perso", patrons: "Patrons", direction: "Direction", tous: "Tous" };
// mêmes couleurs que la grille (agenda.css), pour la pastille de chaque choix du menu « Visible par »
const COULEURS_VISIBILITE = { perso: "#d4b26a", patrons: "#ef7f73", direction: "#a99cf5", tous: "#5fd39a" };
// valeur venue du serveur, réduite aux visibilités connues avant d'entrer dans une classe ou un texte
const visibiliteDe = e => (Object.hasOwn(LIBELLES_VISIBILITE, e.visibilite) ? e.visibilite : "perso");

async function remplirChoixPour() {
  const select = document.getElementById("evenement-pour");
  if (AGENDA_PERSONNES === null) {
    try { AGENDA_PERSONNES = (await socle.api("/api/agenda/personnes")).personnes || []; }
    catch { AGENDA_PERSONNES = []; }
  }
  select.innerHTML = `<option value="">Moi</option>` + AGENDA_PERSONNES
    .map(p => `<option value="${Number(p.id)}"${p.discord ? "" : " disabled"}>${echapper(p.nom)}${p.discord ? "" : " (sans ID Discord dans sa fiche)"}</option>`).join("");
  ameliorerSelect(select);
}

function majChampPour() {
  const edition = !!document.getElementById("evenement-id").value;
  const perso = document.getElementById("evenement-visibilite").value === "perso";
  document.getElementById("champ-evenement-pour").classList.toggle("cache", edition || !perso || !AGENDA_DROITS.perso_autrui);
}

let OUVREUR_EVENEMENT = null;
function ouvrirModaleEvenement(options) {
  const o = options || {};
  const e = o.evenement || null;
  const estEdition = !!o.id;
  const modifiable = !e || e.modifiable;
  OUVREUR_EVENEMENT = document.activeElement;
  document.getElementById("titre-modale-evenement").textContent = !modifiable ? "Événement" : estEdition ? "Modifier l’événement" : "Nouvel événement";
  document.getElementById("evenement-id").value = o.id || "";
  document.getElementById("evenement-titre").value = o.titre || "";
  document.getElementById("evenement-jour").value = o.jour || maintenantParis().iso;
  document.getElementById("evenement-heure-debut").value = o.heureDebut || "09:00";
  document.getElementById("evenement-heure-fin").value = o.heureFin || "10:00";
  document.getElementById("evenement-notes").value = o.notes || "";

  // Visible par : ce que ce compte peut créer (+ la valeur actuelle en édition)
  const visibilite = e ? visibiliteDe(e) : "perso";
  const choix = [...new Set([...AGENDA_DROITS.cree.filter(v => Object.hasOwn(LIBELLES_VISIBILITE, v)), visibilite])];
  const selectVis = document.getElementById("evenement-visibilite");
  selectVis.innerHTML = choix.map(v => `<option value="${v}">${LIBELLES_VISIBILITE[v]}</option>`).join("");
  selectVis.value = visibilite;
  ameliorerSelect(selectVis, v => COULEURS_VISIBILITE[v] || COULEURS_VISIBILITE.perso);
  document.getElementById("evenement-pour").innerHTML = '<option value="">Moi</option>';
  if (!estEdition && AGENDA_DROITS.perso_autrui) remplirChoixPour();
  majChampPour();

  // origine : qui l'a ajouté, pour qui, envoyé dans un ticket
  const origine = document.getElementById("evenement-origine");
  const lignes = [];
  if (e && !e.mien && e.auteur) lignes.push(`Ajouté par ${e.auteur}.`);
  if (e && e.pour) lignes.push(`Pour ${e.pour}${e.envoye_discord ? ", envoyé dans son ticket Discord" : ""}.`);
  origine.textContent = lignes.join(" ");
  origine.classList.toggle("cache", !lignes.length);

  document.querySelectorAll("#formulaire-evenement input, #formulaire-evenement textarea, #formulaire-evenement select")
    .forEach(c => { c.disabled = !modifiable; });
  document.getElementById("bouton-enregistrer-evenement").classList.toggle("cache", !modifiable);
  document.getElementById("bouton-annuler-evenement").textContent = modifiable ? "Annuler" : "Fermer";
  document.getElementById("bouton-supprimer-evenement").classList.toggle("cache", !estEdition || !modifiable);
  document.querySelectorAll("#formulaire-evenement .champ-erreur").forEach(p => p.classList.add("cache"));
  gestion.message("zone-message-modale-evenement", "");
  document.getElementById("modale-evenement").classList.remove("cache");
  (modifiable ? document.getElementById("evenement-titre") : document.getElementById("bouton-annuler-evenement")).focus();
}

document.getElementById("evenement-visibilite").addEventListener("change", majChampPour);
champDateFr(document.getElementById("evenement-jour"));
champHeureFr(document.getElementById("evenement-heure-debut"));
champHeureFr(document.getElementById("evenement-heure-fin"));

function fermerModaleEvenement() {
  fermerSelectOuvert();
  document.getElementById("modale-evenement").classList.add("cache");
  if (OUVREUR_EVENEMENT?.isConnected) OUVREUR_EVENEMENT.focus();   // le focus revient d'où l'on venait
}

document.getElementById("fermer-modale-evenement").addEventListener("click", fermerModaleEvenement);
document.getElementById("bouton-annuler-evenement").addEventListener("click", fermerModaleEvenement);
document.getElementById("modale-evenement").addEventListener("click", ev => { if (ev.target.id === "modale-evenement") fermerModaleEvenement(); });
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !document.getElementById("modale-evenement").classList.contains("cache") && !document.querySelector("[role=alertdialog]")) {
    ev.preventDefault();
    fermerModaleEvenement();
  }
});

document.getElementById("formulaire-evenement").addEventListener("submit", async ev => {
  ev.preventDefault();
  gestion.message("zone-message-modale-evenement", "");
  document.querySelectorAll("#formulaire-evenement .champ-erreur").forEach(p => p.classList.add("cache"));

  const titre = document.getElementById("evenement-titre").value.trim();
  const jour = document.getElementById("evenement-jour").value;
  const heureDebut = document.getElementById("evenement-heure-debut").value;
  const heureFin = document.getElementById("evenement-heure-fin").value;
  let premierChamp = null;
  if (!jour) {
    document.getElementById("erreur-evenement-jour").classList.remove("cache");
    premierChamp = document.getElementById("evenement-jour");
  }
  if (!titre) {
    document.getElementById("erreur-evenement-titre").classList.remove("cache");
    premierChamp = document.getElementById("evenement-titre");
  }
  if (!heureDebut || !heureFin || heureFin <= heureDebut) {
    document.getElementById("erreur-evenement-heures").classList.remove("cache");
    premierChamp ||= document.getElementById("evenement-heure-fin");
  }
  if (premierChamp) { premierChamp.focus(); return; }

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
  const bouton = document.getElementById("bouton-enregistrer-evenement");
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = pour && !id ? "Envoi dans le ticket…" : "Enregistrement…";
  let envoyeDiscord = false;
  try {
    if (id) await socle.api("/api/agenda/" + id, { method: "PUT", body: payload });
    else envoyeDiscord = !!(await socle.api("/api/agenda", { method: "POST", body: payload })).envoye_discord;
    // l'agenda se place sur le jour de l'événement, pour qu'on le voie apparaître
    AGENDA_REF = new Date(jour + "T00:00");
    fermerModaleEvenement();
    await chargerAgenda(false);
    if (envoyeDiscord) gestion.message("zone-message-agenda", "Événement créé et posté dans le ticket Discord de la personne.", "succes");
  } catch (e) {
    gestion.message("zone-message-modale-evenement", e.message);
  } finally {
    bouton.disabled = false;
    bouton.textContent = texteInitial;
  }
});

document.getElementById("bouton-supprimer-evenement").addEventListener("click", async () => {
  const id = document.getElementById("evenement-id").value;
  if (!id) return;
  const ok = await gestion.confirmer("Cette action est définitive et ne peut pas être annulée.", "Supprimer cet événement ?", "Supprimer l’événement");
  if (!ok) return;
  try {
    await socle.api("/api/agenda/" + id, { method: "DELETE" });
    fermerModaleEvenement();
    chargerAgenda(false);
  } catch (e) {
    gestion.message("zone-message-modale-evenement", e.message);
  }
});

// agenda.html?nouveau=1 (« Ajouter un rendez-vous » de l'Accueil) : ouvre directement la fenêtre, sur aujourd'hui ;
// le paramètre est retiré de l'adresse pour qu'un rechargement ne la rouvre pas
gestion.coque("agenda").then(async () => {
  await chargerAgenda(true);
  if (new URLSearchParams(location.search).get("nouveau") !== "1") return;
  history.replaceState(null, "", location.pathname);
  ouvrirModaleEvenement({ jour: formaterDateISO(aujourdhuiParis()) });
});
