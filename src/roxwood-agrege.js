// ============================================================================
// Extraction des ventes Roxwood (produits/factures/commandes livrées)
// ----------------------------------------------------------------------------
// Fonctions PURES (aucun accès base de données ici) : à partir d'un événement
// Roxwood déjà reçu (guildId, type, payload déjà parsé, sentAt), déterminent
// si c'est une transaction exploitable pour la nouvelle vue d'ensemble
// globale de Statistiques, et sous quelle forme normalisée.
//
// Pourquoi seulement 3 des 8 types d'événements Roxwood ("monitoring.sale",
// "monitoring.invoice", "order.updated") : ce sont les seuls qui portent un
// montant réel. Les 5 autres (prise de service, recrutement, coffre,
// absences, personnalisé) ne représentent pas des transactions et sont
// ignorés silencieusement ici (retour null, jamais compté "non traité").
//
// Pourquoi ça ne nourrit JAMAIS les primes/commissions/DOT par agent : ces
// calculs (voir src/stats-calc.js) sont construits autour d'un agent
// immobilier identifié et d'une semaine — deux notions que Roxwood n'a pas
// (ses ventes sont attribuées à un pseudo Discord d'une tout autre activité,
// sans notion de location non plus). Le résultat de ce module alimente
// uniquement un total global "vue d'ensemble", jamais la paie d'un agent.
//
// Trois résultats possibles pour extraireTransactionRoxwood() :
//   - null      : ce type d'événement n'est pas une transaction (ignoré,
//                 pas compté "non traité" — c'est normal).
//   - undefined : type concerné mais champs manquants/invalides -> l'appelant
//                 doit marquer l'événement "echec" (compté "non traités").
//   - un objet  : transaction exploitable (ou instruction de suppression
//                 pour une commande pas encore livrée), voir le détail
//                 de chaque forme ci-dessous.
// ============================================================================

/** Longueur max d'un libellé "bien" stocké (protection anti-abus, comme ailleurs sur le site). */
const LONGUEUR_MAX_BIEN = 200;

function texteBorne(valeur, defaut = "") {
  const s = valeur == null ? "" : String(valeur).trim();
  return (s || defaut).slice(0, LONGUEUR_MAX_BIEN);
}

function montantValide(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * "Vente de {N}x {Item} pour {total}$ par {vendeur}. {part}$ pour la société"
 * (voir monitoringParsers.ts::parseSale côté bot). On retient le montant
 * TOTAL de la vente (totalPrice), pas seulement la part qui revient à la
 * société (companyShare) : c'est le montant complet de la transaction.
 */
function extraireVenteProduit(guildId, payload, sentAt) {
  const p = payload && payload.parsed;
  const montant = p && montantValide(p.totalPrice);
  if (!p || montant == null || !p.itemLabel) return undefined;
  return {
    type: "Vente",
    montant,
    bien: texteBorne(p.itemLabel),
    dateTransaction: sentAt || null,
    source: "monitoring.sale",
    cleDedup: `monitoring.sale|${guildId || ""}|${sentAt || ""}|${texteBorne(p.itemLabel)}|${montant}|${texteBorne(p.sellerName)}`,
  };
}

/** "paiement d'une facture de {montant} (taxes {pct}%) par {nom}" (parseInvoice côté bot). */
function extraireFacture(guildId, payload, sentAt) {
  const p = payload && payload.parsed;
  const montant = p && montantValide(p.amount);
  if (!p || montant == null) return undefined;
  return {
    type: "Vente",
    montant,
    bien: `Facture — ${texteBorne(p.payerName, "client")}`,
    dateTransaction: sentAt || null,
    source: "monitoring.invoice",
    cleDedup: `monitoring.invoice|${guildId || ""}|${sentAt || ""}|${texteBorne(p.payerName)}|${montant}`,
  };
}

/**
 * order.updated est un événement d'ÉTAT COURANT : le même orderId est
 * renvoyé à chaque changement de statut (En attente -> En préparation ->
 * Livrée, ou Annulée). La clé de déduplication ne dépend donc QUE de
 * guildId+orderId (jamais de sentAt/statut) : chaque nouvel événement pour
 * la même commande met à jour (ou supprime) la même ligne, il n'y a jamais
 * deux lignes pour une seule commande.
 *   - statut "DELIVERED" -> transaction comptée (montant = total).
 *   - tout autre statut (En attente/En préparation/Annulée) -> la commande
 *     ne doit PAS (ou plus) compter : instruction de suppression, pas une
 *     erreur (une commande en cours est un état normal, pas un échec).
 */
function extraireCommande(guildId, payload, sentAt) {
  const p = payload || {};
  if (!p.orderId) return undefined; // vraiment inexploitable : pas d'identifiant de commande
  const cleDedup = `order.updated|${guildId || ""}|${p.orderId}`;

  if (p.status !== "DELIVERED") {
    return { supprimer: true, cleDedup };
  }

  const montant = montantValide(p.total);
  if (montant == null) return undefined;
  const bien = Array.isArray(p.items) && p.items.length
    ? texteBorne(p.items.map((i) => i && i.name).filter(Boolean).join(", "), "Commande")
    : "Commande";
  return {
    type: "Vente",
    montant,
    bien,
    dateTransaction: sentAt || null,
    source: "order.updated",
    cleDedup,
  };
}

/**
 * Point d'entrée unique. `evenement` = { guildId, type (eventType Roxwood),
 * payload (déjà un objet JS, pas une chaîne JSON), sentAt }.
 */
export function extraireTransactionRoxwood(evenement) {
  const { guildId, type, payload, sentAt } = evenement || {};
  if (type === "monitoring.sale") return extraireVenteProduit(guildId, payload, sentAt);
  if (type === "monitoring.invoice") return extraireFacture(guildId, payload, sentAt);
  if (type === "order.updated") return extraireCommande(guildId, payload, sentAt);
  return null; // pas un type de transaction (shift, recruitment, safe, absence.updated, custom...)
}
