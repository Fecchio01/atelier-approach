CREATE TYPE "atelier"."ProspectFeedbackOutcome" AS ENUM ('ACCEPTED', 'DISCARDED');

CREATE TYPE "atelier"."ProspectFeedbackReason" AS ENUM (
  'DUPLICATE',
  'WRONG_NICHE',
  'INVALID_BUSINESS',
  'INSUFFICIENT_DATA',
  'OTHER'
);

CREATE TABLE "atelier"."ProspectCandidateFeedback" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "outcome" "atelier"."ProspectFeedbackOutcome" NOT NULL,
  "reason" "atelier"."ProspectFeedbackReason",
  "category" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProspectCandidateFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProspectCandidateFeedback_candidateId_key"
  ON "atelier"."ProspectCandidateFeedback"("candidateId");
CREATE INDEX "ProspectCandidateFeedback_category_outcome_reason_idx"
  ON "atelier"."ProspectCandidateFeedback"("category", "outcome", "reason");
CREATE INDEX "ProspectCandidateFeedback_updatedAt_idx"
  ON "atelier"."ProspectCandidateFeedback"("updatedAt");

ALTER TABLE "atelier"."ProspectCandidateFeedback"
  ADD CONSTRAINT "ProspectCandidateFeedback_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "atelier"."ProspectCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
