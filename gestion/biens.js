/* GESTION — annonces (biens du catalogue). Serveur : server/src/entreprise/routes/biens.ts.
   Aides partagées avec la vitrine (layout.js) : echapper, formaterPrix, analyserDescription, ETIQUETTES_CATEGORIE,
   SOUS_CATEGORIES_HABITATION, ameliorerSelect, fermerSelectOuvert. */

let CACHE_BIENS = [];
let IMAGES_BIEN = [];        // adresses des photos du bien en cours d'édition, dans l'ordre (la première est la principale)
let ETAT_INITIAL_BIEN = '';  // instantané du formulaire à l'ouverture, pour détecter les changements non enregistrés

let FILTRE_RECHERCHE = '';
let FILTRE_CATEGORIE = '';
let FILTRE_STATUT = '';
let MODE_VUE_BIENS = 'liste';
let PAGE_BIENS = 1;
const TAILLE_PAGE_BIENS = 10;
const MAX_PHOTOS_BIEN = 10;  // même limite côté serveur (entreprise/photos.ts)

const $ = id => document.getElementById(id);

async function chargerTableBiens() {
  const corps = $('corps-table-biens');
  corps.innerHTML = '<tr><td colspan="7">Chargement…</td></tr>';
  gestion.message('zone-message-annonces', '');
  try {
    CACHE_BIENS = (await socle.api('/api/biens')).biens || [];
    actualiserVueAnnonces();
  } catch (e) {
    corps.innerHTML = `<tr><td colspan="7">Erreur de chargement : ${echapper(e.message)}</td></tr>`;
  }
}

// ---- statut / statistiques / filtres ----

const statutBien = b => (b.vendu ? 'vendu' : b.disponible ? 'visible' : 'masquee');

function rendreStats() {
  const total = CACHE_BIENS.length;
  const visibles = CACHE_BIENS.filter(b => b.disponible).length;
  const masquees = total - visibles;
  const coupsDeCoeur = CACHE_BIENS.filter(b => b.coup_de_coeur).length;
  const carte = (icone, couleur, valeur, libelle, sous) => `
    <div class="stat-carte">
      <span class="stat-icone stat-icone--${couleur}">${gestion.ico(icone)}</span>
      <div><div class="stat-valeur">${valeur}</div><div class="stat-libelle">${libelle}</div><div class="stat-sous-libelle">${sous}</div></div>
    </div>`;
  $('admin-stats').innerHTML = carte('home', 'or', total, 'Annonces', 'Total des biens')
    + carte('eye', 'vert', visibles, 'Visibles', 'En ligne sur le site')
    + carte('star', 'or', coupsDeCoeur, 'Coups de cœur', 'En vitrine sur l\'accueil')
    + carte('eyeoff', 'mauve', masquees, `Masquée${masquees > 1 ? 's' : ''}`, 'Hors catalogue public');
}

function biensFiltres() {
  const q = FILTRE_RECHERCHE.trim().toLowerCase();
  return CACHE_BIENS.filter(b => {
    if (FILTRE_CATEGORIE && b.categorie !== FILTRE_CATEGORIE) return false;
    if (FILTRE_STATUT && statutBien(b) !== FILTRE_STATUT) return false;
    if (q) {
      const cible = [b.titre, ETIQUETTES_CATEGORIE[b.categorie] || b.categorie, b.sous_categorie, b.coherence].filter(Boolean).join(' ').toLowerCase();
      if (!cible.includes(q)) return false;
    }
    return true;
  });
}

// ---- rendu : tableau, grille et pagination ----

const puceStatut = b => (b.disponible ? '<span class="puce puce-ok">Visible</span>' : '<span class="puce puce-masquee">Masquée</span>');
const boutonsActions = (b, rond) => `
  <button type="button" class="actions-icone${rond ? ' actions-icone--rond' : ''}" data-editer="${b.id}" title="Modifier" aria-label="Modifier">${gestion.ico('pencil')}</button>
  <button type="button" class="actions-icone${rond ? ' actions-icone--rond' : ''} actions-icone--danger" data-supprimer="${b.id}" title="Supprimer" aria-label="Supprimer">${gestion.ico('trash')}</button>`;

