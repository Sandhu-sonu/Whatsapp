-- 1. Create SchemaVersion table
CREATE TABLE IF NOT EXISTS "SchemaVersion" (
    "version" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create ParserEngine table
CREATE TABLE IF NOT EXISTS "ParserEngine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "build" TEXT NOT NULL,
    "releasedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add columns to DailySubmission
ALTER TABLE "DailySubmission" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '2026-07-18 00:00:00';
ALTER TABLE "DailySubmission" ADD COLUMN "deletedAt" DATETIME;

-- 4. Add columns to DsdReport
ALTER TABLE "DsdReport" ADD COLUMN "parserEngineId" TEXT;
ALTER TABLE "DsdReport" ADD COLUMN "rawExtractedJson" TEXT;
ALTER TABLE "DsdReport" ADD COLUMN "processingDurationMs" INTEGER;
ALTER TABLE "DsdReport" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '2026-07-18 00:00:00';
ALTER TABLE "DsdReport" ADD COLUMN "deletedAt" DATETIME;

-- 5. Add columns to WhatsAppMessage
ALTER TABLE "WhatsAppMessage" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '2026-07-18 00:00:00';

-- 6. Add Indexes on DailySubmission
CREATE INDEX IF NOT EXISTS "DailySubmission_districtId_idx" ON "DailySubmission"("districtId");
CREATE INDEX IF NOT EXISTS "DailySubmission_reportDate_idx" ON "DailySubmission"("reportDate");
CREATE INDEX IF NOT EXISTS "DailySubmission_districtId_reportDate_idx" ON "DailySubmission"("districtId", "reportDate");

-- 7. Add Indexes on DsdReport
CREATE INDEX IF NOT EXISTS "DsdReport_reportDate_idx" ON "DsdReport"("reportDate");
CREATE INDEX IF NOT EXISTS "DsdReport_districtId_idx" ON "DsdReport"("districtId");
CREATE INDEX IF NOT EXISTS "DsdReport_submissionId_idx" ON "DsdReport"("submissionId");
CREATE INDEX IF NOT EXISTS "DsdReport_messageId_idx" ON "DsdReport"("messageId");
CREATE INDEX IF NOT EXISTS "DsdReport_isLatest_idx" ON "DsdReport"("isLatest");
CREATE INDEX IF NOT EXISTS "DsdReport_validationStatus_idx" ON "DsdReport"("validationStatus");
CREATE INDEX IF NOT EXISTS "DsdReport_reportDate_isLatest_idx" ON "DsdReport"("reportDate", "isLatest");
CREATE INDEX IF NOT EXISTS "DsdReport_districtId_reportDate_idx" ON "DsdReport"("districtId", "reportDate");
CREATE INDEX IF NOT EXISTS "DsdReport_submissionId_isLatest_idx" ON "DsdReport"("submissionId", "isLatest");
CREATE INDEX IF NOT EXISTS "DsdReport_districtId_isLatest_idx" ON "DsdReport"("districtId", "isLatest");
CREATE INDEX IF NOT EXISTS "DsdReport_reportDate_validationStatus_isLatest_idx" ON "DsdReport"("reportDate", "validationStatus", "isLatest");
CREATE UNIQUE INDEX IF NOT EXISTS "DsdReport_submissionId_revisionNumber_key" ON "DsdReport"("submissionId", "revisionNumber");

-- 8. Add Indexes on WhatsAppMessage
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_receivedAt_idx" ON "WhatsAppMessage"("receivedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_ingestionStatus_idx" ON "WhatsAppMessage"("ingestionStatus");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_messageHash_idx" ON "WhatsAppMessage"("messageHash");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_receivedAt_ingestionStatus_idx" ON "WhatsAppMessage"("receivedAt", "ingestionStatus");

-- 9. Add Indexes on AuditLog
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_idx" ON "AuditLog"("entity");
CREATE INDEX IF NOT EXISTS "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- 10. Add Indexes on SystemNotification
CREATE INDEX IF NOT EXISTS "SystemNotification_read_idx" ON "SystemNotification"("read");
CREATE INDEX IF NOT EXISTS "SystemNotification_createdAt_idx" ON "SystemNotification"("createdAt");
CREATE INDEX IF NOT EXISTS "SystemNotification_category_idx" ON "SystemNotification"("category");
CREATE INDEX IF NOT EXISTS "SystemNotification_type_idx" ON "SystemNotification"("type");
