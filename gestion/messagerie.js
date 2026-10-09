/* GESTION — messagerie interne (widget « façon MSN »), présente sur toutes les pages de l'espace agents : démarrée par
   gestion.coque(). Serveur : server/src/entreprise/routes/messagerie.ts. Pas de temps réel : le widget interroge le
   serveur toutes les 4 secondes (seulement dans un onglet visible), largement assez réactif pour une messagerie d'équipe.
   Les conversations ouvertes sont retenues pour la session de l'onglet (sessionStorage) : changer de page de la
   gestion les rouvre telles quelles. */
const MESSAGERIE = {
  moi: null,
  monStatut: 'disponible',
  contacts: [],
  recherche: '',
  fenetres: [],              // [{ membreId, pseudo, avatar, statut, dernierId, minimisee }]
  premierChargement: true,
  nonLusPrecedent: 0,
  audio: null,
};
const MESSAGERIE_MAX_FENETRES = 3;
const MESSAGERIE_INTERVALLE_MS = 4000;
const MESSAGERIE_STATUTS = { disponible: 'Disponible', absent: 'Absent', occupe: 'Ne pas déranger', invisible: 'Invisible', hors_ligne: 'Hors ligne' };
const libelleStatut = s => MESSAGERIE_STATUTS[s] || 'Hors ligne';
const initialesMessagerie = nom => String(nom || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0].toUpperCase()).join('') || '?';
const mid = id => document.getElementById(id);

// fenêtres ouvertes, retenues pour l'onglet (stockage indisponible : on s'en passe)
function memoriserFenetres() {
  try { sessionStorage.setItem('d8-messagerie', JSON.stringify(MESSAGERIE.fenetres.map(({ membreId, pseudo, avatar, minimisee }) => ({ membreId, pseudo, avatar, minimisee })))); } catch { /* rien */ }
}
function fenetresMemorisees() {
  try { const v = JSON.parse(sessionStorage.getItem('d8-messagerie') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

// petit « ding » synthétisé : deux notes pour un message, quatre pour un clin d'œil
function jouerSon(type) {
  try {
    MESSAGERIE.audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = MESSAGERIE.audio;
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    for (const freq of type === 'clin_oeil' ? [440, 660, 440, 660] : [660, 880]) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.11;
    }
  } catch { /* audio indisponible : jamais bloquant */ }
}
function secouer(el) {
  if (!el) return;
  el.classList.add('messagerie-secousse');
  setTimeout(() => el.classList.remove('messagerie-secousse'), 500);
}
const avatarMessagerie = c => (c.avatar ? `<img src="${echapper(c.avatar)}" alt="" class="messagerie-avatar-img">` : `<span class="messagerie-avatar">${echapper(initialesMessagerie(c.pseudo))}</span>`);

// ---- liste de contacts ----

async function chargerContacts() {
  try {
    const data = await socle.api('/api/messagerie/contacts');
    MESSAGERIE.monStatut = data.statut || 'disponible';
    MESSAGERIE.contacts = data.contacts || [];
    const total = MESSAGERIE.contacts.reduce((s, c) => s + (c.non_lus || 0), 0);
    if (!MESSAGERIE.premierChargement && total > MESSAGERIE.nonLusPrecedent) { jouerSon('texte'); secouer(mid('messagerie-bouton-liste')); }
    MESSAGERIE.nonLusPrecedent = total;
    MESSAGERIE.premierChargement = false;
    majMonStatut();
    rendreContacts();
    const badge = mid('messagerie-badge-total');
    badge.textContent = total > 9 ? '9+' : String(total);
    badge.classList.toggle('cache', !total);
    for (const f of MESSAGERIE.fenetres) {
      const c = MESSAGERIE.contacts.find(x => x.id === f.membreId);
      if (c) majEnteteFenetre(f, c.statut);
    }
  } catch { /* un sondage raté (coupure réseau) n'interrompt jamais le travail */ }
}

function rendreContacts() {
  const conteneur = mid('messagerie-contacts');
  const q = MESSAGERIE.recherche.trim().toLowerCase();
  const liste = MESSAGERIE.contacts.filter(c => !q || c.pseudo.toLowerCase().includes(q));
  if (!liste.length) {
    conteneur.innerHTML = `<div class="messagerie-vide">${MESSAGERIE.contacts.length ? 'Aucun contact ne correspond à votre recherche.' : 'Aucun autre membre pour le moment.'}</div>`;
    return;
  }
  conteneur.innerHTML = liste.map(c => `
    <button type="button" class="messagerie-contact" data-id="${c.id}">
      <span class="messagerie-avatar-bloc">${avatarMessagerie(c)}<span class="messagerie-pastille messagerie-statut-${c.statut}" title="${libelleStatut(c.statut)}"></span></span>
      <span class="messagerie-contact-texte">
        <strong>${echapper(c.pseudo)}</strong>
        <span class="messagerie-contact-apercu">${c.dernier_message ? echapper(c.dernier_message) : libelleStatut(c.statut)}</span>
      </span>
      ${c.non_lus ? `<span class="messagerie-badge">${c.non_lus > 9 ? '9+' : c.non_lus}</span>` : ''}
    </button>`).join('');
  conteneur.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => {
    const c = MESSAGERIE.contacts.find(x => x.id === Number(btn.dataset.id));
    if (c) ouvrirFenetre(c);
  }));
}