function cablerActions(conteneur) {
  conteneur.querySelectorAll('[data-editer]').forEach(btn => btn.addEventListener('click', () => ouvrirModaleBien(Number(btn.dataset.editer))));
  conteneur.querySelectorAll('[data-supprimer]').forEach(btn => btn.addEventListener('click', () => supprimerBien(Number(btn.dataset.supprimer))));
}

function rendreTableBiens(liste) {
  const corps = $('corps-table-biens');
  corps.innerHTML = liste.map(b => `
    <tr class="${b.coup_de_coeur ? 'ligne-coup-de-coeur' : ''}">
      <td class="cellule-vignette"><div class="table-biens-vignette">${b.images?.[0] ? `<img src="${echapper(b.images[0])}" alt="">` : ''}</div></td>
      <td><div class="table-biens-titre">${echapper(b.titre)}${b.coup_de_coeur ? ` <span class="table-biens-fav" title="Coup de cœur">${gestion.ico('star')}</span>` : ''}${b.standing ? ' <span class="puce puce-or">Exception</span>' : ''}</div>${b.coherence ? `<div class="table-biens-sous">${echapper(b.coherence)}</div>` : ''}</td>
      <td>${echapper(ETIQUETTES_CATEGORIE[b.categorie] || b.categorie)}</td>
      <td>${echapper(b.sous_categorie || '—')}</td>
      <td>${b.dispo_vente ? `<div class="table-biens-prix">${formaterPrix(b.prix)}</div>` : ''}${b.dispo_location ? `<div class="table-biens-sous">${formaterPrix(b.prix_location)} /sem.</div>` : ''}</td>
      <td>${puceStatut(b)}</td>
      <td><div class="actions-ligne">${boutonsActions(b, false)}</div></td>
    </tr>`).join('');
  cablerActions(corps);
}

function rendreGrilleBiens(liste) {
  const conteneur = $('vue-grille-biens');
  conteneur.innerHTML = liste.map(b => {
    const meta = [b.sous_categorie, ETIQUETTES_CATEGORIE[b.categorie] || b.categorie, b.coherence].filter(Boolean).map(echapper).join(' · ');
    const prix = b.dispo_vente ? formaterPrix(b.prix) : b.dispo_location ? `${formaterPrix(b.prix_location)} /sem.` : '—';
    const loc = b.dispo_vente && b.dispo_location ? `<span class="carte-admin-bien-loc">· ${formaterPrix(b.prix_location)} /sem.</span>` : '';
    return `
    <article class="carte-admin-bien">
      <div class="carte-admin-bien-visuel">
        ${b.images?.[0] ? `<img src="${echapper(b.images[0])}" alt="" loading="lazy">` : ''}
        ${b.coup_de_coeur ? `<span class="carte-admin-bien-fav">${gestion.ico('star')} Coup de cœur</span>` : ''}
        <span class="carte-admin-bien-categorie">${b.standing ? 'Exclusif' : echapper(ETIQUETTES_CATEGORIE[b.categorie] || b.categorie)}</span>
      </div>
      <div class="carte-admin-bien-corps">
        <div class="carte-admin-bien-entete">
          <div><h3 class="carte-admin-bien-titre">${echapper(b.titre)}</h3><div class="carte-admin-bien-meta">${meta}</div></div>
          ${puceStatut(b)}
        </div>
        <div class="carte-admin-bien-pied">
          <span class="carte-admin-bien-prix">${prix}${loc}</span>
          <div class="carte-admin-bien-actions">${boutonsActions(b, true)}</div>
        </div>
      </div>
    </article>`;
  }).join('');
  cablerActions(conteneur);
}

