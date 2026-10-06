// ============================================================================
// Dynasty 8 — guides de cohérence (contenu unique, écrit ici une fois)
// ----------------------------------------------------------------------------
// Chargé par la page publique /coherence.html ET par l'onglet « Cohérences »
// de l'espace agents : les deux affichent donc exactement le même règlement.
// Le contenu est volontairement écrit dans ce fichier, pas réglable depuis le
// site : il se modifie ici. Dépend de echapper() (layout.js).
// ============================================================================

// Contenu des guides de cohérence : règlement officiel Dynasty 8, repris des fiches
// de référence de l'agence pour chaque zone / type de bien. Trois formats de bloc :
//  - "regles"     : liste de règles à puces
//  - "biens"      : grille de biens avec tarifs (achat / location / coffre)
//  - "interieurs" : grille "type de bâtiment -> intérieurs possibles"
const GUIDES_COHERENCE = {
  "Habitation": {
    icone: "🏠",
    slug: "habitation",
    nbSlides: 26,
    gslideId: "16zKe1r6JM_0afDDEyDDUBjec7ZZPlj25rBh6zG28bD0",
    intro: "La cohérence Habitation atteste que votre personnage dispose d'un logement légal à Los Santos, avec un intérieur cohérent par rapport au bâtiment choisi.",
    sections: [
      {
        titre: "Rappels importants",
        type: "regles",
        items: [
          "Tout bien loué doit être reloué avant sa date d'échéance, sous peine de perdre l'habitation et vos coffres si quelqu'un achète la porte.",
          "Toutes les portes barricadées sont invendables.",
          "Les maisons de type Maison 2 à 8 doivent impérativement avoir un garage 2 places minimum lié.",
          "Dans les zones Flat 2 et Flat 3, un porche pouvant accueillir un garage 2 places n'est pas obligatoire à l'achat, mais aucun retour en arrière n'est possible si vous changez d'avis plus tard.",
          "Toute habitation doit être liée à son garage au moment de l'achat ou de la location : impossible de l'ajouter après coup.",
          "Toute autre habitation possédant un garage dans sa structure doit obligatoirement lui être liée.",
          "Une porte de garage ne peut contenir un entrepôt que si le garage est surélevé d'une marche de la taille d'un escalier.",
          "Toute location ou vente d'un bien en zone d'entreprise doit être faite au nom de l'entreprise.",
        ],
      },
      {
        titre: "Autorisation — entreprises & familles officielles",
        type: "regles",
        items: [
          "La validation écrite de votre référent attitré est obligatoire.",
          "Une photo de la porte concernée est exigée.",
          "Le type d'habitation souhaité ainsi que la raison doivent être précisés.",
          "Une photo du GPS ou du /getpos est nécessaire.",
          "En cas de doute, l'agence vérifie que la personne est bien dans le référencement concerné.",
        ],
      },
      {
        titre: "Motels & caravanes",
        type: "biens",
        items: [
          { nom: "Motel", location: "2 525$", coffre: "150 kg", note: "Bâtiment à multiples portes côte à côte, souvent une cour intérieure. Ne peut pas être relié à un garage en dehors d'un multipoint." },
          { nom: "Caravane meublée", location: "5 250$", coffre: "150 kg", note: "Disponible uniquement à la location, dans le nord. Un seul intérieur possible même si d'autres portes existent." },
          { nom: "Caravane non meublée", location: "5 250$", coffre: "150 kg", note: "Garage 2 places possible même sans porte de garage." },
        ],
      },
      {
        titre: "Lester & Flats",
        type: "biens",
        items: [
          { nom: "Lester", achat: "43 750$", location: "5 250$", coffre: "250 kg", note: "Petite maison de plain-pied, Sandy Shore et quartiers pauvres. Garage 2 places possible même sans porte." },
          { nom: "Flat 1", achat: "52 500$ HT", location: "7 000$ HT", coffre: "250 kg", note: "Quartiers pauvres et quartiers gangs. Garage 2 places possible même sans porte." },
          { nom: "Flat 1 non meublé", achat: "61 250$ HT", location: "7 000$ HT", coffre: "350 kg" },
          { nom: "Flat 2", achat: "35 000$ HT", location: "4 375$ HT", coffre: "200 kg", note: "Zone Vinewood. Garage 2 places possible sous les porches, si une place est libre." },
          { nom: "Flat 3", achat: "61 250$ HT", location: "7 000$ HT", coffre: "350 kg", note: "Bord de mer, canaux de Vespucci et Roxwood. Garage 2 ou 6 places selon les portes disponibles. Emplacement limité à certaines zones." },
          { nom: "Flat 3 non meublé", achat: "61 250$ HT", location: "7 000$ HT", coffre: "350 kg" },
        ],
      },
      {
        titre: "Maisons",
        type: "biens",
        items: [
          { nom: "Maison 1 non meublée", achat: "43 750$ HT", location: "5 250$ HT", coffre: "250 kg", note: "Logement « passe-partout » autour de la place des Cubes, utilisé quand aucun autre bien ne correspond." },
          { nom: "Maison 2", achat: "61 250$ HT", location: "8 750$ HT", coffre: "350 kg", note: "Mirror Park, Sandy Shore, Île de Paleto, Roxwood. Garage 2 places minimum obligatoire si une porte est disponible ; garage 6 places possible sous porche dans le nord." },
          { nom: "Maison 2 non meublée", achat: "61 250$ HT", location: "8 750$ HT", coffre: "350 kg" },
          { nom: "Maisons 3 à 5", achat: "262 500$ HT", location: "13 125$ HT", coffre: "400 kg" },
          { nom: "Maisons 6 à 8", achat: "210 000$ HT", location: "10 500$ HT", coffre: "350 kg", note: "Alternatives à la Maison 2, avec un aménagement différent." },
        ],
      },
      {
        titre: "Appartements",
        type: "biens",
        items: [
          { nom: "Appartements non meublés 1 à 4", achat: "385 000$ HT", location: "19 250$ HT", coffre: "500 kg", note: "Immeubles propres en ville. Les versions 3 et 4 peuvent être placées sur des biens type Maison 2." },
          { nom: "Petit appartement non meublé 3", achat: "200 000$ HT", location: "10 000$ HT", coffre: "300 kg" },
          { nom: "Petit appartement non meublé 4", achat: "215 000$ HT", location: "10 500$ HT", coffre: "300 kg" },
          { nom: "Petit appartement non meublé 5", achat: "230 000$ HT", location: "11 000$ HT", coffre: "300 kg" },
          { nom: "Petits appartements non meublés 6 à 8", achat: "250 000$ HT", location: "13 000$ HT", coffre: "300 kg", note: "Sur des maisons, bâtiments propres et certains Flat 3 modernes à une seule porte." },
        ],
      },
      {
        titre: "Villas & Ranch",
        type: "biens",
        items: [
          { nom: "Villa 1 à 9 (+ non meublée)", achat: "1 750 000$ HT", location: "175 000$ HT", coffre: "550 kg", note: "Hauteurs de Vinewood et bord de mer vers Paleto. Une porte de garage : 10 ou 25 places. Deux portes : un 25 places (deux portes condamnées) ou deux 10 places. 1 entrepôt possible par villa (500 kg, 1T ou 1T5)." },
          { nom: "Villa Michael & Franklin", achat: "3 500 000$ HT", location: "175 000$ HT", coffre: "550 kg", note: "Mêmes règles de cohérence que les Villas 1 à 9, seul le prix d'achat change." },
          { nom: "Ranch", achat: "6 125 000$ HT", location: "175 000$ HT", coffre: "550 kg", note: "Fait partie des villas, mais réservé aux propriétés à l'architecture ancienne (bois, pierre)." },
        ],
      },
      {
        titre: "Duplex, Headquarters & Bureaux",
        type: "biens",
        items: [
          { nom: "Duplex / Duplex non meublé 1 à 8", achat: "875 000$ HT", location: "87 500$ HT", coffre: "500 kg", note: "Biens VIP, dans des buildings luxueux, principalement autour du Golf." },
          { nom: "Headquarter 1 à 4", achat: "3 500 000$ HT", location: "175 500$ HT", coffre: "750 kg", note: "Duplex + bureau réunis. Bien haut de gamme, parfait pour un siège d'entreprise." },
          { nom: "Bureau 1 & 6", achat: "35 000$ HT", location: "3 500$ HT", coffre: "750 kg", note: "Disponibles à l'achat et à la location pour les citoyens." },
          { nom: "Bureau 2 à 5", achat: "1 400 000$ HT", location: "70 000$ HT", coffre: "750 kg", note: "Réservés aux entreprises, dans des buildings luxueux." },
          { nom: "Penthouse", achat: "7 000 000$ HT", location: "262 500$ HT", coffre: "800 kg", note: "Uniquement dans les buildings les plus luxueux." },
        ],
      },
      {
        titre: "Commerces spéciaux (accord staff requis)",
        type: "biens",
        items: [
          { nom: "Bar", achat: "700 000$ HT", location: "35 000$ HT", coffre: "500 kg" },
          { nom: "Biker", achat: "525 000$ HT", location: "26 250$ HT", coffre: "500 kg" },
          { nom: "Tequila-la non meublé", achat: "700 000$ HT", location: "35 000$ HT", coffre: "500 kg" },
        ],
      },
      {
        titre: "Entrepôts, Plantation & Black Box",
        type: "biens",
        items: [
          { nom: "Petit entrepôt (500 kg)", location: "8 750$ HT", note: "Disponible uniquement à la location." },
          { nom: "Entrepôt moyen (1T)", location: "17 500$ HT", note: "Disponible uniquement à la location." },
          { nom: "Grand entrepôt (1T5, + version non meublée)", achat: "262 500$ HT", location: "61 250$ HT", note: "Réservé aux membres VIP PLUS." },
          { nom: "Plantation", achat: "50 000$ HT", coffre: "250 kg", note: "Uniquement à l'achat. Toujours au rez-de-chaussée : l'intérieur comprend un escalier vers un sous-sol, incohérent à l'étage." },
          { nom: "Black Box", coffre: "500 kg", note: "S'installe sur un entrepôt 1T5, un Multipoint ou un emplacement Duplex. Équivaut à l'espace de deux entrepôts 1T5." },
        ],
      },
    ],
  },
  "Garage": {
    icone: "🚗",
    slug: "garage",
    nbSlides: 7,
    gslideId: "1sf3yrdeyxgoltDHLmkUpC1iRajHRA18acsZjG63yoP8",
    intro: "La cohérence Garage relie la taille et le standing d'un bâtiment à sa capacité de stationnement réelle : un petit local ne peut pas justifier un grand parking, et inversement.",
    sections: [
      {
        titre: "Principe général",
        type: "regles",
        items: [
          "La taille ou le standing du bâtiment détermine la contenance maximale qu'il peut accueillir.",
          "Un petit bâtiment ou un entrepôt modeste ne peut pas contenir 20 places de stationnement : ce serait incohérent avec sa taille et son intérieur réel.",
          "Un gros bâtiment en zone industrielle peut accueillir de nombreux véhicules, mais ne correspond pas à un bâtiment luxueux : on n'y placera ni 20, ni 25 places.",
          "Un bâtiment haut de gamme avec 20 places implique une structure conséquente.",
          "Lors de la vente d'un garage, il faut toujours vérifier que la capacité demandée reste cohérente avec le bâtiment.",
        ],
      },
      {
        titre: "Placer un entrepôt à la place d'un garage",
        type: "regles",
        items: [
          "Le garage n'est pas accessible en voiture.",
          "La porte de garage se trouve en hauteur (marches trop hautes).",
          "Un objet ne peut pas être déplacé, RP parlant (par exemple une benne sans roulettes).",
          "La porte de garage n'est pas assez large.",
        ],
      },
      {
        titre: "Emplacements où rien ne peut être posé",
        type: "regles",
        items: [
          "La porte est tordue.",
          "La porte de garage porte une enseigne, dessus ou sur les côtés.",
          "La porte est barricadée.",
          "L'agent doit néanmoins toujours poser un garage lorsque c'est possible, pour permettre au client d'y ranger un Benson (hors Porsche).",
          "Sur un bâtiment avec une porte de garage intégrée (type Flat 2 / Flat 3), le garage doit obligatoirement être lié à l'habitation.",
        ],
      },
      {
        titre: "Tarifs des garages",
        type: "biens",
        items: [
          { nom: "Garage 2 places", achat: "26 250$", location: "1 750$" },
          { nom: "Garage 6 places", achat: "78 750$", location: "5 250$" },
          { nom: "Garage 10 places", achat: "131 250$", location: "8 750$" },
          { nom: "Garage 10 places VIP", achat: "131 250$", location: "8 750$" },
          { nom: "Garage 20 places VIP", achat: "262 500$", location: "17 500$", note: "Uniquement dans des buildings luxueux." },
          { nom: "Garage 25 places VIP", achat: "306 250$", location: "21 875$", note: "Zone luxueuse ou villa uniquement." },
        ],
      },
    ],
  },
  "Cayo Perico": {
    icone: "🏝️",
    slug: "cayo-perico",
    nbSlides: 5,
    gslideId: "1MvrINN7FmrbdDrDLQsMWadXXHjYEWXOundWPWRA5pkA",
    intro: "La cohérence Cayo Perico concerne les biens situés sur l'île de Cayo Perico, une zone de jeu à part avec ses propres intérieurs autorisés selon le type de bâtiment.",
    sections: [
      {
        titre: "Intérieurs possibles par type de bâtiment",
        type: "interieurs",
        items: [
          { titre: "Petite cabane", options: ["Motel", "Maison Cayo", "Maison 1 / non meublée"] },
          { titre: "Petite maison", options: ["Lester", "Maison 2 / non meublée", "Appartement non meublé 3 et 4"] },
          { titre: "Les grandes maisons", options: ["Maison 2 / non meublée", "Petit appartement non meublé 3 à 8", "Appartement non meublé 3 et 4"] },
        ],
      },
      {
        titre: "Zone réservée",
        type: "regles",
        items: [
          "La Villa de Cayo : aucune habitation n'est possible, toute demande sera refusée.",
        ],
      },
    ],
  },
  "Roxwood": {
    icone: "🌲",
    slug: "roxwood",
    nbSlides: 11,
    gslideId: "1-8UcXPy4TNC6VpnSpu9t3e0YghjF9okH__h3riJtV5M",
    intro: "La cohérence Roxwood concerne le secteur résidentiel de Roxwood, avec ses propres zones réservées et ses règles de garages spécifiques aux grandes villas du secteur.",
    sections: [
      {
        titre: "Emplacements interdits",
        type: "regles",
        items: [
          "Un garage sur une porte ouverte.",
          "Une habitation sur une façade de magasin.",
        ],
      },
      {
        titre: "Zones réservées — ventes interdites",
        type: "regles",
        items: [
          "Nouvelle Zone Roxwood et Ancienne Zone Roxwood : les ventes y sont interdites, sauf en Multipoint.",
          "Plusieurs villas du secteur : la vente en est interdite (seule la location reste possible).",
          "Toute la zone du circuit de course et de la piste d'aéroport : ventes interdites.",
          "Nouvelle Forêt de Roxwood : zone réservée.",
        ],
      },
      {
        titre: "Garages des villas Roxwood",
        type: "regles",
        items: [
          "Villa 1 à 11 et villa non meublée : possibilité de 4 garages 10 places, ou d'un garage 25 places plus deux garages 10 places.",
          "Les maisons à deux étages de ce type sont considérées comme des villas et suivent la même règle : un garage 25 places, ou deux garages 10 places si deux portes sont présentes.",
        ],
      },
      {
        titre: "Biens courants du secteur",
        type: "biens",
        items: [
          { nom: "Maison 2 et équivalents non meublés", achat: "61 250$", location: "8 750$", coffre: "350 kg" },
          { nom: "Maisons 3 à 5 / 6 à 8", achat: "210 000$ – 262 500$", location: "10 500$ – 13 125$", coffre: "350-400 kg" },
          { nom: "Petits appartements non meublés 3 à 8", achat: "200 000$ – 250 000$", location: "10 000$ – 13 000$", coffre: "300 kg" },
          { nom: "Appartements non meublés 3 & 4", achat: "385 000$", location: "19 250$", coffre: "500 kg" },
          { nom: "Motel", location: "2 525$", coffre: "150 kg", note: "Mêmes règles que le Motel de la cohérence Habitation." },
          { nom: "Flat 3 (+ non meublé)", achat: "61 250$", location: "7 000$", coffre: "350 kg" },
        ],
      },
    ],
  },
};

