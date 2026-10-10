/* GESTION — agenda : événements personnels et partagés (Patrons, Direction, Tous) selon les rôles Discord. Ce que
   chacun voit, crée et modifie est décidé par le serveur (server/src/entreprise/routes/agenda.ts) ; la page ne fait
   qu'afficher les droits qu'il renvoie. */

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
        <div class="agenda-evenement agenda-vis-${visibiliteDe(e)}" title="${LIBELLES_VISIBILITE[visibiliteDe(e)]}${e.auteur && !e.mien ? " — ajouté par " + echapper(e.auteur) : ""}" style="top:${top}px;height:${hauteur}px;" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(e.titre)}, de ${e.heure_debut} à ${e.heure_fin}">
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
      <div class="agenda-mois-evenement agenda-vis-${visibiliteDe(e)}" data-id="${e.id}" tabindex="0" role="button" aria-label="${echapper(e.titre)} à ${e.heure_debut}">
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
  gestion.message("zone-message-agenda", "");
  const { debut, fin } = periodeAgenda();
  try {
    const data = await socle.api(`/api/agenda?debut=${formaterDateISO(debut)}&fin=${formaterDateISO(fin)}`);
    CACHE_EVENEMENTS = data.evenements || [];
    if (data.droits) AGENDA_DROITS = data.droits;
  } catch (e) {
    gestion.message("zone-message-agenda", "Impossible de charger votre agenda : " + e.message);
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

// droits renvoyés par GET /api/agenda ; fiches RH proposées pour un « Perso » destiné à quelqu'un d'autre (lues une fois)
let AGENDA_DROITS = { cree: ["perso"], perso_autrui: false };
let AGENDA_PERSONNES = null;
const LIBELLES_VISIBILITE = { perso: "Perso", patrons: "Patrons", direction: "Direction", tous: "Tous" };
// valeur venue du serveur, réduite aux visibilités connues avant d'entrer dans une classe ou un texte
const visibiliteDe = (e) => (Object.hasOwn(LIBELLES_VISIBILITE, e.visibilite) ? e.visibilite : "perso");

async function remplirChoixPour() {
  const select = document.getElementById("evenement-pour");
  if (AGENDA_PERSONNES === null) {
    try { AGENDA_PERSONNES = (await socle.api("/api/agenda/personnes")).personnes || []; }
    catch { AGENDA_PERSONNES = []; }
  }
  select.innerHTML = `<option value="">Moi</option>` + AGENDA_PERSONNES
    .map((p) => `<option value="${Number(p.id)}"${p.discord ? "" : " disabled"}>${echapper(p.nom)}${p.discord ? "" : " — sans ID Discord dans sa fiche"}</option>`).join("");
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

  // Visible par : ce que ce compte peut créer (+ la valeur actuelle en édition)
  const visibilite = e ? visibiliteDe(e) : "perso";
  const choix = [...new Set([...AGENDA_DROITS.cree.filter((v) => Object.hasOwn(LIBELLES_VISIBILITE, v)), visibilite])];
  const selectVis = document.getElementById("evenement-visibilite");
  selectVis.innerHTML = choix.map((v) => `<option value="${v}">${LIBELLES_VISIBILITE[v]}</option>`).join("");
  selectVis.value = visibilite;
  ameliorerSelect(selectVis);
  document.getElementById("evenement-pour").innerHTML = '<option value="">Moi</option>';
  if (!estEdition && AGENDA_DROITS.perso_autrui) remplirChoixPour();
  majChampPour();

  // origine : qui l'a ajouté, pour qui, envoyé dans un ticket
  const origine = document.getElementById("evenement-origine");
  const lignes = [];
  if (e && !e.mien && e.auteur) lignes.push(`Ajouté par ${e.auteur}.`);
  if (e && e.pour) lignes.push(`Pour ${e.pour}${e.envoye_discord ? " — envoyé dans son ticket Discord" : ""}.`);
  origine.textContent = lignes.join(" ");
  origine.classList.toggle("cache", !lignes.length);

  document.querySelectorAll("#formulaire-evenement input, #formulaire-evenement textarea, #formulaire-evenement select")
    .forEach((c) => { c.disabled = !modifiable; });
  document.getElementById("bouton-enregistrer-evenement").classList.toggle("cache", !modifiable);
  document.getElementById("bouton-annuler-evenement").textContent = modifiable ? "Annuler" : "Fermer";
  document.getElementById("bouton-supprimer-evenement").classList.toggle("cache", !estEdition || !modifiable);
  document.querySelectorAll("#formulaire-evenement .champ-erreur").forEach((p) => p.classList.add("cache"));
  gestion.message("zone-message-modale-evenement", "");
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
  if (ev.key === "Escape" && !document.getElementById("modale-evenement").classList.contains("cache") && !document.querySelector("[role=alertdialog]")) {
    ev.preventDefault();
    fermerModaleEvenement();
  }
});

document.getElementById("formulaire-evenement").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  gestion.message("zone-message-modale-evenement", "");
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
    gestion.message("zone-message-modale-evenement", "Corrigez les champs indiqués en rouge avant d'enregistrer.");
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
  bouton.textContent = pour && !id ? "Envoi dans le ticket…" : "Enregistrement…";
  let envoyeDiscord = false;
  try {
    if (id) {
      await socle.api("/api/agenda/" + id, { method: "PUT", body: payload });
    } else {
      envoyeDiscord = !!(await socle.api("/api/agenda", { method: "POST", body: payload })).envoye_discord;
    }
    fermerModaleEvenement();
    await chargerAgenda(false);
    if (envoyeDiscord) gestion.message("zone-message-agenda", "Événement créé : il a été posté dans le ticket Discord de la personne.", true);
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
  const ok = await gestion.confirmer("Cette action est définitive et ne peut pas être annulée.", "Supprimer cet événement ?", "Supprimer");
  if (!ok) return;
  try {
    await socle.api("/api/agenda/" + id, { method: "DELETE" });
    fermerModaleEvenement();
    chargerAgenda(false);
  } catch (e) {
    gestion.message("zone-message-modale-evenement", e.message);
  }
});


gestion.coque('agenda').then(() => chargerAgenda(true));