function majMonStatut() {
  mid('mon-statut-pastille').className = `messagerie-pastille messagerie-statut-${MESSAGERIE.monStatut}`;
  mid('mon-statut-texte').textContent = libelleStatut(MESSAGERIE.monStatut);
}

// ---- fenêtres de conversation (plusieurs à la fois) ----

function brancherFenetre(etat) {
  const id = etat.membreId, div = mid(`messagerie-fenetre-${id}`);
  div.querySelector('.messagerie-fenetre-entete').addEventListener('click', () => basculerReduction(id));
  div.querySelector('[data-reduire-bouton]').addEventListener('click', e => { e.stopPropagation(); basculerReduction(id); });
  div.querySelector('[data-fermer]').addEventListener('click', e => { e.stopPropagation(); fermerFenetre(id); });
  const champ = mid(`messagerie-champ-${id}`), form = mid(`messagerie-form-${id}`);
  let dernierEnvoiFrappe = 0;
  champ.addEventListener('input', () => {
    if (Date.now() - dernierEnvoiFrappe > 1500) {
      dernierEnvoiFrappe = Date.now();
      socle.api('/api/messagerie/frappe', { method: 'POST', body: { avec: id } }).catch(() => {});
    }
  });
  champ.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const contenu = champ.value.trim();
    if (!contenu) return;
    champ.value = '';
    await envoyerMessage(etat, 'texte', contenu);
  });
  mid(`messagerie-clin-oeil-${id}`).addEventListener('click', () => envoyerMessage(etat, 'clin_oeil', ''));
}

