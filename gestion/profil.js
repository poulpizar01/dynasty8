/* GESTION — éditeur du profil public d'un agent (page « Notre équipe » de la vitrine) : photo (fichier ou lien),
   poste, spécialité, biographie. Utilisé par « Mon profil » (compte.html) et par la Direction (comptes.html).
   Serveur : server/src/entreprise/routes/profils.ts.
     const editeur = profilEditeur(conteneur, { adresse: '/api/profil', nom: () => 'Prénom Nom', apresEnregistrement });
     await editeur.charger();
   La photo est envoyée dès sa sélection (le serveur la contrôle et la convertit), puis enregistrée avec le reste du
   profil : tant que « Enregistrer » n'a pas réussi, l'ancienne photo reste celle du site. */
function profilEditeur(conteneur, { adresse, nom, apresEnregistrement }) {
  conteneur.innerHTML = `
    <div data-zone-message></div>
    <div class="profil-mise-en-page">
      <div class="profil-photo-bloc">
        <div class="profil-photo-apercu" data-apercu></div>
        <button type="button" class="btn btn-fantome btn-petit" data-changer>📁 Changer la photo</button>
        <input type="file" accept="image/jpeg,image/png,image/webp" class="cache" data-fichier>
        <button type="button" class="btn btn-fantome btn-petit cache" data-retirer>✕ Retirer la photo</button>
        <p class="champ-erreur cache" data-erreur-photo></p>
        <p class="champ-aide" style="text-align:center;">Format carré recommandé — JPG, PNG ou WEBP.</p>
      </div>
      <form data-formulaire>
        <div class="champ">
          <label>Intitulé du poste</label>
          <input type="text" maxlength="80" placeholder="Ex : Agent — Habitation" data-champ="poste">
          <p class="champ-aide">Affiché sous le nom, sur la page équipe du site. Vide : le grade.</p>
        </div>
        <div class="champ">
          <label>Spécialité</label>
          <input type="text" maxlength="100" placeholder="Ex : Villas & Maisons" data-champ="specialite">
        </div>
        <div class="champ">
          <label>Biographie</label>
          <textarea maxlength="1000" placeholder="Quelques lignes : parcours, ce que vous aimez chez Dynasty 8…" data-champ="bio"></textarea>
          <p class="champ-aide" data-compteur>0 / 1000</p>
        </div>
        <button type="submit" class="btn btn-or" data-enregistrer>Enregistrer le profil</button>
      </form>
    </div>`;
  const q = s => conteneur.querySelector(`[${s}]`);
  const champ = n => conteneur.querySelector(`[data-champ="${n}"]`);
  const etat = { photo: '', edition: 0, transfert: null, enregistrement: false };

  const erreurPhoto = texte => { q('data-erreur-photo').textContent = texte || ''; q('data-erreur-photo').classList.toggle('cache', !texte); };
  const compteur = () => { q('data-compteur').textContent = `${champ('bio').value.length} / 1000`; };

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
      initiales.textContent = String(nom() || '?').trim().split(/\s+/).slice(0, 2).map(m => m[0]?.toUpperCase()).join('') || '?';
      apercu.append(initiales);
    }
    apercu.style.opacity = etat.transfert ? '0.5' : '';
    apercu.setAttribute('aria-busy', String(!!etat.transfert));
    q('data-changer').textContent = etat.transfert ? '⏳ Envoi de la photo…' : '📁 Changer la photo';
    q('data-changer').disabled = etat.enregistrement;
    q('data-retirer').textContent = etat.transfert ? '✕ Annuler l’envoi' : '✕ Retirer la photo';
    q('data-retirer').classList.toggle('cache', !etat.photo && !etat.transfert);
    q('data-retirer').disabled = etat.enregistrement;
    if (!etat.enregistrement) q('data-enregistrer').disabled = !!etat.transfert;
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
    if (fichier.size > 15 * 1024 * 1024) { erreurPhoto('Image trop lourde (15 Mo max).'); return; }
    envoyer(fichier);
  });
  q('data-retirer').addEventListener('click', () => { if (etat.transfert) annulerTransfert(); else etat.photo = ''; dessiner(); });
  champ('bio').addEventListener('input', compteur);

  q('data-formulaire').addEventListener('submit', async e => {
    e.preventDefault();
    gestion.message(q('data-zone-message'), '');
    if (etat.transfert) { gestion.message(q('data-zone-message'), 'Attendez la fin de l’envoi de la photo avant d’enregistrer.'); return; }
    const bouton = q('data-enregistrer'), texte = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Enregistrement…';
    etat.enregistrement = true;
    dessiner();
    try {
      const p = await socle.api(adresse, { method: 'PUT', body: { poste: champ('poste').value, specialite: champ('specialite').value, bio: champ('bio').value, photo: etat.photo } });
      etat.photo = p.photo;
      gestion.message(q('data-zone-message'), 'Profil enregistré ✓ Les changements sont déjà visibles sur la page équipe du site.', 'succes');
      apresEnregistrement?.(p);
    } catch (err) {
      gestion.message(q('data-zone-message'), err.message);
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
      try {
        const p = await socle.api(adresse);
        for (const n of ['poste', 'specialite', 'bio']) champ(n).value = p[n] || '';
        etat.photo = p.photo || '';
      } catch (e) { gestion.message(q('data-zone-message'), `Impossible de charger le profil : ${e.message}`); }
      compteur();
      dessiner();
    },
    fermer() { annulerTransfert(); dessiner(); },
  };
}
