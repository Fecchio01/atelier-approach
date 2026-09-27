ALTER TABLE "Lead" ADD COLUMN "wonAt" DATETIME;
ALTER TABLE "Lead" ADD COLUMN "wonById" TEXT;

CREATE INDEX "Lead_wonAt_idx" ON "Lead"("wonAt");