function rendrePagination(totalFiltre) {
  const conteneur = $('annonces-pagination');
  if (!totalFiltre) { conteneur.innerHTML = ''; return; }
  const totalPages = Math.max(1, Math.ceil(totalFiltre / TAILLE_PAGE_BIENS));
  const debut = (PAGE_BIENS - 1) * TAILLE_PAGE_BIENS + 1;
  const fin = Math.min(totalFiltre, PAGE_BIENS * TAILLE_PAGE_BIENS);
  let pages = '';
  for (let p = 1; p <= totalPages; p++) pages += `<button type="button" class="pagination-page ${p === PAGE_BIENS ? 'actif' : ''}" data-page="${p}">${p}</button>`;
  conteneur.innerHTML = `
    <span>Affichage de ${debut} à ${fin} sur ${totalFiltre} résultat${totalFiltre > 1 ? 's' : ''}</span>
    <div class="pagination-boutons">
      <button type="button" class="pagination-fleche" data-sens="-1" ${PAGE_BIENS <= 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
      ${pages}
      <button type="button" class="pagination-fleche" data-sens="1" ${PAGE_BIENS >= totalPages ? 'disabled' : ''} aria-label="Page suivante">›</button>
    </div>`;
  conteneur.querySelectorAll('[data-sens]').forEach(btn => btn.addEventListener('click', () => { PAGE_BIENS += Number(btn.dataset.sens); actualiserVueAnnonces(); }));
  conteneur.querySelectorAll('[data-page]').forEach(btn => btn.addEventListener('click', () => { PAGE_BIENS = Number(btn.dataset.page); actualiserVueAnnonces(); }));
}

function actualiserVueAnnonces() {
  rendreStats();
  $('bouton-reinitialiser-filtres').classList.toggle('cache', !(FILTRE_RECHERCHE || FILTRE_CATEGORIE || FILTRE_STATUT));
  const corps = $('corps-table-biens');
  if (!CACHE_BIENS.length) {
    corps.innerHTML = '<tr><td colspan="7">Aucune annonce pour le moment. Cliquez sur « Nouvelle annonce » pour commencer.</td></tr>';
    $('vue-grille-biens').innerHTML = '';
    $('annonces-pagination').innerHTML = '';
    return;
  }
  const filtres = biensFiltres();
  const totalPages = Math.max(1, Math.ceil(filtres.length / TAILLE_PAGE_BIENS));
  PAGE_BIENS = Math.min(Math.max(PAGE_BIENS, 1), totalPages);
  if (!filtres.length) {
    corps.innerHTML = '<tr><td colspan="7">Aucune annonce ne correspond à ces filtres.</td></tr>';
    $('vue-grille-biens').innerHTML = '<div class="etat-vide">Aucune annonce ne correspond à ces filtres.</div>';
    $('annonces-pagination').innerHTML = '';
    return;
  }
  const page = filtres.slice((PAGE_BIENS - 1) * TAILLE_PAGE_BIENS, PAGE_BIENS * TAILLE_PAGE_BIENS);
  rendreTableBiens(page);
  rendreGrilleBiens(page);
  rendrePagination(filtres.length);
}

async function supprimerBien(id, depuisModale = false) {
  if (!await gestion.confirmer('Cette action est définitive et ne peut pas être annulée.', 'Supprimer cette annonce ?', 'Supprimer')) return;
  try {
    await socle.api(`/api/biens/${id}`, { method: 'DELETE' });
    if (depuisModale) fermerModaleBien();
    await chargerTableBiens();
    gestion.message('zone-message-annonces', 'Annonce supprimée avec succès.', 'succes');
  } catch (e) {
    gestion.message(depuisModale ? 'zone-message-modale-bien' : 'zone-message-annonces', e.message);
  }
}

// ---- barre d'outils : recherche, filtres, bascule liste/grille ----

function appliquerModeVueBiens() {
  for (const mode of ['liste', 'grille']) {
    $(`vue-${mode}-biens`).classList.toggle('cache', MODE_VUE_BIENS !== mode);
    $(`bouton-vue-${mode}`).classList.toggle('actif', MODE_VUE_BIENS === mode);
    $(`bouton-vue-${mode}`).setAttribute('aria-pressed', String(MODE_VUE_BIENS === mode));
  }
}
$('bouton-vue-liste').addEventListener('click', () => { MODE_VUE_BIENS = 'liste'; appliquerModeVueBiens(); });
$('bouton-vue-grille').addEventListener('click', () => { MODE_VUE_BIENS = 'grille'; appliquerModeVueBiens(); });
appliquerModeVueBiens();

