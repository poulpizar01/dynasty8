// Déploiement systemd : l'unité deploy/systemd/dynasty8-api.service est
// installée telle quelle. Ces tests verrouillent les garanties qu'elle porte
// (anciennement imposées par un script de déploiement) : jamais root, Node en
// chemin absolu, réglages de production prioritaires sur le .env, durcissement.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RACINE } from "./aide-medias.js";

const UNITE = fs.readFileSync(path.join(RACINE, "deploy/systemd/dynasty8-api.service"), "utf8");
const lignes = UNITE.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
const valeurs = (cle) => lignes.filter((l) => l.startsWith(cle + "=")).map((l) => l.slice(cle.length + 1));

// ExecStart = /usr/bin/env CLE=valeur… /chemin/node /chemin/server.js
function execStart() {
  const [commande] = valeurs("ExecStart");
  const morceaux = commande.split(/\s+/);
  assert.equal(morceaux[0], "/usr/bin/env", "réglages imposés par /usr/bin/env, au lancement");
  const reglages = morceaux.slice(1).filter((m) => /^[A-Z_]+=/.test(m));
  const [binaire, serveur] = morceaux.slice(1 + reglages.length);
  return { reglages, binaire, serveur };
}

test("le service ne tourne jamais en root", () => {
  const [utilisateur] = valeurs("User");
  const [groupe] = valeurs("Group");
  assert.ok(utilisateur, "User= doit être défini (sinon systemd lance le service en root)");
  assert.ok(groupe, "Group= doit être défini");
  assert.notEqual(utilisateur, "root");
  assert.notEqual(utilisateur, "0");
});

test("Node est appelé par un chemin absolu, hors de /root et de nvm", () => {
  const { binaire, serveur } = execStart();
  assert.ok(binaire.startsWith("/"), "chemin absolu : jamais $(command -v node)");
  assert.ok(!binaire.startsWith("/root/") && !binaire.includes(".nvm"),
    "un Node installé par nvm sous /root est illisible pour le compte du service (status=203/EXEC)");
  assert.ok(serveur && serveur.startsWith("/") && serveur.endsWith("/server.js"));
});

test("les réglages de production l'emportent sur le .env", () => {
  const [fichier] = valeurs("EnvironmentFile");
  assert.ok(fichier && fichier.startsWith("/"), "EnvironmentFile absolu");
  // Sous systemd, EnvironmentFile écrase Environment= quel que soit l'ordre :
  // seule la ligne de commande (/usr/bin/env) garantit ces valeurs.
  const { reglages } = execStart();
  for (const reglage of ["NODE_ENV=production", "DB_SCHEMA_AUTO=0", "HOST=127.0.0.1"]) {
    assert.ok(reglages.includes(reglage), `${reglage} doit être passé par /usr/bin/env`);
  }
  assert.ok(!lignes.some((l) => /^Environment=(NODE_ENV|DB_SCHEMA_AUTO|HOST)=/.test(l)),
    "pas de Environment= trompeur : le .env l'écraserait");
});

test("unité complète et durcie", () => {
  assert.doesNotMatch(UNITE, /@@/, "plus aucun trou à remplir");
  assert.doesNotMatch(UNITE, /\bsudo\b/);
  for (const directive of ["NoNewPrivileges=true", "PrivateTmp=true", "Restart=always", "ProtectHome=true"]) {
    assert.ok(lignes.includes(directive), directive);
  }
  assert.deepEqual(valeurs("ProtectSystem"), ["strict"], "projet et système en lecture seule pour le service");
});
