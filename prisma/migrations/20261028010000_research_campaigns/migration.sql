CREATE TYPE "atelier"."ResearchCampaignStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "atelier"."ProspectCandidateStatus" AS ENUM ('NEW', 'REVIEW_IDENTITY', 'APPROVED', 'REJECTED', 'PROMOTED');

CREATE TABLE "atelier"."ResearchCampaign" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "niche" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "city" TEXT,
  "criteria" JSONB NOT NULL,
  "checkpoint" JSONB NOT NULL,
  "maxCandidates" INTEGER NOT NULL DEFAULT 20,
  "maxAreas" INTEGER NOT NULL DEFAULT 20,
  "release" TEXT,
  "status" "atelier"."ResearchCampaignStatus" NOT NULL DEFAULT 'QUEUED',
  "checkpointVersion" INTEGER NOT NULL DEFAULT 0,
  "completedAreas" INTEGER NOT NULL DEFAULT 0,
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "workflowRunId" TEXT,
  "dispatchLeaseUntil" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "atelier"."ProspectCandidate" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "identityFingerprint" TEXT NOT NULL,
  "phone" TEXT,
  "website" TEXT,
  "instagram" TEXT,
  "whatsapp" TEXT,
  "address" TEXT,
  "category" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "imageUrl" TEXT,
  "status" "atelier"."ProspectCandidateStatus" NOT NULL DEFAULT 'NEW',
  "leadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProspectCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProspectCandidate_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "atelier"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "atelier"."ResearchCampaignCandidate" (
  "campaignId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchCampaignCandidate_pkey" PRIMARY KEY ("campaignId", "candidateId"),
  CONSTRAINT "ResearchCampaignCandidate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "atelier"."ResearchCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ResearchCampaignCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "atelier"."ProspectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "atelier"."ResearchEvidence" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "value" TEXT,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL DEFAULT '',
  "release" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "extractorVersion" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResearchEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "atelier"."ProspectCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ResearchCampaign_idempotencyKey_key" ON "atelier"."ResearchCampaign"("idempotencyKey");
CREATE UNIQUE INDEX "ResearchCampaign_workflowRunId_key" ON "atelier"."ResearchCampaign"("workflowRunId");
CREATE INDEX "ResearchCampaign_ownerId_createdAt_idx" ON "atelier"."ResearchCampaign"("ownerId", "createdAt");
CREATE INDEX "ResearchCampaign_status_updatedAt_idx" ON "atelier"."ResearchCampaign"("status", "updatedAt");
CREATE UNIQUE INDEX "ProspectCandidate_source_externalId_key" ON "atelier"."ProspectCandidate"("source", "externalId");
CREATE UNIQUE INDEX "ProspectCandidate_leadId_key" ON "atelier"."ProspectCandidate"("leadId");
CREATE INDEX "ProspectCandidate_normalizedName_latitude_longitude_idx" ON "atelier"."ProspectCandidate"("normalizedName", "latitude", "longitude");
CREATE INDEX "ProspectCandidate_status_createdAt_idx" ON "atelier"."ProspectCandidate"("status", "createdAt");
CREATE INDEX "ResearchCampaignCandidate_candidateId_idx" ON "atelier"."ResearchCampaignCandidate"("candidateId");
CREATE UNIQUE INDEX "ResearchEvidence_candidateId_field_source_sourceUrl_key" ON "atelier"."ResearchEvidence"("candidateId", "field", "source", "sourceUrl");
CREATE INDEX "ResearchEvidence_candidateId_field_capturedAt_idx" ON "atelier"."ResearchEvidence"("candidateId", "field", "capturedAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "atelier"."ResearchCampaign", "atelier"."ProspectCandidate", "atelier"."ResearchCampaignCandidate", "atelier"."ResearchEvidence" TO atelier_app;
GRANT USAGE ON TYPE "atelier"."ResearchCampaignStatus", "atelier"."ProspectCandidateStatus" TO atelier_app;

ALTER TABLE "atelier"."ResearchCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."ProspectCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."ResearchCampaignCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."ResearchEvidence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ResearchCampaign_app_access" ON "atelier"."ResearchCampaign" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "ProspectCandidate_app_access" ON "atelier"."ProspectCandidate" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "ResearchCampaignCandidate_app_access" ON "atelier"."ResearchCampaignCandidate" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "ResearchEvidence_app_access" ON "atelier"."ResearchEvidence" TO atelier_app USING (true) WITH CHECK (true);
