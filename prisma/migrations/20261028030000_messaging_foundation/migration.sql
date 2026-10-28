CREATE TYPE "atelier"."MessagingDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "atelier"."MessagingStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN', 'BLOCKED', 'CANCELLED');

ALTER TABLE "atelier"."Activity" ADD COLUMN "effectKey" TEXT;
CREATE UNIQUE INDEX "Activity_effectKey_key" ON "atelier"."Activity"("effectKey");

CREATE TABLE "atelier"."MessagingMessage" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "leadVersion" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "channel" "atelier"."Channel" NOT NULL,
  "direction" "atelier"."MessagingDirection" NOT NULL,
  "status" "atelier"."MessagingStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKey" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "content" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessagingMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessagingMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "atelier"."Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "atelier"."MessagingWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "MessagingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "atelier"."ContactSuppression" (
  "id" TEXT NOT NULL,
  "channel" "atelier"."Channel" NOT NULL,
  "normalizedContact" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  CONSTRAINT "ContactSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingMessage_idempotencyKey_key" ON "atelier"."MessagingMessage"("idempotencyKey");
CREATE UNIQUE INDEX "MessagingMessage_provider_providerMessageId_key" ON "atelier"."MessagingMessage"("provider", "providerMessageId");
CREATE INDEX "MessagingMessage_leadId_createdAt_idx" ON "atelier"."MessagingMessage"("leadId", "createdAt");
CREATE INDEX "MessagingMessage_status_createdAt_idx" ON "atelier"."MessagingMessage"("status", "createdAt");
CREATE UNIQUE INDEX "MessagingWebhookEvent_provider_externalEventId_key" ON "atelier"."MessagingWebhookEvent"("provider", "externalEventId");
CREATE INDEX "MessagingWebhookEvent_processedAt_receivedAt_idx" ON "atelier"."MessagingWebhookEvent"("processedAt", "receivedAt");
CREATE UNIQUE INDEX "ContactSuppression_channel_normalizedContact_key" ON "atelier"."ContactSuppression"("channel", "normalizedContact");
CREATE INDEX "ContactSuppression_createdAt_idx" ON "atelier"."ContactSuppression"("createdAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "atelier"."MessagingMessage", "atelier"."MessagingWebhookEvent", "atelier"."ContactSuppression" TO atelier_app;
ALTER TABLE "atelier"."MessagingMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."MessagingWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "atelier"."ContactSuppression" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "MessagingMessage_app_access" ON "atelier"."MessagingMessage" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "MessagingWebhookEvent_app_access" ON "atelier"."MessagingWebhookEvent" TO atelier_app USING (true) WITH CHECK (true);
CREATE POLICY "ContactSuppression_app_access" ON "atelier"."ContactSuppression" TO atelier_app USING (true) WITH CHECK (true);
