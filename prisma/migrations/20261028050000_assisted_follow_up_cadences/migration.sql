CREATE TYPE "atelier"."CadenceStatus" AS ENUM ('ACTIVE', 'WAITING_HUMAN', 'PAUSED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "atelier"."CrmTask" ADD COLUMN "effectKey" TEXT;
CREATE UNIQUE INDEX "CrmTask_effectKey_key" ON "atelier"."CrmTask"("effectKey");

CREATE TABLE "atelier"."CadenceEnrollment" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "status" "atelier"."CadenceStatus" NOT NULL DEFAULT 'ACTIVE',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "nextDueAt" TIMESTAMP(3) NOT NULL,
  "lastActivityAt" TIMESTAMP(3) NOT NULL,
  "activeTaskId" TEXT,
  "pauseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CadenceEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CadenceEnrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "atelier"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "atelier"."AgentAutomationSettings" (
  "id" TEXT NOT NULL DEFAULT 'team',
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "AgentAutomationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CadenceEnrollment_leadId_key" ON "atelier"."CadenceEnrollment"("leadId");
CREATE UNIQUE INDEX "CadenceEnrollment_activeTaskId_key" ON "atelier"."CadenceEnrollment"("activeTaskId");
CREATE INDEX "CadenceEnrollment_status_nextDueAt_idx" ON "atelier"."CadenceEnrollment"("status", "nextDueAt");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "atelier"."CadenceEnrollment", "atelier"."AgentAutomationSettings" TO atelier_app;
ALTER TABLE "atelier"."CadenceEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."AgentAutomationSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CadenceEnrollment_app_access" ON "atelier"."CadenceEnrollment" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "AgentAutomationSettings_app_access" ON "atelier"."AgentAutomationSettings" TO atelier_app USING (true) WITH CHECK (true);