$('recherche-biens').addEventListener('input', e => { FILTRE_RECHERCHE = e.target.value; PAGE_BIENS = 1; actualiserVueAnnonces(); });
$('filtre-categorie').addEventListener('change', e => { FILTRE_CATEGORIE = e.target.value; PAGE_BIENS = 1; actualiserVueAnnonces(); });
$('filtre-statut').addEventListener('change', e => { FILTRE_STATUT = e.target.value; PAGE_BIENS = 1; actualiserVueAnnonces(); });
$('bouton-reinitialiser-filtres').addEventListener('click', () => {
  FILTRE_RECHERCHE = FILTRE_CATEGORIE = FILTRE_STATUT = '';
  PAGE_BIENS = 1;
  for (const id of ['recherche-biens', 'filtre-categorie', 'filtre-statut']) $(id).value = '';
  actualiserVueAnnonces();
});

// ---- catégorie / sous-catégorie (cascade) ----

function remplirSousCategories(categorie, valeurSelectionnee) {
  const select = $('bien-sous-categorie');
  $('ligne-bien-meuble').classList.toggle('cache', categorie !== 'habitation');
  if (categorie === 'habitation') {
    select.disabled = false;
    select.innerHTML = SOUS_CATEGORIES_HABITATION.map(s => `<option value="${echapper(s)}">${echapper(s)}</option>`).join('');
    select.value = SOUS_CATEGORIES_HABITATION.includes(valeurSelectionnee) ? valeurSelectionnee : SOUS_CATEGORIES_HABITATION[0];
  } else {
    select.disabled = true;
    select.innerHTML = '<option value="">Aucune (catégorie Garage)</option>';
  }
  // la cohérence par défaut suit la catégorie choisie (l'agent peut la changer ensuite)
  const coherence = $('bien-coherence');
  if (!coherence.dataset.modifieManuellement) coherence.value = categorie === 'garage' ? 'Garage' : 'Habitation';
}
$('bien-categorie').addEventListener('change', e => remplirSousCategories(e.target.value, ''));
$('bien-coherence').addEventListener('change', e => { e.target.dataset.modifieManuellement = '1'; });

// ---- transaction : vente et/ou location, chacune avec sa propre ligne de prix ----
$('bien-dispo-vente').addEventListener('change', e => $('ligne-bien-prix-vente').classList.toggle('cache', !e.target.checked));
$('bien-dispo-location').addEventListener('change', e => $('ligne-bien-prix-location').classList.toggle('cache', !e.target.checked));

// ---- photos : fichier envoyé tel quel, ou lien téléchargé par le serveur ----
// Le serveur contrôle, réencode (WebP) et stocke chaque photo, puis renvoie son adresse : c'est elle seule que garde
// l'annonce. Un envoi à la fois ; EDITION_BIEN change à chaque ouverture et fermeture de la fenêtre, si bien qu'un envoi
// qui se termine après coup n'ajoute rien (la photo reçue par le serveur, jamais utilisée, sera nettoyée).
let EDITION_BIEN = 0;
let TRANSFERTS_BIEN = [];        // { nom, fichier | lien, controleur, enCours }
let ERREURS_IMAGES_BIEN = [];
let FILE_BIEN_ACTIVE = false;
let SAUVEGARDE_BIEN_EN_COURS = false;

function afficherErreursImagesBien() {
  const zone = $('erreur-bien-images');
  const lignes = ERREURS_IMAGES_BIEN.slice(-5);
  if (IMAGES_BIEN.length + TRANSFERTS_BIEN.length >= MAX_PHOTOS_BIEN) lignes.push(`Limite de ${MAX_PHOTOS_BIEN} photos atteinte. Retirez une photo pour en ajouter une autre.`);
  zone.style.whiteSpace = 'pre-line';
  zone.textContent = lignes.join('\n');
  zone.classList.toggle('cache', !lignes.length);
}
function ajouterErreurImagesBien(texte) { ERREURS_IMAGES_BIEN.push(texte); afficherErreursImagesBien(); }

function boutonVignette(libelle, surClic) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'bien-images-retirer';
  bouton.textContent = '✕';
  bouton.setAttribute('aria-label', libelle);
  bouton.title = libelle;
  bouton.addEventListener('click', surClic);
  return bouton;
}

