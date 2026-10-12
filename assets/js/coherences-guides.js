// ============================================================================
// Dynasty 8 — guides de cohérence
// ----------------------------------------------------------------------------
// Chargé par la page publique /coherence-zone.html ET par la rubrique
// « Cohérences » de l'espace agents. Le règlement de chaque zone n'est écrit
// nulle part ici : c'est la présentation Google Slides de la Direction, dont le
// lien se règle dans Paramètres → Liens. Elle est affichée telle quelle (lecteur
// intégré de Google), donc toujours à jour, sans copie à maintenir.
// Ici seulement la liste des zones, liée au champ « cohérence » des annonces, et
// la phrase qui dit ce qu'est chaque zone. Dépend de layout.js (D8_LIENS_PRETS).
// ============================================================================

const GUIDES_COHERENCE = {
  "Habitation": {
    icone: "🏠",
    lienSlides: "slides_coherence_habitation",
    intro: "La cohérence Habitation atteste que votre personnage dispose d'un logement légal à Los Santos, avec un intérieur cohérent par rapport au bâtiment choisi.",
  },
  "Garage": {
    icone: "🚗",
    lienSlides: "slides_coherence_garage",
    intro: "La cohérence Garage relie la taille et le standing d'un bâtiment à sa capacité de stationnement réelle : un petit local ne peut pas justifier un grand parking, et inversement.",
  },
  "Cayo Perico": {
    icone: "🏝️",
    lienSlides: "slides_coherence_cayo_perico",
    intro: "La cohérence Cayo Perico concerne les biens situés sur l'île de Cayo Perico, une zone de jeu à part avec ses propres intérieurs autorisés selon le type de bâtiment.",
  },
  "Roxwood": {
    icone: "🌲",
    lienSlides: "slides_coherence_roxwood",
    intro: "La cohérence Roxwood concerne le secteur résidentiel de Roxwood, avec ses propres zones réservées et ses règles de garages spécifiques aux grandes villas du secteur.",
  },
};
const ZONES_COHERENCE = Object.keys(GUIDES_COHERENCE);

// identifiant de la présentation, lu dans le lien réglé (Paramètres ne garde que
// des liens https://docs.google.com/presentation/d/<id>/edit ; revérifié ici)
const idPresentation = (lien) => /^https:\/\/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]{20,})\//.exec(lien || "")?.[1] || null;

// Présentation d'une zone dans `conteneur`, affichée directement (lecteur intégré
// de Google). Chargée seulement quand elle approche de l'écran (loading="lazy") ;
// Google reçoit alors l'adresse IP du visiteur (voir confidentialite.html).
// `absente` : texte quand le lien de la zone n'est pas réglé (le public et
// l'espace agents ne disent pas la même chose).
async function monterPresentationCoherence(conteneur, zone, absente) {
  const guide = GUIDES_COHERENCE[zone];
  const liens = await D8_LIENS_PRETS;
  const id = idPresentation(liens[guide.lienSlides]);
  if (!id) {
    conteneur.innerHTML = `<div class="guide-presentation guide-presentation--vide"><p>${echapper(absente)}</p></div>`;
    return;
  }
  // pas de lien vers Google Slides : la présentation se lit ici (plein écran compris), comme la WebMap
  conteneur.innerHTML = `
    <div class="guide-presentation">
      <div class="guide-presentation-cadre"></div>
      <div class="guide-presentation-actions">
        <button type="button" class="btn btn-fantome btn-petit cache" data-plein-ecran>Plein écran</button>
      </div>
    </div>`;
  const cadre = document.createElement("iframe");
  cadre.src = `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=60000`;
  cadre.title = `Présentation de la cohérence ${zone}`;
  cadre.loading = "lazy";
  cadre.allowFullscreen = true;
  cadre.referrerPolicy = "no-referrer";
  conteneur.querySelector(".guide-presentation-cadre").append(cadre);
  pleinEcran(conteneur.querySelector("[data-plein-ecran]"), conteneur.querySelector(".guide-presentation-cadre"));
}
