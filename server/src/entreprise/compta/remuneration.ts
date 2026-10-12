// ENTREPRISE — part variable de la rémunération (primes, commissions…) : propre à chaque entreprise, à adapter ici.
// Le salaire fixe par grade et la paie à l'heure sont communs (Comptabilité → Rémunération, compta/releve.ts) ; ce qui
// dépend de l'activité (ventes, objectifs, livraisons) se calcule ici, à partir de la ligne du relevé Tablettes de la
// personne (ses colonnes : nom, rang, run, facture, vente…) ou des tables de l'entreprise. Renvoie un montant en $.
// Par défaut : aucune part variable.
export function partVariable(_l: { nom: string; rang: string; colonnes: string[]; ligne: string[] }): number {
  return 0;
}