function redessinerImagesBien() {
  const grille = $('bien-images-grille');
  grille.textContent = '';
  IMAGES_BIEN.forEach((src, i) => {
    const vignette = document.createElement('div');
    vignette.className = 'bien-images-vignette';
    const img = document.createElement('img');
    img.src = src;
    img.alt = `Photo ${i + 1} du bien`;
    vignette.append(img);
    if (i === 0) {
      const principale = document.createElement('span');
      principale.className = 'bien-images-principale';
      principale.textContent = 'Principale';
      vignette.append(principale);
    }
    const retirer = boutonVignette('Retirer cette photo', () => { if (!SAUVEGARDE_BIEN_EN_COURS) { IMAGES_BIEN.splice(i, 1); redessinerImagesBien(); } });
    retirer.disabled = SAUVEGARDE_BIEN_EN_COURS;
    vignette.append(retirer);
    grille.append(vignette);
  });
  TRANSFERTS_BIEN.forEach(t => {
    const vignette = document.createElement('div');
    vignette.className = 'bien-images-vignette';
    vignette.setAttribute('aria-busy', 'true');
    const texte = document.createElement('div');
    texte.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;text-align:center;font-size:0.68rem;line-height:1.25;overflow:hidden;';
    const etat = document.createElement('strong');
    etat.textContent = t.enCours ? (t.lien ? '⏳ Téléchargement…' : '⏳ Envoi…') : 'En attente';
    const nom = document.createElement('span');
    nom.textContent = t.nom;
    nom.style.cssText = 'opacity:0.7;word-break:break-all;';
    texte.append(etat, nom);
    vignette.append(texte, boutonVignette('Annuler l’envoi de cette photo', () => annulerTransfertBien(t)));
    grille.append(vignette);
  });
  const n = TRANSFERTS_BIEN.length;
  $('bien-images-compteur').textContent = `${IMAGES_BIEN.length} / ${MAX_PHOTOS_BIEN}${n ? ` · ${n} en cours d'envoi` : ''}`;
  const bloque = IMAGES_BIEN.length + n >= MAX_PHOTOS_BIEN || SAUVEGARDE_BIEN_EN_COURS;
  $('bouton-parcourir').disabled = bloque;
  if (!SAUVEGARDE_BIEN_EN_COURS) {
    const enregistrer = document.querySelector('#formulaire-bien button[type="submit"]');
    enregistrer.disabled = n > 0;
    enregistrer.title = n > 0 ? 'Attendez la fin de l’envoi des photos' : '';
  }
  afficherErreursImagesBien();
}

function annulerTransfertBien(t) {
  t.controleur.abort();
  TRANSFERTS_BIEN = TRANSFERTS_BIEN.filter(x => x !== t);
  redessinerImagesBien();
}

function reinitialiserTransfertsBien() {
  EDITION_BIEN++;
  TRANSFERTS_BIEN.forEach(t => t.controleur.abort());
  TRANSFERTS_BIEN = [];
  ERREURS_IMAGES_BIEN = [];
}

// envoi d'une photo ; fetch direct plutôt que socle.api pour pouvoir l'annuler
async function envoyerPhoto(t) {
  const init = { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: t.controleur.signal, body: new FormData() };
  init.body.append('image', t.fichier);
  let r;
  try { r = await fetch('/api/biens/photo', init); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Connexion au serveur perdue pendant l’envoi de la photo. Réessayez.'); }
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error && !/^[a-z-]+$/.test(data.error) ? data.error : r.status === 413 ? 'Photo trop volumineuse.' : 'L’envoi de la photo a échoué.');
  return data.url;
}

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
        const url = await envoyerPhoto(t);
        if (edition !== EDITION_BIEN || t.controleur.signal.aborted) continue;
        if (IMAGES_BIEN.length < MAX_PHOTOS_BIEN) IMAGES_BIEN.push(url);
      } catch (e) {
        if (edition === EDITION_BIEN && e.name !== 'AbortError') ajouterErreurImagesBien(`« ${t.nom} » : ${e.message}`);
      } finally {
        if (edition === EDITION_BIEN) { TRANSFERTS_BIEN = TRANSFERTS_BIEN.filter(x => x !== t); redessinerImagesBien(); }
      }
    }
  } finally {
    FILE_BIEN_ACTIVE = false;
    if (edition !== EDITION_BIEN && TRANSFERTS_BIEN.length) traiterFileBien();
  }
}