function rendreSectionCoherence(s) {
  if (s.type === "regles") {
    return `
      <div class="guide-bloc">
        <h3>${echapper(s.titre)}</h3>
        <ul class="guide-liste">${s.items.map((t) => `<li>${echapper(t)}</li>`).join("")}</ul>
      </div>`;
  }
  if (s.type === "biens") {
    return `
      <div class="guide-bloc">
        <h3>${echapper(s.titre)}</h3>
        <div class="guide-biens-grille">
          ${s.items.map((b) => `
            <div class="guide-bien-carte">
              <strong>${echapper(b.nom)}</strong>
              <div class="guide-bien-prix">
                ${b.achat ? `<span><em>Achat</em> ${echapper(b.achat)}</span>` : ""}
                ${b.location ? `<span><em>Location</em> ${echapper(b.location)}</span>` : ""}
                ${b.coffre ? `<span><em>Coffre</em> ${echapper(b.coffre)}</span>` : ""}
              </div>
              ${b.note ? `<p class="guide-bien-note">${echapper(b.note)}</p>` : ""}
            </div>`).join("")}
        </div>
      </div>`;
  }
  if (s.type === "interieurs") {
    return `
      <div class="guide-bloc">
        <h3>${echapper(s.titre)}</h3>
        <div class="guide-biens-grille">
          ${s.items.map((it) => `
            <div class="guide-bien-carte">
              <strong>${echapper(it.titre)}</strong>
              <p class="guide-interieur-options">${it.options.map(echapper).join(" · ")}</p>
              ${it.note ? `<p class="guide-bien-note">${echapper(it.note)}</p>` : ""}
            </div>`).join("")}
        </div>
      </div>`;
  }
  return "";
}

