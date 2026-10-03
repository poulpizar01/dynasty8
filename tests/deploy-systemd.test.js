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
const position = (ligne) => lignes.indexOf(ligne);

test("le service ne tourne jamais en root", () => {
  const [utilisateur] = valeurs("User");
  const [groupe] = valeurs("Group");
  assert.ok(utilisateur, "User= doit être défini (sinon systemd lance le service en root)");
  assert.ok(groupe, "Group= doit être défini");
  assert.notEqual(utilisateur, "root");
  assert.notEqual(utilisateur, "0");
});

test("Node est appelé par un chemin absolu, hors de /root et de nvm", () => {
  const [commande] = valeurs("ExecStart");
  const [binaire, serveur] = commande.split(/\s+/);
  assert.ok(binaire.startsWith("/"), "chemin absolu : jamais $(command -v node)");
  assert.ok(!binaire.startsWith("/root/") && !binaire.includes(".nvm"),
    "un Node installé par nvm sous /root est illisible pour le compte du service (status=203/EXEC)");
  assert.ok(serveur && serveur.startsWith("/") && serveur.endsWith("/server.js"));
});

test("les réglages de production l'emportent sur le .env", () => {
  const [fichier] = valeurs("EnvironmentFile");
  assert.ok(fichier && fichier.startsWith("/"), "EnvironmentFile absolu");
  for (const reglage of ["Environment=NODE_ENV=production", "Environment=DB_SCHEMA_AUTO=0"]) {
    assert.ok(position(reglage) > position("EnvironmentFile=" + fichier),
      `${reglage} doit suivre EnvironmentFile pour primer sur le .env`);
  }
});

test("unité complète et durcie", () => {
  assert.doesNotMatch(UNITE, /@@/, "plus aucun trou à remplir");
  assert.doesNotMatch(UNITE, /\bsudo\b/);
  for (const directive of ["NoNewPrivileges=true", "PrivateTmp=true", "Restart=always"]) {
    assert.ok(lignes.includes(directive), directive);
  }
  assert.ok(valeurs("ProtectSystem").length, "ProtectSystem=");
});
