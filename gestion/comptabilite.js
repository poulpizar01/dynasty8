/* GESTION — comptabilité (permission « compta ») : relevé Tablettes collé,
   rémunération (salaires par grade, paliers de primes) et préparation de la déclaration DOT hebdomadaire.
   Serveur : server/src/entreprise/routes/compta.ts et routes/stats.ts (rémunération). */

// séparateur de milliers comme formaterPrix (layout.js), sans « HT »
function formaterArgentStats(valeur) {
  const n = Math.round(Number(valeur) || 0);
  return `${n < 0 ? '-' : ''}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`;
}
function formaterDateAdmin(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? echapper(iso || '') : d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
}
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
// interrupteurs par grade), enregistrée dans remunerations_grades et
// baremes_primes (routes/stats.ts) — les tables que lisent la DOT et les primes
// partout : un changement ici s'applique au prochain calcul.
// ---------------------------------------------------------------------------

function switchRemunerationHtml(attribut, cle, actif) {
  return `<label class="d8-switch"><input type="checkbox" ${attribut}="${echapper(cle)}" ${actif ? "checked" : ""}><span class="d8-switch-piste"></span></label>`;
}

async function chargerRemuneration() {
  gestion.message("zone-message-parametres", "");
  try {
    const r = await socle.api("/api/stats/remuneration");
    document.getElementById("corps-table-remuneration-grades").innerHTML = r.grades.map((g) => `
      <tr>
        <td><span class="puce" style="background:${g.couleur || "#8a93b8"}26;color:${g.couleur || "#8a93b8"};">${echapper(g.libelle)}</span></td>
        <td style="text-align:center;">${switchRemunerationHtml("data-salaire-actif", g.grade, g.salaireActif)}</td>
        <td style="text-align:right;"><input type="number" class="table-input" min="0" step="1000" style="text-align:right;max-width:160px;" data-salaire-montant="${echapper(g.grade)}" value="${g.salaireFixe}"></td>
        <td style="text-align:center;">${switchRemunerationHtml("data-prime-vente-active", g.grade, g.primeVenteActive)}</td>
        <td style="text-align:center;">${switchRemunerationHtml("data-prime-location-active", g.grade, g.primeLocationActive)}</td>
        <td style="text-align:right;"><input type="number" class="table-input" min="0" step="100" style="text-align:right;max-width:130px;" data-taux-horaire="${echapper(g.grade)}" value="${g.tauxHoraire || 0}" aria-label="Taux horaire de ${echapper(g.libelle)}"></td>
      </tr>`).join("");
    cablerRemunerationGrades();

    rendreBaremesPrimes("vente", r.baremesVentes);
    rendreBaremesPrimes("location", r.baremesLocations);
  } catch (e) {
    document.getElementById("corps-table-remuneration-grades").innerHTML = `<tr><td colspan="6">Erreur de chargement.</td></tr>`;
    gestion.message("zone-message-parametres", "Impossible de charger les réglages de rémunération : " + e.message);
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
        gestion.message("zone-message-parametres", "Le taux horaire doit être un nombre positif.");
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
        gestion.message("zone-message-parametres", "Le montant du salaire doit être un nombre positif.");
        chargerRemuneration();
        return;
      }
      modifierGradeRemuneration(el.dataset.salaireMontant, { salaireFixe: val });
    });
  });
}

async function modifierGradeRemuneration(grade, patch) {
  try {
    await socle.api(`/api/stats/remuneration/grades/${encodeURIComponent(grade)}`, { method: "PATCH", body: patch });
    gestion.message("zone-message-parametres", "Enregistré ✓", "succes");
  } catch (e) {
    gestion.message("zone-message-parametres", "Impossible d'enregistrer : " + e.message);
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
    await socle.api(`/api/stats/baremes/${id}`, { method: "PATCH", body: patch });
    gestion.message("zone-message-parametres", "Enregistré ✓", "succes");
  } catch (e) {
    gestion.message("zone-message-parametres", "Impossible d'enregistrer : " + e.message);
  } finally {
    chargerRemuneration();
  }
}

