-- For the gyftr.com backend: the page's top banner images (first slide of the banner section), and an
-- explicit published flag. Existing rows get their banners at the next start-up, when every published page
-- is re-rendered.
ALTER TABLE "PagePublication"
    ADD COLUMN "desktopBanner" TEXT,
    ADD COLUMN "mobileBanner" TEXT,
    ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
