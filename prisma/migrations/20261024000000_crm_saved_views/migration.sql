CREATE TYPE "CrmSavedViewScope" AS ENUM ('FUNNEL', 'ACTIONS');

CREATE TABLE "CrmSavedView" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scope" "CrmSavedViewScope" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSavedView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmSavedView_ownerId_scope_normalizedName_key"
ON "CrmSavedView"("ownerId", "scope", "normalizedName");

CREATE INDEX "CrmSavedView_ownerId_scope_updatedAt_idx"
ON "CrmSavedView"("ownerId", "scope", "updatedAt");

ALTER TABLE "CrmSavedView" ADD CONSTRAINT "CrmSavedView_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmSavedView" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CrmSavedView_app_access" ON "CrmSavedView"
FOR ALL TO atelier_app
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "CrmSavedView" TO atelier_app;
GRANT USAGE ON TYPE "CrmSavedViewScope" TO atelier_app;