async function supprimerPalierPrime(id) {
  const ok = await gestion.confirmer("Ce palier de prime sera définitivement supprimé.", "Supprimer ce palier ?");
  if (!ok) return;
  try {
    await socle.api(`/api/stats/baremes/${id}`, { method: "DELETE" });
    chargerRemuneration();
  } catch (e) {
    gestion.message("zone-message-parametres", "Impossible de supprimer : " + e.message);
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
      gestion.message("zone-message-parametres", "Le seuil (nombre à atteindre) doit être un nombre entier positif.");
      return;
    }
    if (montantEl.value === "" || !Number.isFinite(montant) || montant < 0) {
      gestion.message("zone-message-parametres", "Le montant de la prime doit être un nombre positif.");
      return;
    }
    try {
      await socle.api("/api/stats/baremes", { method: "POST", body: { type, seuil, montant } });
      seuilEl.value = "";
      montantEl.value = "";
      chargerRemuneration();
    } catch (e) {
      gestion.message("zone-message-parametres", "Impossible d'ajouter ce palier : " + e.message);
    }
  });
});

// ---------------------------------------------------------------------------
// Comptabilité -> DOT — la déclaration hebdomadaire versée à la DOT.
// Trois blocs qui se rechargent ensemble à chaque changement de semaine ou
// d'écriture : le résumé chiffré, le journal dépense/retraits (modifiable
// à la main), et le tableau par salarié (calculé, prêt à copier).
// ---------------------------------------------------------------------------

let CACHE_ECRITURES_DOT = [];

