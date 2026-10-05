-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "expediteur_id" INTEGER NOT NULL,
    "destinataire_id" INTEGER NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'texte',
    "contenu" VARCHAR(1000) NOT NULL DEFAULT '',
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "envoye_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messagerie_statuts" (
    "compte_id" INTEGER NOT NULL,
    "statut" VARCHAR(12) NOT NULL DEFAULT 'disponible',

    CONSTRAINT "messagerie_statuts_pkey" PRIMARY KEY ("compte_id")
);

-- CreateIndex
CREATE INDEX "messages_expediteur_id_destinataire_id_idx" ON "messages"("expediteur_id", "destinataire_id");

-- CreateIndex
CREATE INDEX "messages_destinataire_id_expediteur_id_idx" ON "messages"("destinataire_id", "expediteur_id");
