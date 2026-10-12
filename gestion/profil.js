/* GESTION — éditeur du profil public d'un agent (page « Notre équipe » de la vitrine) : photo, poste, spécialité,
   biographie. Utilisé par « Mon profil » (compte.html) et par la Direction (comptes.html).
   Serveur : server/src/entreprise/routes/profils.ts.
     const editeur = profilEditeur(conteneur, { adresse: '/api/profil', nom: () => 'Prénom Nom', apresEnregistrement,
                                                champNom: 'Marc Delmas', surChangement: etat => … });
     await editeur.charger();
   champNom (Mon profil seulement) : ajoute le nom RP au même formulaire, enregistré avec le reste (PATCH /api/moi) ;
   surChangement : appelé à chaque modification ({ nom, poste, specialite, bio, photo }), pour un aperçu en direct.
   La photo est envoyée dès sa sélection (le serveur la contrôle et la convertit), puis enregistrée avec le reste du
   profil : tant que « Enregistrer » n'a pas réussi, l'ancienne photo reste celle du site. */
let PROFIL_EDITEURS = 0;
function profilEditeur(conteneur, { adresse, nom, apresEnregistrement, champNom, surChangement }) {
  const n = ++PROFIL_EDITEURS, id = c => `profil-${n}-${c}`;
  const avecNom = champNom !== undefined;
  conteneur.innerHTML = `
    <form data-formulaire class="profil-editeur" novalidate>
      <div class="profil-photo-ligne">
        <div class="profil-photo-apercu" data-apercu></div>
        <div class="profil-photo-actions">
          <strong>Photo</strong>
          <small>Portrait de préférence. JPG, PNG ou WEBP, 15 Mo au plus.</small>
          <div class="profil-photo-boutons">
            <button type="button" class="btn btn-fantome btn-petit" data-changer></button>
            <input type="file" accept="image/jpeg,image/png,image/webp" class="cache" data-fichier>
            <button type="button" class="btn btn-fantome btn-petit cache" data-retirer></button>
          </div>
          <small class="seulement-en-jeu">En jeu, l’ordinateur ne permet pas toujours de choisir un fichier : si rien ne s’ouvre, ajoutez la photo depuis un navigateur, avec le même compte.</small>
          <p class="champ-erreur cache" data-erreur-photo></p>
        </div>
      </div>
      ${avecNom ? `
      <div class="champ">
        <label for="${id("nom")}">Nom RP</label>
        <input type="text" id="${id("nom")}" maxlength="64" data-champ="nom" autocomplete="off">
        <p class="champ-aide">Votre nom dans l’espace agents et sur la page équipe.</p>
        <p class="champ-erreur cache" data-erreur-nom>Indiquez votre nom RP : sans lui, vous n’apparaissez pas sur la page équipe.</p>
      </div>` : ""}
      <div class="champ-deux">
        <div class="champ">
          <label for="${id("poste")}">Poste <small>facultatif</small></label>
          <input type="text" id="${id("poste")}" maxlength="80" placeholder="Ex. Agent, habitations" data-champ="poste">
          <p class="champ-aide">Vide : le grade s’affiche à la place.</p>
        </div>
        <div class="champ">
          <label for="${id("specialite")}">Spécialité <small>facultatif</small></label>
          <input type="text" id="${id("specialite")}" maxlength="100" placeholder="Ex. Villas et maisons" data-champ="specialite">
        </div>
      </div>
      <div class="champ">
        <div class="profil-libelle-ligne">
          <label for="${id("bio")}">Biographie <small>facultatif</small></label>
          <span class="profil-compteur" data-compteur>0 / 1000</span>
        </div>
        <textarea id="${id("bio")}" maxlength="1000" rows="5" placeholder="Votre parcours, ce que vous aimez dans le métier…" data-champ="bio"></textarea>
        <p class="champ-aide">Lue quand un visiteur ouvre votre profil sur la page équipe.</p>
      </div>
      <div class="profil-pied">
        <div data-zone-message role="status"></div>
        <button type="submit" class="btn btn-or" data-enregistrer>Enregistrer</button>
      </div>
    </form>`;
  const q = s => conteneur.querySelector(`[${s}]`);
  const champ = c => conteneur.querySelector(`[data-champ="${c}"]`);
  const etat = { photo: '', edition: 0, transfert: null, enregistrement: false, nomInitial: '' };

  const erreurPhoto = texte => { q('data-erreur-photo').textContent = texte || ''; q('data-erreur-photo').classList.toggle('cache', !texte); };
  const compteur = () => { q('data-compteur').textContent = `${champ('bio').value.length} / 1000`; };
  const nomAffiche = () => (avecNom ? champ('nom').value.trim() : nom() || '');   // Mon profil : le champ fait foi, même vide
  const prevenir = () => surChangement?.({
    nom: nomAffiche(), poste: champ('poste').value.trim(), specialite: champ('specialite').value.trim(),
    bio: champ('bio').value.trim(), photo: etat.photo, envoi: !!etat.transfert,
  });

  function dessiner() {
    const apercu = q('data-apercu');
    apercu.textContent = '';
    if (etat.photo) {
      const img = document.createElement('img');
      img.src = etat.photo;
      img.alt = 'Photo de profil';
      apercu.append(img);
    } else {
      const initiales = document.createElement('span');
      initiales.textContent = String(nomAffiche() || '?').trim().split(/\s+/).slice(0, 2).map(m => m[0]?.toUpperCase()).join('') || '?';
      apercu.append(initiales);
    }
    apercu.style.opacity = etat.transfert ? '0.5' : '';
    apercu.setAttribute('aria-busy', String(!!etat.transfert));
    q('data-changer').textContent = etat.transfert ? 'Envoi de la photo…' : etat.photo ? 'Changer la photo' : 'Ajouter une photo';
    q('data-changer').disabled = etat.enregistrement;
    q('data-retirer').textContent = etat.transfert ? 'Annuler l’envoi' : 'Retirer';
    q('data-retirer').classList.toggle('cache', !etat.photo && !etat.transfert);
    q('data-retirer').disabled = etat.enregistrement;
    if (!etat.enregistrement) q('data-enregistrer').disabled = !!etat.transfert;
    prevenir();
  }

  function annulerTransfert() {
    etat.edition++;
    etat.transfert?.abort();
    etat.transfert = null;
  }

  // envoi d'un fichier ; une nouvelle sélection remplace l'envoi en cours
  async function envoyer(source) {
    if (etat.enregistrement) return;
    annulerTransfert();
    const edition = etat.edition, controleur = new AbortController();
    etat.transfert = controleur;
    erreurPhoto('');
    dessiner();
    try {
      const init = { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controleur.signal, body: new FormData() };
      init.body.append('image', source);
      const r = await fetch('/api/profil/photo', init);
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error && !/^[a-z-]+$/.test(data.error) ? data.error : 'L’envoi de la photo a échoué.');
      if (edition === etat.edition) etat.photo = data.url;
    } catch (e) {
      if (edition === etat.edition && e.name !== 'AbortError') erreurPhoto(e.message || 'Connexion au serveur perdue pendant l’envoi.');
    } finally {
      if (edition === etat.edition) { etat.transfert = null; dessiner(); }
    }
  }

  q('data-changer').addEventListener('click', () => q('data-fichier').click());
  q('data-fichier').addEventListener('change', e => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    if (fichier.size > 15 * 1024 * 1024) { erreurPhoto('Image trop lourde (15 Mo au plus).'); return; }
    envoyer(fichier);
  });
  q('data-retirer').addEventListener('click', () => { if (etat.transfert) annulerTransfert(); else etat.photo = ''; dessiner(); });
  q('data-formulaire').addEventListener('input', () => { compteur(); if (avecNom) dessiner(); else prevenir(); });

  q('data-formulaire').addEventListener('submit', async e => {
    e.preventDefault();
    const zone = q('data-zone-message');
    gestion.message(zone, '');
    if (etat.transfert) { gestion.message(zone, 'Attendez la fin de l’envoi de la photo avant d’enregistrer.'); return; }
    if (avecNom) {
      const vide = !champ('nom').value.trim();
      q('data-erreur-nom').classList.toggle('cache', !vide);
      if (vide) { champ('nom').focus(); return; }
    }
    const bouton = q('data-enregistrer'), texte = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';
    etat.enregistrement = true;
    dessiner();
    try {
      // le nom RP (compte, socle) puis la fiche publique (entreprise) : un seul bouton pour ce qui finit sur la même carte
      if (avecNom && champ('nom').value.trim() !== etat.nomInitial) {
        await socle.api('/api/moi', { method: 'PATCH', body: { nom: champ('nom').value.trim() } });
        etat.nomInitial = champ('nom').value.trim();
      }
      const p = await socle.api(adresse, { method: 'PUT', body: { poste: champ('poste').value, specialite: champ('specialite').value, bio: champ('bio').value, photo: etat.photo } });
      etat.photo = p.photo;
      gestion.message(zone, 'Enregistré ✓ Déjà visible sur la page équipe.', 'succes');
      apresEnregistrement?.(p);
    } catch (err) {
      gestion.message(zone, err.message);
    } finally {
      etat.enregistrement = false;
      bouton.disabled = false;
      bouton.textContent = texte;
      dessiner();
    }
  });

  return {
    async charger() {
      annulerTransfert();
      erreurPhoto('');
      gestion.message(q('data-zone-message'), '');
      if (avecNom) { champ('nom').value = champNom || ''; etat.nomInitial = (champNom || '').trim(); }
      try {
        const p = await socle.api(adresse);
        for (const c of ['poste', 'specialite', 'bio']) champ(c).value = p[c] || '';
        etat.photo = p.photo || '';
      } catch (e) { gestion.message(q('data-zone-message'), `Impossible de charger le profil : ${e.message}`); }
      compteur();
      dessiner();
    },
    fermer() { annulerTransfert(); dessiner(); },
  };
}