function ouvrirFenetre(contact, { focus = true, minimisee = false } = {}) {
  let etat = MESSAGERIE.fenetres.find(f => f.membreId === contact.id);
  if (etat) {
    etat.minimisee = false;
    majReduction(etat);
    if (focus) mid(`messagerie-champ-${contact.id}`)?.focus();
    return;
  }
  // fenêtres de 300 px côte à côte : 2 seulement sur un écran moyen (3 dépasseraient à gauche, hors d'atteinte)
  const max = window.innerWidth < 640 ? 1 : window.innerWidth < 1000 ? 2 : MESSAGERIE_MAX_FENETRES;
  if (MESSAGERIE.fenetres.length >= max) fermerFenetre(MESSAGERIE.fenetres[0].membreId);
  etat = { membreId: contact.id, pseudo: contact.pseudo, avatar: contact.avatar, statut: contact.statut || 'hors_ligne', dernierId: 0, minimisee };
  MESSAGERIE.fenetres.push(etat);
  const div = document.createElement('div');
  div.className = 'messagerie-fenetre';
  div.id = `messagerie-fenetre-${etat.membreId}`;
  div.innerHTML = `
    <div class="messagerie-fenetre-entete">
      <span class="messagerie-pastille messagerie-statut-${etat.statut}"></span>
      <div class="messagerie-fenetre-titre"><strong>${echapper(etat.pseudo)}</strong><span class="messagerie-fenetre-statut-texte">${libelleStatut(etat.statut)}</span></div>
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
  mid('messagerie-fenetres').append(div);
  brancherFenetre(etat);
  majReduction(etat);
  if (focus) mid('messagerie-liste').classList.add('cache');   // place à la conversation
  memoriserFenetres();
  chargerMessages(etat, true);
}

function fermerFenetre(membreId) {
  MESSAGERIE.fenetres = MESSAGERIE.fenetres.filter(f => f.membreId !== membreId);
  mid(`messagerie-fenetre-${membreId}`)?.remove();
  memoriserFenetres();
}
function basculerReduction(membreId) {
  const etat = MESSAGERIE.fenetres.find(f => f.membreId === membreId);
  if (!etat) return;
  etat.minimisee = !etat.minimisee;
  majReduction(etat);
  memoriserFenetres();
}
function majReduction(etat) { mid(`messagerie-fenetre-${etat.membreId}`)?.classList.toggle('messagerie-reduite', etat.minimisee); }

function majEnteteFenetre(etat, statut) {
  etat.statut = statut;
  const div = mid(`messagerie-fenetre-${etat.membreId}`);
  if (!div) return;
  const pastille = div.querySelector('.messagerie-fenetre-entete .messagerie-pastille');
  if (pastille) pastille.className = `messagerie-pastille messagerie-statut-${statut}`;
  const texte = div.querySelector('.messagerie-fenetre-statut-texte');
  if (texte) texte.textContent = libelleStatut(statut);
}

const heureMessage = brut => { const d = new Date(brut); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }); };
function bulle(m) {
  const mien = Number(m.expediteur_id) === Number(MESSAGERIE.moi.id);
  if (m.type === 'clin_oeil') return `<div class="messagerie-clin-oeil-ligne">👋 ${mien ? 'Vous avez envoyé un clin d’œil' : 'a envoyé un clin d’œil'}</div>`;
  return `<div class="messagerie-bulle-ligne ${mien ? 'messagerie-mien' : ''}"><div class="messagerie-bulle">${echapper(m.contenu).replace(/\n/g, '<br>')}</div><span class="messagerie-heure">${heureMessage(m.envoye_le)}</span></div>`;
}

function ajouterMessages(etat, messages, forcerDefilement) {
  const corps = mid(`messagerie-corps-${etat.membreId}`);
  if (!corps) return;
  const etaitEnBas = corps.scrollHeight - corps.scrollTop - corps.clientHeight < 40;
  for (const m of messages) {
    corps.insertAdjacentHTML('beforeend', bulle(m));
    if (typeof m.id === 'number' && m.id > etat.dernierId) etat.dernierId = m.id;
  }
  if (forcerDefilement || etaitEnBas) corps.scrollTop = corps.scrollHeight;
}

async function chargerMessages(etat, initial) {
  try {
    const data = await socle.api(`/api/messagerie/messages?avec=${etat.membreId}&apres_id=${etat.dernierId}`);
    if (!MESSAGERIE.fenetres.includes(etat)) return;   // fenêtre fermée pendant la requête
    const nouveaux = data.messages || [];
    // reçus dans une conversation ouverte : lus (le badge des contacts suit au sondage suivant)
    if (nouveaux.some(m => Number(m.expediteur_id) !== Number(MESSAGERIE.moi.id))) socle.api('/api/messagerie/lus', { method: 'POST', body: { avec: etat.membreId } }).catch(() => {});
    if (nouveaux.length) {
      ajouterMessages(etat, nouveaux, initial);
      const recus = initial ? [] : nouveaux.filter(m => Number(m.expediteur_id) !== Number(MESSAGERIE.moi.id));
      if (recus.length) {
        const clin = recus.some(m => m.type === 'clin_oeil');
        jouerSon(clin ? 'clin_oeil' : 'texte');
        if (clin) secouer(mid(`messagerie-fenetre-${etat.membreId}`));
      }
    }
    majEnteteFenetre(etat, data.statut || etat.statut);
    mid(`messagerie-frappe-${etat.membreId}`)?.classList.toggle('cache', !data.frappe);
  } catch { /* nouvel essai au prochain sondage */ }
}

async function envoyerMessage(etat, type, contenu) {
  try {
    const r = await socle.api('/api/messagerie/messages', { method: 'POST', body: { avec: etat.membreId, type, contenu } });
    ajouterMessages(etat, [{ id: r.id, expediteur_id: MESSAGERIE.moi.id, type, contenu, envoye_le: new Date().toISOString() }], true);
  } catch (e) {
    ajouterMessages(etat, [{ id: `e${Date.now()}`, expediteur_id: MESSAGERIE.moi.id, type: 'texte', contenu: `⚠ Message non envoyé : ${e.message}`, envoye_le: new Date().toISOString() }], true);
  }
}

// ---- construction du widget et démarrage ----

function demarrerMessagerie(moi) {
  MESSAGERIE.moi = moi;
  const nom = moi.nom || moi.pseudo;
  const widget = document.createElement('div');
  widget.className = 'messagerie-widget';
  widget.id = 'messagerie-widget';
  widget.innerHTML = `
    <div class="messagerie-liste cache" id="messagerie-liste">
      <div class="messagerie-liste-entete">
        <div class="messagerie-mon-statut">
          <span class="messagerie-avatar">${echapper(initialesMessagerie(nom))}</span>
          <div>
            <strong>${echapper(nom)}</strong>
            <div class="messagerie-statut-menu">
              <button type="button" class="messagerie-statut-bouton" id="bouton-mon-statut" aria-haspopup="true" aria-expanded="false">
                <span class="messagerie-pastille" id="mon-statut-pastille"></span> <span id="mon-statut-texte">Disponible</span> ▾
              </button>
              <div class="messagerie-statut-options cache" id="menu-mon-statut">
                <button type="button" data-statut="disponible"><span class="messagerie-pastille messagerie-statut-disponible"></span> Disponible</button>
                <button type="button" data-statut="absent"><span class="messagerie-pastille messagerie-statut-absent"></span> Absent</button>
                <button type="button" data-statut="occupe"><span class="messagerie-pastille messagerie-statut-occupe"></span> Ne pas déranger</button>
                <button type="button" data-statut="invisible"><span class="messagerie-pastille messagerie-statut-invisible"></span> Apparaître hors ligne</button>
              </div>
            </div>
          </div>
          <button type="button" class="messagerie-fermer" id="messagerie-fermer-liste" aria-label="Fermer la messagerie">✕</button>
        </div>
        <input type="search" class="messagerie-recherche" id="messagerie-recherche" placeholder="🔎 Rechercher un contact…">
      </div>
      <div class="messagerie-contacts" id="messagerie-contacts"></div>
    </div>
    <div class="messagerie-fenetres" id="messagerie-fenetres"></div>
    <button type="button" class="messagerie-lanceur" id="messagerie-bouton-liste" aria-label="Ouvrir la messagerie">
      <svg class="messagerie-lanceur-icone" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
      </svg>
      <span class="messagerie-badge cache" id="messagerie-badge-total">0</span>
    </button>`;
  document.body.append(widget);

  mid('messagerie-bouton-liste').addEventListener('click', () => mid('messagerie-liste').classList.toggle('cache'));
  mid('messagerie-fermer-liste').addEventListener('click', () => mid('messagerie-liste').classList.add('cache'));
  mid('messagerie-recherche').addEventListener('input', e => { MESSAGERIE.recherche = e.target.value; rendreContacts(); });
  const boutonStatut = mid('bouton-mon-statut'), menu = mid('menu-mon-statut');
  boutonStatut.addEventListener('click', e => {
    e.stopPropagation();
    const ouvrir = menu.classList.contains('cache');
    menu.classList.toggle('cache', !ouvrir);
    boutonStatut.setAttribute('aria-expanded', String(ouvrir));
  });
  menu.querySelectorAll('[data-statut]').forEach(btn => btn.addEventListener('click', async () => {
    menu.classList.add('cache');
    MESSAGERIE.monStatut = btn.dataset.statut;
    majMonStatut();
    try { await socle.api('/api/messagerie/statut', { method: 'PUT', body: { statut: btn.dataset.statut } }); } catch { /* resynchronisé au prochain sondage */ }
  }));
  document.addEventListener('click', e => {
    if (!menu.classList.contains('cache') && !menu.contains(e.target) && e.target !== boutonStatut) { menu.classList.add('cache'); boutonStatut.setAttribute('aria-expanded', 'false'); }
  });

  // conversations ouvertes avant le changement de page
  for (const f of fenetresMemorisees()) if (Number.isInteger(f.membreId)) ouvrirFenetre({ id: f.membreId, pseudo: String(f.pseudo || ''), avatar: String(f.avatar || '') }, { focus: false, minimisee: !!f.minimisee });
  chargerContacts();
  // onglet caché : aucun sondage (chaque requête compte dans la limite de l'API du compte, tous onglets confondus) ;
  // rafraîchi dès son retour
  const sonder = () => {
    if (document.hidden) return;
    chargerContacts();
    for (const etat of MESSAGERIE.fenetres) chargerMessages(etat, false);
  };
  setInterval(sonder, MESSAGERIE_INTERVALLE_MS);
  document.addEventListener('visibilitychange', sonder);
}
