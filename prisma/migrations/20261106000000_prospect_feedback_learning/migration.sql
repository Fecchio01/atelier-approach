CREATE TYPE "ProspectFeedbackOutcome" AS ENUM ('ACCEPTED', 'DISCARDED');

CREATE TYPE "ProspectFeedbackReason" AS ENUM (
  'DUPLICATE',
  'WRONG_NICHE',
  'INVALID_BUSINESS',
  'INSUFFICIENT_DATA',
  'OTHER'
);

CREATE TABLE "ProspectCandidateFeedback" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "outcome" "ProspectFeedbackOutcome" NOT NULL,
  "reason" "ProspectFeedbackReason",
  "category" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProspectCandidateFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspectCandidateFeedback_candidateId_key"
  ON "ProspectCandidateFeedback"("candidateId");
CREATE INDEX "ProspectCandidateFeedback_category_outcome_reason_idx"
  ON "ProspectCandidateFeedback"("category", "outcome", "reason");
CREATE INDEX "ProspectCandidateFeedback_updatedAt_idx"
  ON "ProspectCandidateFeedback"("updatedAt");

ALTER TABLE "ProspectCandidateFeedback"
  ADD CONSTRAINT "ProspectCandidateFeedback_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ProspectCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