function placesPhotos() { return MAX_PHOTOS_BIEN - IMAGES_BIEN.length - TRANSFERTS_BIEN.length; }

$('bouton-parcourir').addEventListener('click', () => $('bien-image-fichier').click());
$('bien-image-fichier').addEventListener('change', e => {
  const fichiers = Array.from(e.target.files || []);
  e.target.value = '';   // permet de resélectionner le même fichier plus tard
  if (!fichiers.length || SAUVEGARDE_BIEN_EN_COURS) return;
  const place = placesPhotos();
  if (place <= 0) { afficherErreursImagesBien(); return; }
  if (fichiers.length > place) ajouterErreurImagesBien(`Seules les ${place} premières photos sélectionnées ont été retenues (limite de ${MAX_PHOTOS_BIEN}).`);
  for (const fichier of fichiers.slice(0, place)) {
    if (fichier.size > 15 * 1024 * 1024) { ajouterErreurImagesBien(`« ${fichier.name} » dépasse 15 Mo.`); continue; }
    TRANSFERTS_BIEN.push({ nom: fichier.name, fichier, controleur: new AbortController(), enCours: false });
  }
  redessinerImagesBien();
  traiterFileBien();
});

// ---- description : gras, italique, emoji, aperçu en direct ----

const EMOJIS_DESCRIPTION = ['🏠', '🏢', '🏙️', '🌴', '🚗', '🛏️', '🛋️', '🚿', '🛁', '🍽️', '🎉', '🍸', '💰', '🔑', '📍', '✨', '⭐', '🔥', '🌊', '🏊', '🎮', '🖥️', '🧳', '✅'];

function majApercuDescription() {
  const apercu = $('apercu-description');
  const texte = $('bien-description').value;
  apercu.innerHTML = analyserDescription(texte);
  apercu.classList.toggle('vide', !texte.trim());
}
function entourerDescription(marqueur, texteParDefaut) {
  const champ = $('bien-description');
  const { selectionStart: debut, selectionEnd: fin, value } = champ;
  const selection = value.slice(debut, fin) || texteParDefaut;
  champ.value = value.slice(0, debut) + marqueur + selection + marqueur + value.slice(fin);
  champ.focus();
  champ.setSelectionRange(debut + marqueur.length, debut + marqueur.length + selection.length);
  majApercuDescription();
}
$('bien-description').addEventListener('input', majApercuDescription);
$('bouton-description-gras').addEventListener('click', () => entourerDescription('**', 'texte en gras'));
$('bouton-description-italique').addEventListener('click', () => entourerDescription('*', 'texte en italique'));

const boutonEmoji = $('bouton-description-emoji');
const panneauEmoji = $('panneau-description-emoji');
panneauEmoji.innerHTML = EMOJIS_DESCRIPTION.map(e => `<button type="button" class="emoji-bouton">${e}</button>`).join('');
boutonEmoji.addEventListener('click', e => {
  e.stopPropagation();
  const ouvrir = panneauEmoji.classList.contains('cache');
  panneauEmoji.classList.toggle('cache', !ouvrir);
  boutonEmoji.setAttribute('aria-expanded', String(ouvrir));
});
panneauEmoji.querySelectorAll('.emoji-bouton').forEach(btn => btn.addEventListener('click', () => {
  const champ = $('bien-description');
  const { selectionStart: debut, selectionEnd: fin } = champ;
  champ.value = champ.value.slice(0, debut) + btn.textContent + champ.value.slice(fin);
  champ.focus();
  champ.setSelectionRange(debut + btn.textContent.length, debut + btn.textContent.length);
  panneauEmoji.classList.add('cache');
  boutonEmoji.setAttribute('aria-expanded', 'false');
  majApercuDescription();
}));
document.addEventListener('click', e => {
  if (!panneauEmoji.contains(e.target) && e.target !== boutonEmoji) { panneauEmoji.classList.add('cache'); boutonEmoji.setAttribute('aria-expanded', 'false'); }
});

// ---- ouverture / fermeture de la fenêtre, avec protection contre la perte de données ----