const ZONES_COHERENCE = Object.keys(GUIDES_COHERENCE);

// Résumé écrit d'une cohérence (tous ses blocs).
function rendreResumeCoherence(zone) {
  return GUIDES_COHERENCE[zone].sections.map(rendreSectionCoherence).join("");
}

// Diaporama du guide officiel : chaque diapositive a été convertie en image
// (Google bloque l'affichage direct de ses présentations « Slides » dans une
// page tierce tant qu'elles ne sont pas explicitement publiées sur le web).
// Ce visualiseur maison les affiche donc comme des images classiques : ça
// fonctionne pour tout le monde, sans dépendre de Google ni ouvrir une autre
// fenêtre. Construit le diaporama dans `conteneur` (flèches, clavier ← →,
// balayage tactile).
function monterDiaporamaCoherence(conteneur, zone) {
  const guide = GUIDES_COHERENCE[zone];
  conteneur.innerHTML = `
    <div class="guide-diaporama" tabindex="0">
      <button type="button" class="guide-diapo-nav guide-diapo-prev" aria-label="Diapositive précédente">‹</button>
      <img src="" alt="">
      <button type="button" class="guide-diapo-nav guide-diapo-next" aria-label="Diapositive suivante">›</button>
      <div class="guide-diapo-compteur">1 / 1</div>
    </div>`;
  const zoneDiapo = conteneur.querySelector(".guide-diaporama");
  const img = zoneDiapo.querySelector("img");
  const compteur = zoneDiapo.querySelector(".guide-diapo-compteur");
  const chemin = (i) => `/img/coherences/${guide.slug}/slide-${String(i + 1).padStart(2, "0")}.jpg`;
  let index = 0;

  function afficher() {
    index = ((index % guide.nbSlides) + guide.nbSlides) % guide.nbSlides;
    img.src = chemin(index);
    img.alt = `Diapositive ${index + 1} sur ${guide.nbSlides} — Cohérence ${zone}`;
    compteur.textContent = `${index + 1} / ${guide.nbSlides}`;
    // Précharge la diapositive suivante et précédente pour une navigation fluide.
    new Image().src = chemin((index + 1) % guide.nbSlides);
    new Image().src = chemin((index - 1 + guide.nbSlides) % guide.nbSlides);
  }
  const aller = (pas) => { index += pas; afficher(); };

  zoneDiapo.querySelector(".guide-diapo-prev").addEventListener("click", () => aller(-1));
  zoneDiapo.querySelector(".guide-diapo-next").addEventListener("click", () => aller(1));
  zoneDiapo.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") aller(-1);
    if (e.key === "ArrowRight") aller(1);
  });
  // Balayage tactile (mobile) pour passer d'une diapositive à l'autre.
  let toucheDepartX = null;
  zoneDiapo.addEventListener("touchstart", (e) => { toucheDepartX = e.changedTouches[0].clientX; }, { passive: true });
  zoneDiapo.addEventListener("touchend", (e) => {
    if (toucheDepartX === null) return;
    const delta = e.changedTouches[0].clientX - toucheDepartX;
    if (Math.abs(delta) > 40) aller(delta < 0 ? 1 : -1);
    toucheDepartX = null;
  }, { passive: true });

  afficher();
}
