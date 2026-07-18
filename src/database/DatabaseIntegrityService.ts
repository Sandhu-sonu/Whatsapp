import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { NotificationRepository } from '../repositories/NotificationRepository';

export interface IntegrityCheckResult {
  passed: boolean;
  errors: string[];
}

export class DatabaseIntegrityService {
  static async checkIntegrity(): Promise<IntegrityCheckResult> {
    logger.info('DatabaseIntegrityService: Starting database integrity check...');
    const errors: string[] = [];

    try {
      // 1. Run PRAGMA foreign_key_check
      const fkCheck = await prisma.$queryRawUnsafe<{ table: string; rowid: number; parent: string; fkid: number }[]>(
        'PRAGMA foreign_key_check;'
      );
      if (fkCheck.length > 0) {
        errors.push(`Foreign Key Violations found: ${fkCheck.map(v => `${v.table} (rowid: ${v.rowid}) -> parent: ${v.parent}`).join(', ')}`);
      }

      // 2. Every WhatsAppMessage linked to at most one DsdReport
      const dupMessages = await prisma.$queryRawUnsafe<{ messageId: string; cnt: number }[]>(
        'SELECT messageId, COUNT(*) as cnt FROM DsdReport WHERE messageId IS NOT NULL GROUP BY messageId HAVING cnt > 1;'
      );
      if (dupMessages.length > 0) {
        errors.push(`Integrity Violation: Multiple DsdReport records reference the same WhatsApp message ID(s): ${dupMessages.map(m => m.messageId).join(', ')}`);
      }

      // 3. Every DailySubmission has at most one isLatest = true report
      const dupLatest = await prisma.$queryRawUnsafe<{ submissionId: string; cnt: number }[]>(
        'SELECT submissionId, COUNT(*) as cnt FROM DsdReport WHERE isLatest = 1 GROUP BY submissionId HAVING cnt > 1;'
      );
      if (dupLatest.length > 0) {
        errors.push(`Integrity Violation: Multiple reports marked as isLatest=true found for submission ID(s): ${dupLatest.map(s => s.submissionId).join(', ')}`);
      }

      // 4. No orphan DsdReport records (checked via DB keys, but verify reference validity)
      const orphans = await prisma.$queryRawUnsafe<{ id: string }[]>(
        'SELECT id FROM DsdReport WHERE submissionId NOT IN (SELECT id FROM DailySubmission);'
      );
      if (orphans.length > 0) {
        errors.push(`Integrity Violation: Orphaned DsdReport records found referencing missing DailySubmissions: ${orphans.map(r => r.id).join(', ')}`);
      }

      // 5. No DsdReport.reportDate differing from its linked DailySubmission.reportDate
      const dateMismatches = await prisma.$queryRawUnsafe<{ id: string; repDate: string; subDate: string }[]>(
        'SELECT r.id, r.reportDate as repDate, s.reportDate as subDate FROM DsdReport r JOIN DailySubmission s ON r.submissionId = s.id WHERE r.reportDate != s.reportDate;'
      );
      if (dateMismatches.length > 0) {
        errors.push(`Integrity Violation: Report date mismatch with parent submission for report ID(s): ${dateMismatches.map(m => `${m.id} (report:${m.repDate} vs submission:${m.subDate})`).join(', ')}`);
      }

      // 6. Math: served + cancelled + rescheduled <= appointmentsBooked for VALID/WARNING reports
      const mathMismatches = await prisma.$queryRawUnsafe<{ id: string; booked: number; actualSum: number }[]>(
        "SELECT id, appointmentsBooked as booked, (served + cancelled + rescheduled) as actualSum FROM DsdReport WHERE (validationStatus = 'VALID' OR validationStatus = 'WARNING') AND (served + cancelled + rescheduled > appointmentsBooked);"
      );
      if (mathMismatches.length > 0) {
        errors.push(`Integrity Violation: Sum of outcomes exceeds booked appointments for report ID(s): ${mathMismatches.map(m => `${m.id} (booked:${m.booked} vs sum:${m.actualSum})`).join(', ')}`);
      }

      const passed = errors.length === 0;

      if (!passed) {
        logger.error({ errors }, 'DatabaseIntegrityService: Database integrity checks failed!');
        await NotificationRepository.create(
          'ERROR',
          'SYSTEM',
          'Database Integrity Failure',
          `Integrity checks failed on startup:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...and others.' : ''}`
        );
      } else {
        logger.info('DatabaseIntegrityService: All integrity checks passed successfully.');
      }

      return { passed, errors };
    } catch (error: any) {
      logger.error({ error }, 'DatabaseIntegrityService: Failed to execute integrity audits');
      const crashMsg = `Database integrity execution crashed: ${error.message || error}`;
      errors.push(crashMsg);
      await NotificationRepository.create(
        'WARNING',
        'SYSTEM',
        'Integrity Check Crashed',
        crashMsg
      );
      return { passed: false, errors };
    }
  }
}
