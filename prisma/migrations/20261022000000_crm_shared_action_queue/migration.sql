CREATE TYPE "CrmTaskType" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'MEETING_PREP', 'OTHER');
CREATE TYPE "CrmTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "CrmTaskState" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

ALTER TYPE "ActivityType" ADD VALUE 'CRM_TASK_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'CRM_TASK_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'CRM_TASK_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'CRM_TASK_CANCELLED';

CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CrmTaskType" NOT NULL,
    "priority" "CrmTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "state" "CrmTaskState" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmTask_state_dueDate_idx" ON "CrmTask"("state", "dueDate");
CREATE INDEX "CrmTask_assigneeId_state_dueDate_idx" ON "CrmTask"("assigneeId", "state", "dueDate");
CREATE INDEX "CrmTask_leadId_createdAt_idx" ON "CrmTask"("leadId", "createdAt");

ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmTask" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrmTask_app_access" ON "CrmTask"
FOR ALL TO atelier_app
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CrmTask" TO atelier_app;
GRANT USAGE ON TYPE "CrmTaskType", "CrmTaskPriority", "CrmTaskState", "ActivityType" TO atelier_app;
