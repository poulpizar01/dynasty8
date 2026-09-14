// ============================================================================
// Bot « Roxwood Network Entreprise » — réception des webhooks (lecture seule)
// ----------------------------------------------------------------------------
// Le bot Discord (https://github.com/poulpizar01/roxwood-network-entreprise)
// n'a AUCUNE API de lecture : il ne fait que POUSSER des événements signés
// (webhooks sortants) vers une adresse configurée depuis son panneau
// « Monitoring » (bouton « Ajouter un webhook »). Le site ne peut donc pas
// l'interroger : il reçoit chaque événement, le garde en base tel quel
// (table bot_roxwood_evenements) et l'espace agents se contente d'afficher
// ce qui a été reçu. Rien ici ne renvoie jamais d'ordre au bot.
//
// Format envoyé par le bot (voir son webhookDispatcher.ts) :
//   POST <url>   en-tête X-Signature-256 = HMAC-SHA256(secret, corps brut) en hexadécimal
//   corps : { "guildId": "...", "eventType": "...", "payload": {...}, "sentAt": "ISO 8601" }
//
// Chaque abonnement créé côté bot possède SON PROPRE secret (affiché une
// seule fois). Le site en accepte plusieurs à la fois : variable
// ROXWOOD_WEBHOOK_SECRETS = secrets séparés par des virgules, un par
// abonnement (Candidatures, Absences, Commandes, Monitoring...). Une
// signature est acceptée dès qu'elle correspond à l'un d'eux.
// ============================================================================

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/** Types d'événements connus du bot (source : WEBHOOK_EVENT_LABELS côté bot). */
export const TYPES_EVENEMENTS_ROXWOOD = [
  "monitoring.duty",
  "monitoring.recruitment",
  "monitoring.storage",
  "monitoring.invoice",
  "monitoring.sale",
  "absence.updated",
  "order.updated",
  "recruitment.updated",
  "custom",
];

/** Libellés français affichés dans l'espace agents. */
export const LIBELLES_EVENEMENTS_ROXWOOD = {
  "monitoring.duty": "Prise / fin de service",
  "monitoring.recruitment": "Recrutement en jeu",
  "monitoring.storage": "Coffre d'entreprise",
  "monitoring.invoice": "Facture payée",
  "monitoring.sale": "Vente run",
  "absence.updated": "Absence",
  "order.updated": "Commande client",
  "recruitment.updated": "Candidature",
  custom: "Personnalisé",
};

const TAILLE_MAX_CORPS = 512 * 1024; // 512 Ko : un événement du bot fait quelques Ko au plus

// Lit la liste des secrets depuis l'environnement (séparés par des virgules,
// des points-virgules ou des retours à la ligne ; les espaces sont ignorés).
export function lireSecretsRoxwood(env) {
  const brut = (env && env.ROXWOOD_WEBHOOK_SECRETS) || "";
  return String(brut)
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function versOctets(corps) {
  if (Buffer.isBuffer(corps)) return corps;
  if (corps instanceof Uint8Array) return Buffer.from(corps.buffer, corps.byteOffset, corps.byteLength);
  return Buffer.from(String(corps), "utf8");
}

// Vérifie l'en-tête X-Signature-256 contre chaque secret connu, en temps
// constant (jamais de simple ===, qui laisserait deviner le secret octet par
// octet en mesurant le temps de réponse). Renvoie true si UN secret convient.
export function verifierSignatureRoxwood(secrets, corps, signature) {
  if (!Array.isArray(secrets) || !secrets.length) return false;
  const sig = String(signature || "").trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const attendu = Buffer.from(sig, "hex");
  const octets = versOctets(corps);
  let ok = false;
  for (const secret of secrets) {
    const calcule = createHmac("sha256", secret).update(octets).digest();
    // On teste TOUS les secrets même après un succès : temps de réponse
    // identique quel que soit le secret qui correspond.
    if (calcule.length === attendu.length && timingSafeEqual(calcule, attendu)) ok = true;
  }
  return ok;
}

/** Empreinte du corps brut : sert de clé d'unicité (un renvoi du bot après coupure ne crée pas de doublon). */
export function empreinteCorps(corps) {
  return createHash("sha256").update(versOctets(corps)).digest("hex");
}

// Contrôle la forme de l'événement reçu. Renvoie { erreur } ou
// { guildId, eventType, payload, sentAt }.
export function validerEvenementRoxwood(objet, tailleCorps) {
  if (Number.isFinite(tailleCorps) && tailleCorps > TAILLE_MAX_CORPS) return { erreur: "Événement trop volumineux." };
  if (!objet || typeof objet !== "object" || Array.isArray(objet)) return { erreur: "Corps JSON attendu." };
  const guildId = String(objet.guildId || "").trim();
  if (!/^\d{5,30}$/.test(guildId)) return { erreur: "guildId manquant ou invalide." };
  const eventType = String(objet.eventType || "").trim();
  if (!TYPES_EVENEMENTS_ROXWOOD.includes(eventType)) return { erreur: `eventType inconnu : ${eventType.slice(0, 40)}` };
  const payload = objet.payload;
  if (payload == null || typeof payload !== "object") return { erreur: "payload manquant." };
  let sentAt = null;
  if (objet.sentAt != null) {
    const d = new Date(objet.sentAt);
    if (Number.isNaN(d.getTime())) return { erreur: "sentAt invalide." };
    sentAt = d.toISOString();
  }
  return { guildId, eventType, payload, sentAt };
}

// Identifiant « métier » de l'objet concerné, pour ne garder que le DERNIER
// état connu d'une candidature / absence / commande dans l'espace agents
// (le bot renvoie l'état complet à chaque changement).
export function cleObjetRoxwood(eventType, payload) {
  const p = payload || {};
  const s = (v) => (v == null ? null : String(v).slice(0, 80));
  switch (eventType) {
    case "recruitment.updated": return s(p.ticketId);
    case "absence.updated": return s(p.requestId);
    case "order.updated": return s(p.orderId);
    default: return null;
  }
}
