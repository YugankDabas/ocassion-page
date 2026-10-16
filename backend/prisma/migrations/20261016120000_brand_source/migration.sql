-- A brand's GyFTR id is only meaningful together with the API it came from: the production and staging brand
-- APIs number their brands independently (id 95 is Flipkart in one and another brand in the other).
ALTER TABLE "Brand" ADD COLUMN "gyftrSource" TEXT;
-- Every brand synced so far came from the production API.
UPDATE "Brand" SET "gyftrSource" = 'api.gyftr.com' WHERE "gyftrId" IS NOT NULL;
DROP INDEX "Brand_gyftrId_key";
CREATE UNIQUE INDEX "Brand_gyftrSource_gyftrId_key" ON "Brand"("gyftrSource", "gyftrId");
