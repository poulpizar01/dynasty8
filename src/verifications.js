// ============================================================================
// Dynasty 8 — vérifications de configuration au démarrage
// ============================================================================

// SESSION_SECRET signe les cookies de session : connu de quelqu'un, il lui
// permettrait de fabriquer une session au nom de n'importe quel compte, Patron
// compris. Le serveur refuse donc de démarrer s'il est absent, trop court, ou
// laissé à la valeur d'exemple d'un ancien modèle .env.example.
export const LONGUEUR_MIN_SECRET_SESSION = 16;

export function secretSessionValide(valeur) {
  const secret = String(valeur || "");
  return secret.length >= LONGUEUR_MIN_SECRET_SESSION && !/^remplacer/i.test(secret);
}
