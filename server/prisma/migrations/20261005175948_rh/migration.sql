-- CreateTable
CREATE TABLE "employes" (
    "id" SERIAL NOT NULL,
    "id_employe" VARCHAR(40) NOT NULL,
    "id_employe_normalise" VARCHAR(40) NOT NULL,
    "id_provisoire" BOOLEAN NOT NULL DEFAULT false,
    "prenom" VARCHAR(60) NOT NULL DEFAULT '',
    "nom" VARCHAR(60) NOT NULL DEFAULT '',
    "telephone" VARCHAR(30) NOT NULL DEFAULT '',
    "rib" VARCHAR(60) NOT NULL DEFAULT '',
    "discord_id" VARCHAR(22),
    "discord_pseudo" VARCHAR(100) NOT NULL DEFAULT '',
    "discord_pseudo_normalise" VARCHAR(100),
    "grade" VARCHAR(20) NOT NULL,
    "statut" VARCHAR(8) NOT NULL DEFAULT 'actif',
    "date_arrivee" DATE,
    "date_depart" DATE,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rh_arrivees_bot" (
    "id" SERIAL NOT NULL,
    "ticket_id" VARCHAR(100) NOT NULL,
    "discord_id" VARCHAR(30) NOT NULL DEFAULT '',
    "nom_recu" VARCHAR(130) NOT NULL DEFAULT '',
    "resultat" VARCHAR(10) NOT NULL,
    "motif" VARCHAR(400) NOT NULL DEFAULT '',
    "employe_id" INTEGER,
    "reponses" JSONB,
    "accepte_le" VARCHAR(40) NOT NULL DEFAULT '',
    "recu_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rh_arrivees_bot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employes_id_employe_normalise_key" ON "employes"("id_employe_normalise");

-- CreateIndex
CREATE UNIQUE INDEX "employes_discord_id_key" ON "employes"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "employes_discord_pseudo_normalise_key" ON "employes"("discord_pseudo_normalise");

-- CreateIndex
CREATE INDEX "employes_statut_grade_idx" ON "employes"("statut", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "rh_arrivees_bot_ticket_id_key" ON "rh_arrivees_bot"("ticket_id");

-- CreateIndex
CREATE INDEX "rh_arrivees_bot_recu_le_idx" ON "rh_arrivees_bot"("recu_le" DESC);
