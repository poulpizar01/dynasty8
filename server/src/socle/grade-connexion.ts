// SOCLE — grade d'un compte à sa connexion Discord : fonction pure (sans base ni configuration), testée par
// test/socle-grades.test.ts. Appelée par routes/auth.ts avec les grades du sommet à la base.
//  - grade par rôle : le plus élevé dont le rôle Discord est porté ;
//  - un grade lié à un rôle que le compte ne porte plus est retiré (rétrogradé ou parti sur Discord) ;
//  - un grade sans rôle Discord (attribué à la main) est conservé, sauf pour un ancien propriétaire (serveur transféré) :
//    il a pu se l'attribuer lui-même ;
//  - un grade attribué à la main plus haut que celui du rôle l'emporte : sinon, quiconque gère un grade inférieur le
//    lierait à un rôle porté par tous (« Membre ») et ferait tomber ses supérieurs à leur connexion suivante.
type GradeRole = { cle: string; roleDiscordId: string | null };

export function gradeALaConnexion(grades: readonly GradeRole[], roles: readonly string[], actuelCle: string | null | undefined, exProprietaire: boolean) {
  const rang = (cle: string | null | undefined) => { const i = grades.findIndex(g => g.cle === cle); return i < 0 ? grades.length : i; };
  const parRole = grades.find(g => g.roleDiscordId && roles.includes(g.roleDiscordId))?.cle ?? null;
  const actuel = grades.find(g => g.cle === actuelCle);
  const roleRetire = !!actuel?.roleDiscordId && !roles.includes(actuel.roleDiscordId);
  const conserve = !actuel || roleRetire || (exProprietaire && !actuel.roleDiscordId) ? null : actuel.cle;
  const manuelPlusHaut = !!conserve && !actuel?.roleDiscordId && rang(conserve) < rang(parRole);
  return { grade: manuelPlusHaut ? conserve : parRole ?? conserve, parRole };
}
