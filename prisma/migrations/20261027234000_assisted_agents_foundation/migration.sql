CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'NEEDS_APPROVAL', 'COMPLETED', 'FAILED');
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'STALE');
CREATE TYPE "AgentOutboxStatus" AS ENUM ('PENDING', 'DELIVERED');

CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "workflowRunId" TEXT,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "policyVersion" TEXT NOT NULL,
  "leadVersion" INTEGER NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentAction" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING',
  "approvalToken" TEXT NOT NULL,
  "approvalHash" TEXT NOT NULL,
  "leadVersion" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "taskType" "CrmTaskType" NOT NULL,
  "priority" "CrmTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "dueDate" TIMESTAMP(3) NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AgentAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentOutbox" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "AgentOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "AgentOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentOutbox_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "AgentAction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentRun_idempotencyKey_key" ON "AgentRun"("idempotencyKey");
CREATE UNIQUE INDEX "AgentRun_workflowRunId_key" ON "AgentRun"("workflowRunId");
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");
CREATE INDEX "AgentRun_leadId_createdAt_idx" ON "AgentRun"("leadId", "createdAt");
CREATE UNIQUE INDEX "AgentAction_approvalToken_key" ON "AgentAction"("approvalToken");
CREATE UNIQUE INDEX "AgentAction_runId_leadVersion_key" ON "AgentAction"("runId", "leadVersion");
CREATE INDEX "AgentAction_status_createdAt_idx" ON "AgentAction"("status", "createdAt");
CREATE INDEX "AgentAction_leadId_createdAt_idx" ON "AgentAction"("leadId", "createdAt");
CREATE UNIQUE INDEX "AgentOutbox_actionId_key" ON "AgentOutbox"("actionId");
CREATE INDEX "AgentOutbox_status_createdAt_idx" ON "AgentOutbox"("status", "createdAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AgentRun", "AgentAction", "AgentOutbox" TO atelier_app;

ALTER TABLE "AgentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentOutbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AgentRun_app_access" ON "AgentRun" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "AgentAction_app_access" ON "AgentAction" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "AgentOutbox_app_access" ON "AgentOutbox" TO atelier_app USING (true) WITH CHECK (true);