async function chargerDot() {
  const select = document.getElementById("select-semaine-dot");
  if (!select.dataset.rempli) {
    try {
      const reponse = await socle.api("/api/compta/semaines");
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
  gestion.message("zone-message-dot", "");
  const semaine = document.getElementById("select-semaine-dot").value;
  try {
    const r = await socle.api("/api/compta/dot/resume" + (semaine ? `?semaine=${encodeURIComponent(semaine)}` : ""));
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
    gestion.message("zone-message-dot", "Impossible de charger le résumé DOT : " + e.message);
  }
}

async function chargerDotEcritures() {
  try {
    const r = await socle.api("/api/compta/dot/ecritures");
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
    gestion.message("zone-message-dot", "Impossible de charger les écritures : " + e.message);
  }
}

async function supprimerEcritureDot(id) {
  const ok = await gestion.confirmer("Cette ligne sera retirée du calcul du bénéfice imposable.", "Supprimer cette écriture ?");
  if (!ok) return;
  try {
    await socle.api(`/api/compta/dot/ecritures/${id}`, { method: "DELETE" });
    await Promise.all([chargerDotEcritures(), chargerDotResume()]);
  } catch (e) {
    gestion.message("zone-message-dot", e.message);
  }
}

// « Réinitialiser » un des deux tableaux (dépenses OU retraits) : supprime
// toutes ses lignes d'un coup (l'autre tableau n'est jamais touché), comme
// le bouton équivalent de l'onglet Tablettes.
async function reinitialiserEcrituresDot(type) {
  const libelle = type === "depense" ? "des dépenses déductibles" : "des retraits";
  const ok = await gestion.confirmer(`Toutes les lignes ${libelle} seront supprimées. Cette action est irréversible.`, "Réinitialiser ce tableau ?");
  if (!ok) return;
  try {
    await socle.api(`/api/compta/dot/ecritures?type=${type}`, { method: "DELETE" });
    await Promise.all([chargerDotEcritures(), chargerDotResume()]);
  } catch (e) {
    gestion.message("zone-message-dot", e.message);
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
    gestion.message("zone-message-dot", "Tableau copié ✓ Vous pouvez le coller dans Excel/Google Sheets.", "succes");
  } else {
    gestion.message("zone-message-dot", "Impossible de copier automatiquement — sélectionnez le tableau à la main (Ctrl+C).");
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
  gestion.message("zone-message-modale-ecriture-dot", "");
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
  gestion.message("zone-message-modale-ecriture-dot", "");
  const type = document.getElementById("ecriture-dot-type").value;
  const date = document.getElementById("ecriture-dot-date").value.trim();
  const justificatif = document.getElementById("ecriture-dot-justificatif").value.trim();
  const montant = document.getElementById("ecriture-dot-montant").value;
  try {
    await socle.api("/api/compta/dot/ecritures", { method: "POST", body: { type, date, justificatif, montant } });
    fermerModaleEcritureDot();
    await Promise.all([chargerDotEcritures(), chargerDotResume()]);
  } catch (e) {
    gestion.message("zone-message-modale-ecriture-dot", e.message);
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
    const r = await socle.api(`/api/compta/dot/salaries?semaine=${encodeURIComponent(semaine)}`);
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
    gestion.message("zone-message-dot", "Rien à copier : choisissez une semaine avec des salariés.");
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
    gestion.message("zone-message-dot", `Tableau copié ✓ (${lignes.length} salariés, sans la ligne de titres). Collez-le en ligne ${premiereLigne}, colonne A, du document DOT : la colonne CA TOTAL REALISE arrive en formule.`, "succes");
  } else {
    gestion.message("zone-message-dot", "Impossible de copier automatiquement — sélectionnez le tableau à la main (Ctrl+C).");
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
  // La ligne récap "TOTAL" collée depuis la tablette n'a pas de case "Rang",
  // ce qui décale le reste vers la gauche. Corrigée ici, avant l'aperçu, pour
  // que l'aperçu montre ce qui sera enregistré : même règle que
  // corrigerLigneTotale côté serveur (routes/compta.ts), à garder identique.
  lignes = corrigerLigneTotaleDecaleeTablette(colonnes, lignes);
  lignes = lignes.map((cellules) => {
    const rangee = [];
    for (let i = 0; i < colonnes.length; i++) rangee.push(cellules[i] === undefined ? "" : cellules[i]);
    return rangee;
  });
  return { colonnes, lignes };
}

// Cherche, parmi les titres de colonnes (déjà mis en minuscules/sans
// espaces), le premier qui correspond à l'un des noms possibles — même règle
// que indexColonne côté serveur (routes/compta.ts).
function indexColonneTabletteClient(colonnesNormalisees, aliases) {
  for (const nom of aliases) {
    const i = colonnesNormalisees.indexOf(nom);
    if (i !== -1) return i;
  }
  return -1;
}

// Même règle que corrigerLigneTotale côté serveur (routes/compta.ts), à garder
// identique : l'aperçu affiché avant d'enregistrer correspond ainsi à ce qui
// sera sauvegardé.
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
  const ok = await gestion.confirmer(`« ${nom} » sera retiré du relevé Tablettes. Les totaux (CA brut, DOT) seront recalculés sans cette ligne.`, "Retirer ce membre du relevé ?");
  if (!ok) return;
  try {
    await socle.api(`/api/compta/tablettes/lignes/${index}`, { method: "DELETE", body: { nom } });
    gestion.message("zone-message-tablette", `« ${nom} » retiré du relevé ✓`, "succes");
    chargerTablette();
  } catch (e) {
    gestion.message("zone-message-tablette", "Impossible de retirer cette ligne : " + e.message);
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

// Paie à l'heure (server/src/entreprise/stats/paie-horaire.ts) : une ligne par membre d'un grade payé à l'heure, avec
// le calcul écrit en toutes lettres.
function afficherPaieHoraire(p) {
  const bloc = document.getElementById("compta-paie-horaire");
  if (!p || !p.lignes || !p.lignes.length) { bloc.classList.add("cache"); return; }
  bloc.classList.remove("cache");
  document.getElementById("compta-paie-horaire-aide").textContent = p.colonneHeures
    ? `Heures lues dans la colonne « ${p.colonneHeures} » du relevé, payées au taux horaire du grade (Rémunération), en plus des paliers. Incluses dans le salaire de la DOT.`
    : "Le relevé n'a pas de colonne « Heures de service » : impossible de calculer la paie à l'heure.";
  const heures = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  document.getElementById("corps-table-paie-horaire").innerHTML = p.lignes.map((l) => `<tr>
      <td>${echapper(l.nom)}</td>
      <td>${echapper(l.grade)}${l.gradeSource === "releve" ? ' <span class="champ-aide" title="Sans fiche RH à ce nom : grade lu dans la colonne Rang du relevé">*</span>' : ""}</td>
      <td style="text-align:right;">${l.lisible ? heures(l.minutes) : `<span class="puce puce-or" title="Durée illisible : comptée 0 $">${echapper(l.heures || "vide")}</span>`}</td>
      <td style="text-align:right;">${formaterArgentStats(l.taux)} / h</td>
      <td class="champ-aide">${l.lisible ? `${l.minutes} min ÷ 60 × ${formaterArgentStats(l.taux)}` : "durée illisible"}</td>
      <td style="text-align:right;"><strong>${formaterArgentStats(l.montant)}</strong></td>
    </tr>`).join("") + `<tr class="ligne-total"><td colspan="5">Total paie à l'heure</td><td style="text-align:right;"><strong>${formaterArgentStats(p.total)}</strong></td></tr>`;
}

async function chargerTablette() {
  gestion.message("zone-message-tablette", "");
  try {
    const reponse = await socle.api("/api/compta/tablettes");
    const vide = document.getElementById("compta-tablette-vide");
    const resultat = document.getElementById("compta-tablette-resultat");
    const boutonReset = document.getElementById("bouton-reinitialiser-tablette");
    if (!reponse.import) {
      vide.classList.remove("cache");
      resultat.classList.add("cache");
      boutonReset.classList.add("cache");
      afficherPaieHoraire(null);
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
    gestion.message("zone-message-tablette", "Impossible de charger les données : " + e.message);
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
  gestion.message("zone-message-modale-import", "");
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
    gestion.message("zone-message-modale-import", "Collez d'abord vos données.");
    return;
  }
  const corps = { colonnes: analyse.colonnes, lignes: analyse.lignes };
  // le serveur n'accepte pas de requête de plus de 64 Ko : prévenu ici, avec la taille, plutôt qu'une erreur vague
  const taille = new Blob([JSON.stringify(corps)]).size;
  if (taille > 60000) {
    gestion.message("zone-message-modale-import", `Relevé trop long (${Math.ceil(taille / 1024)} Ko pour 60 Ko au plus) : collez-le en retirant les colonnes inutiles.`);
    return;
  }
  try {
    await socle.api("/api/compta/tablettes", {
      method: "POST",
      body: corps,
    });
    fermerModaleImportTablette();
    chargerTablette();
  } catch (e) {
    gestion.message("zone-message-modale-import", "Impossible d'enregistrer : " + e.message);
  }
});

document.getElementById("bouton-reinitialiser-tablette").addEventListener("click", async () => {
  const ok = await gestion.confirmer(
    "Le tableau affiché dans « Tablettes » sera vidé. Rien n'est perdu : cet ancien relevé reste conservé côté serveur, seul l'affichage redevient vide. Vous pourrez importer un nouveau relevé dès que vous le souhaitez.",
    "Réinitialiser la feuille « Tablettes » ?"
  );
  if (!ok) return;
  try {
    await socle.api("/api/compta/tablettes", { method: "DELETE" });
    chargerTablette();
  } catch (e) {
    gestion.message("zone-message-tablette", "Impossible de réinitialiser : " + e.message);
  }
});


gestion.coque('comptabilite').then(() => chargerTablette());
