import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export class AuditRepository {
  static async log(
    action: 'REPORT_REPLAY' | 'REPORT_APPROVED' | 'REPORT_CORRECTED' | 'REPORT_REJECTED' | 'MANUAL_REVIEW' | 'SETTINGS_CHANGED' | 'DATABASE_BACKUP' | 'DATABASE_RESTORE' | 'LOGIN' | 'LOGOUT',
    entity: string,
    entityId: string,
    before: any,
    after: any,
    userName: string = 'Operator'
  ) {
    try {
      const beforeJson = before ? JSON.stringify(before) : null;
      const afterJson = after ? JSON.stringify(after) : null;

      const logEntry = await prisma.auditLog.create({
        data: {
          action,
          entity,
          entityId,
          beforeJson,
          afterJson,
          userName,
        },
      });
      logger.debug({ logEntry }, 'AuditRepository: Logged action successfully');
      return logEntry;
    } catch (error: any) {
      logger.error({ error, action, entity, entityId }, 'AuditRepository: Failed to create log entry');
      return null;
    }
  }

  static async getLogs(limit = 100) {
    try {
      return await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    } catch (error: any) {
      logger.error({ error }, 'AuditRepository: Failed to query audit logs');
      return [];
    }
  }
}
