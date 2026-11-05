ALTER TABLE "ProspectCandidate"
  ADD COLUMN "discardedAt" TIMESTAMP(3);

CREATE INDEX "ProspectCandidate_discardedAt_idx" ON "ProspectCandidate"("discardedAt");
