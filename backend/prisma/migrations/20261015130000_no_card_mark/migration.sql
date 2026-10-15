-- Brand cards no longer carry a "GyFTR" mark by default. Clear the old default where it was saved;
-- any other text an editor chose is kept.
UPDATE "SiteSetting"
SET "value" = jsonb_set("value", '{labels,cardBrandMark}', '""'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'site' AND "value" #>> '{labels,cardBrandMark}' = 'GyFTR';
