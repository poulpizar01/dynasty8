-- CreateTable
CREATE TABLE "apparence_images" (
    "cle" VARCHAR(20) NOT NULL,
    "cle_image" VARCHAR(200) NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "cle_mini" VARCHAR(200) NOT NULL,
    "url_mini" VARCHAR(512) NOT NULL,
    "compte_id" INTEGER,
    "maj_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apparence_images_pkey" PRIMARY KEY ("cle")
);