const CHAMPS_TEXTE = ['bien-titre', 'bien-categorie', 'bien-sous-categorie', 'bien-prix-vente', 'bien-prix-location', 'bien-places', 'bien-coffre', 'bien-coherence', 'bien-vip', 'bien-description'];
const CASES = ['bien-meuble', 'bien-dispo-vente', 'bien-dispo-location', 'bien-coup-de-coeur', 'bien-disponible', 'bien-vendu', 'bien-standing'];
const etatFormulaireBien = () => JSON.stringify([CHAMPS_TEXTE.map(id => $(id).value), CASES.map(id => $(id).checked), IMAGES_BIEN]);

function ouvrirModaleBien(id) {
  const bien = id ? CACHE_BIENS.find(b => b.id === id) : null;
  $('titre-modale-bien').textContent = bien ? 'Modifier l’annonce' : 'Nouvelle annonce';
  $('bien-id').value = bien ? bien.id : '';
  $('bien-titre').value = bien ? bien.titre : '';
  const categorie = bien ? bien.categorie : 'habitation';
  $('bien-categorie').value = categorie;
  const coherence = $('bien-coherence');
  delete coherence.dataset.modifieManuellement;
  remplirSousCategories(categorie, bien?.sous_categorie || '');
  coherence.value = bien?.coherence || (categorie === 'garage' ? 'Garage' : 'Habitation');
  $('bien-meuble').checked = bien ? !!bien.meuble : true;
  $('bien-places').value = bien?.places ?? '';
  const dispoVente = bien ? !!bien.dispo_vente : true, dispoLocation = !!bien?.dispo_location;
  $('bien-dispo-vente').checked = dispoVente;
  $('bien-prix-vente').value = bien?.dispo_vente ? bien.prix : '';
  $('ligne-bien-prix-vente').classList.toggle('cache', !dispoVente);
  $('bien-dispo-location').checked = dispoLocation;
  $('bien-prix-location').value = bien?.dispo_location ? bien.prix_location : '';
  $('ligne-bien-prix-location').classList.toggle('cache', !dispoLocation);
  $('bien-coffre').value = bien?.coffre_kg ?? '';
  $('bien-vip').value = bien?.vip ? 'vip' : '';
  $('bien-description').value = bien?.description || '';
  majApercuDescription();
  $('bien-coup-de-coeur').checked = !!bien?.coup_de_coeur;
  $('bien-disponible').checked = bien ? !!bien.disponible : true;
  $('bien-vendu').checked = !!bien?.vendu;
  $('bien-standing').checked = !!bien?.standing;
  $('bouton-supprimer-bien').classList.toggle('cache', !bien);
  document.querySelectorAll('#formulaire-bien .champ-erreur').forEach(p => p.classList.add('cache'));
  gestion.message('zone-message-modale-bien', '');
  reinitialiserTransfertsBien();
  IMAGES_BIEN = bien?.images ? bien.images.slice(0, MAX_PHOTOS_BIEN) : [];
  redessinerImagesBien();
  $('modale-bien').classList.remove('cache');
  ETAT_INITIAL_BIEN = etatFormulaireBien();
}

function fermerModaleBien() {
  fermerSelectOuvert();
  reinitialiserTransfertsBien();
  redessinerImagesBien();
  $('modale-bien').classList.add('cache');
}

async function demanderFermetureModaleBien() {
  if (SAUVEGARDE_BIEN_EN_COURS) return;
  if (TRANSFERTS_BIEN.length) {
    if (!await gestion.confirmer('Des photos sont encore en cours d’envoi : fermer maintenant annule ces envois, et les modifications non enregistrées seront perdues.', 'Fermer sans enregistrer ?', 'Fermer')) return;
  } else if (etatFormulaireBien() !== ETAT_INITIAL_BIEN) {
    if (!await gestion.confirmer('Les modifications saisies seront perdues si vous fermez maintenant.', 'Fermer sans enregistrer ?', 'Fermer')) return;
  }
  fermerModaleBien();
}

