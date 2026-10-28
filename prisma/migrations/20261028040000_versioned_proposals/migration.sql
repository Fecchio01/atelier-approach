CREATE TYPE "atelier"."ProposalVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

CREATE TABLE "atelier"."Proposal" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Proposal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "atelier"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "atelier"."ProposalVersion" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "leadVersion" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "atelier"."ProposalVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "customerName" TEXT NOT NULL,
  "notes" TEXT,
  "validUntil" TIMESTAMP(3),
  "saleValue" DECIMAL(12,2) NOT NULL,
  "mrr" DECIMAL(12,2) NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProposalVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProposalVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "atelier"."Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "atelier"."ProposalLineItem" (
  "id" TEXT NOT NULL,
  "proposalVersionId" TEXT NOT NULL,
  "serviceId" TEXT,
  "serviceName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "billingType" "atelier"."ServiceBillingType" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ProposalLineItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProposalLineItem_proposalVersionId_fkey" FOREIGN KEY ("proposalVersionId") REFERENCES "atelier"."ProposalVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProposalLineItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "atelier"."ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Proposal_leadId_updatedAt_idx" ON "atelier"."Proposal"("leadId", "updatedAt");
CREATE UNIQUE INDEX "ProposalVersion_proposalId_version_key" ON "atelier"."ProposalVersion"("proposalId", "version");
CREATE INDEX "ProposalVersion_status_createdAt_idx" ON "atelier"."ProposalVersion"("status", "createdAt");
CREATE INDEX "ProposalLineItem_proposalVersionId_idx" ON "atelier"."ProposalLineItem"("proposalVersionId");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "atelier"."Proposal", "atelier"."ProposalVersion", "atelier"."ProposalLineItem" TO atelier_app;
ALTER TABLE "atelier"."Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."ProposalVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."ProposalLineItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Proposal_app_access" ON "atelier"."Proposal" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "ProposalVersion_app_access" ON "atelier"."ProposalVersion" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "ProposalLineItem_app_access" ON "atelier"."ProposalLineItem" TO atelier_app USING (true) WITH CHECK (true);
