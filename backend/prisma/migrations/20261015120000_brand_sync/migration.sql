-- Brands are kept in sync with the GyFTR brand API (src/services/BrandSyncService.ts).
-- gyftrId: the brand's id at GyFTR (null for a brand added by hand in the panel).
-- manualFields: fields an editor changed by hand; the sync no longer overwrites them.
-- syncedAt: last time the brand's data came from GyFTR.
ALTER TABLE "Brand"
    ADD COLUMN "gyftrId" INTEGER,
    ADD COLUMN "manualFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "syncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Brand_gyftrId_key" ON "Brand"("gyftrId");