$('bouton-nouveau-bien').addEventListener('click', () => ouvrirModaleBien(null));
$('fermer-modale-bien').addEventListener('click', demanderFermetureModaleBien);
$('bouton-annuler-bien').addEventListener('click', demanderFermetureModaleBien);
$('modale-bien').addEventListener('click', e => { if (e.target.id === 'modale-bien') demanderFermetureModaleBien(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modale-bien').classList.contains('cache') && !document.querySelector('[role="alertdialog"]')) {
    e.preventDefault();
    demanderFermetureModaleBien();
  }
});

$('formulaire-bien').addEventListener('submit', async e => {
  e.preventDefault();
  gestion.message('zone-message-modale-bien', '');
  document.querySelectorAll('#formulaire-bien .champ-erreur').forEach(p => p.classList.add('cache'));
  const erreur = id => { $(id).classList.remove('cache'); valide = false; };
  let valide = true;
  const titre = $('bien-titre').value.trim();
  const dispoVente = $('bien-dispo-vente').checked, dispoLocation = $('bien-dispo-location').checked;
  const prixVente = $('bien-prix-vente').value, prixLocation = $('bien-prix-location').value;
  const positif = v => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
  if (!titre) erreur('erreur-bien-titre');
  if (!dispoVente && !dispoLocation) erreur('erreur-bien-transaction');
  if (dispoVente && !positif(prixVente)) erreur('erreur-bien-prix-vente');
  if (dispoLocation && !positif(prixLocation)) erreur('erreur-bien-prix-location');
  if (!valide) { gestion.message('zone-message-modale-bien', 'Corrigez les champs indiqués en rouge avant d’enregistrer.'); return; }
  if (TRANSFERTS_BIEN.length) { gestion.message('zone-message-modale-bien', 'Attendez la fin de l’envoi des photos avant d’enregistrer.'); return; }

  const id = $('bien-id').value;
  const categorie = $('bien-categorie').value;
  const nombreOuNul = v => (v === '' ? null : Number(v));
  const bien = {
    titre, categorie,
    sous_categorie: categorie === 'habitation' ? $('bien-sous-categorie').value : '',
    meuble: categorie === 'habitation' && $('bien-meuble').checked,
    places: nombreOuNul($('bien-places').value),
    coffre_kg: nombreOuNul($('bien-coffre').value),
    coherence: $('bien-coherence').value,
    vip: $('bien-vip').value === 'vip',
    dispo_vente: dispoVente,
    prix: dispoVente ? Number(prixVente) : 0,
    dispo_location: dispoLocation,
    prix_location: dispoLocation ? Number(prixLocation) : null,
    description: $('bien-description').value.trim(),
    images: IMAGES_BIEN.slice(),
    coup_de_coeur: $('bien-coup-de-coeur').checked,
    disponible: $('bien-disponible').checked,
    vendu: $('bien-vendu').checked,
    standing: $('bien-standing').checked,
  };
  const bouton = document.querySelector('#formulaire-bien button[type="submit"]');
  const texteInitial = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Enregistrement…';
  SAUVEGARDE_BIEN_EN_COURS = true;   // bloque envois et retraits pendant l'enregistrement
  redessinerImagesBien();
  const edition = EDITION_BIEN;
  try {
    await socle.api(id ? `/api/biens/${id}` : '/api/biens', { method: id ? 'PUT' : 'POST', body: bien });
    ETAT_INITIAL_BIEN = etatFormulaireBien();
    gestion.message('zone-message-modale-bien', id ? 'Bien mis à jour ✓' : 'Bien ajouté avec succès ✓', 'succes');
    await chargerTableBiens();
    setTimeout(() => { if (edition === EDITION_BIEN) fermerModaleBien(); }, 800);
  } catch (err) {
    gestion.message('zone-message-modale-bien', err.message);
  } finally {
    SAUVEGARDE_BIEN_EN_COURS = false;
    bouton.textContent = texteInitial;
    redessinerImagesBien();
  }
});

$('bouton-supprimer-bien').addEventListener('click', () => { const id = $('bien-id').value; if (id) supprimerBien(Number(id), true); });

// menus déroulants aux couleurs du site (layout.js)
['filtre-categorie', 'filtre-statut', 'bien-categorie', 'bien-sous-categorie', 'bien-coherence', 'bien-vip'].forEach(id => ameliorerSelect($(id)));

gestion.coque('biens').then(chargerTableBiens);
