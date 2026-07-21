import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { DatabaseError } from '../core/errors';

export class SubmissionRepository {
  private static getNormalizedDate(dateInput?: Date | string): Date | undefined {
  if (
    dateInput === undefined ||
    dateInput === null ||
    dateInput === ''
  ) {
    return undefined;
  }

  const d = new Date(dateInput);

  if (isNaN(d.getTime())) {
    return undefined;
  }

  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      0,
      0,
      0,
      0
    )
  );
}

  static async getLatestReportDate(): Promise<string | null> {
    try {
      const latest = await prisma.dailySubmission.findFirst({
        where: {
          reportDate: { not: new Date('1970-01-01T00:00:00Z') },
          district: { isActive: true }
        },
        orderBy: { reportDate: 'desc' },
        select: { reportDate: true }
      });
      if (latest && latest.reportDate) {
        return latest.reportDate.toISOString().split('T')[0];
      }
      return null;
    } catch (error: any) {
      logger.error({ error }, 'SubmissionRepository: Failed to get latest report date');
      return null;
    }
  }

  static async getDashboardSummary(fromDateInput: Date | string, toDateInput: Date | string) {
    const fromDate = this.getNormalizedDate(fromDateInput);
    const toDate = this.getNormalizedDate(toDateInput);
    if (!fromDate || !toDate) {
      throw new Error('Explicit date arguments fromDate and toDate are required.');
    }
    logger.debug({ fromDate, toDate }, 'SubmissionRepository: Querying summary date range');

    try {
      // 1. Count active districts
      const totalDistricts = await prisma.district.count({
        where: { isActive: true },
      });

      // 2. Count unique districts that submitted valid reports in this range (excluding 1970-01-01)
      const submissions = await prisma.dailySubmission.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          status: 'SUBMITTED',
          district: { isActive: true },
        },
        select: { districtId: true },
      });
      
      const uniqueSubmittedDistricts = new Set(submissions.map(s => s.districtId));
      const submittedCount = uniqueSubmittedDistricts.size;
      const pendingCount = Math.max(0, totalDistricts - submittedCount);

      // 3. Query all latest valid/warning reports in range (excluding 1970-01-01) for stats totals
      const reports = await prisma.dsdReport.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          isLatest: true,
          validationStatus: { in: ['VALID', 'WARNING'] },
          district: { isActive: true },
        },
      });

      let appointmentsBooked = 0;
      let served = 0;
      let cancelled = 0;
      let rescheduled = 0;

      for (const r of reports) {
        appointmentsBooked += r.appointmentsBooked;
        served += r.served;
        cancelled += r.cancelled;
        rescheduled += r.rescheduled;
      }

      const serviceRate = appointmentsBooked > 0 ? (served / appointmentsBooked) * 100 : 0;
      const cancellationRate = appointmentsBooked > 0 ? (cancelled / appointmentsBooked) * 100 : 0;
      const rescheduleRate = appointmentsBooked > 0 ? (rescheduled / appointmentsBooked) * 100 : 0;

      // 4. Query all latest reports in range for validation count breakouts
      const allLatestReports = await prisma.dsdReport.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          isLatest: true,
          district: { isActive: true },
        },
        select: { validationStatus: true }
      });

      let validCount = 0;
      let warningCount = 0;
      let invalidCount = 0;
      let manualReviewCount = 0;

      for (const r of allLatestReports) {
        if (r.validationStatus === 'VALID') validCount++;
        else if (r.validationStatus === 'WARNING') warningCount++;
        else if (r.validationStatus === 'INVALID') {
          invalidCount++;
          manualReviewCount++;
        }
      }

      return {
        totalDistricts,
        submittedCount,
        pendingCount,
        appointmentsBooked,
        served,
        cancelled,
        rescheduled,
        serviceRate,
        cancellationRate,
        rescheduleRate,
        validCount,
        warningCount,
        invalidCount,
        manualReviewCount,
      };
    } catch (error: any) {
      logger.error({ error }, 'SubmissionRepository: Failed to compile summary range');
      throw new DatabaseError('Failed to retrieve daily submission stats from SQLite.', error);
    }
  }

  static async getSubmissionsForRange(fromDateInput: Date | string, toDateInput: Date | string) {
    const fromDate = this.getNormalizedDate(fromDateInput);
    const toDate = this.getNormalizedDate(toDateInput);
    if (!fromDate || !toDate) {
      throw new Error('Explicit date arguments fromDate and toDate are required.');
    }

    try {
      return await prisma.dailySubmission.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          district: {
            isActive: true,
          },
        },
        include: { 
          district: true,
          reports: {
            where: { isLatest: true }
          }
        },
        orderBy: [
          { reportDate: 'desc' },
          { district: { name: 'asc' } }
        ],
      });
    } catch (error: any) {
      logger.error({ error }, 'SubmissionRepository: Failed to query submissions range');
      throw new DatabaseError('Failed to retrieve submissions range.', error);
    }
  }

  static async getSubmissionsForDate(dateInput: Date | string) {
    return await this.getSubmissionsForRange(dateInput, dateInput);
  }

  static async saveParsedReport(messageId: string, result: any) {
    const {
      districtId,
      reportDate,
      appointmentsBooked,
      served,
      cancelled,
      rescheduled,
      validationStatus: parsedStatus,
      validationErrors,
      confidence,
      parserMode,
      extraMetrics
    } = result;

    const validationStatus = parsedStatus === 'PARTIAL' ? 'WARNING' : parsedStatus;

    const normalizedDate = this.getNormalizedDate(reportDate);
    logger.info({ districtId, reportDate: normalizedDate }, 'SubmissionRepository: Saving parsed report');

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Fetch raw message to copy its receivedAt timestamp
        const message = await tx.whatsAppMessage.findUnique({
          where: { id: messageId },
          select: { receivedAt: true },
        });
        const receivedAt = message ? message.receivedAt : new Date();

        // 2. Create or Find DailySubmission
        let submission = await tx.dailySubmission.findUnique({
          where: {
            districtId_reportDate: {
              districtId,
              reportDate: normalizedDate!,
            },
          },
          include: {
            reports: true,
          },
        });

        if (!submission) {
          submission = await tx.dailySubmission.create({
            data: {
              districtId,
              reportDate: normalizedDate!,
              status: 'PENDING',
            },
            include: {
              reports: true,
            },
          });
        }

        // 3. Audit revision history
        const existingReports = submission.reports;
        const revisionNumber = existingReports.length;
        const previousReport = existingReports.find(r => r.isLatest);
        const previousReportId = previousReport ? previousReport.id : null;

        // Deactivate previous latest
        if (previousReport) {
          await tx.dsdReport.update({
            where: { id: previousReport.id },
            data: { isLatest: false },
          });
        }

        // Lookup or create parser engine reference
        const parserEngineId = await this.getOrCreateParserEngine(tx);

        // 4. Create the new DsdReport revision
        const newReport = await tx.dsdReport.create({
          data: {
            submissionId: submission.id,
            messageId,
            districtId,
            reportDate: normalizedDate!,
            receivedAt,
            previousReportId,
            appointmentsBooked,
            served,
            cancelled,
            rescheduled,
            validationStatus,
            validationErrors: JSON.stringify(validationErrors),
            confidence,
            isLatest: true,
            revisionNumber,
            parserMode,
            parserEngineId,
            rawExtractedJson: result.rawExtractedJson,
            processingDurationMs: result.processingDurationMs,
            metricsJson: JSON.stringify(extraMetrics || {}),
          },
        });

        // 5. Update DailySubmission summary status (marked as submitted for all validation statuses)
        await tx.dailySubmission.update({
          where: { id: submission.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });

        // 6. Update message association
        await tx.whatsAppMessage.update({
          where: { id: messageId },
          data: {
            districtId,
            ingestionStatus: validationStatus === 'INVALID' ? 'FAILED' : 'PARSED',
          },
        });

        return newReport;
      });
    } catch (error: any) {
      logger.error({ error, messageId }, 'SubmissionRepository: Failed to save parsed report');
      throw new DatabaseError('Failed to save parsed report in SQLite.', error);
    }
  }

  static async getManualReviewReports() {
    try {
      return await prisma.dsdReport.findMany({
        where: {
          validationStatus: { in: ['INVALID', 'WARNING'] },
          isLatest: true,
        },
        include: {
          submission: {
            include: { district: true },
          },
          message: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error: any) {
      throw new DatabaseError('Failed to query manual review records.', error);
    }
  }

  static async saveManualCorrection(reportId: string, correction: {
    appointmentsBooked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    reportDate?: string;
  }) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Find existing invalid report
        const oldReport = await tx.dsdReport.findUnique({
          where: { id: reportId },
          include: { submission: true },
        });

        if (!oldReport) {
          throw new Error('Report not found');
        }

        // Deactivate old report and free messageId to prevent unique constraint violation
        await tx.dsdReport.update({
          where: { id: oldReport.id },
          data: { 
            isLatest: false,
            messageId: null
          },
        });

        // Determine corrected date or use the old report's date
        const finalReportDate = correction.reportDate 
          ? this.getNormalizedDate(correction.reportDate)! 
          : oldReport.reportDate;

        // Find or create correct submission for this date and district
        let submission = await tx.dailySubmission.findUnique({
          where: {
            districtId_reportDate: {
              districtId: oldReport.districtId,
              reportDate: finalReportDate,
            },
          },
          include: {
            reports: true,
          },
        });

        if (!submission) {
          submission = await tx.dailySubmission.create({
            data: {
              districtId: oldReport.districtId,
              reportDate: finalReportDate,
              status: 'PENDING',
            },
            include: {
              reports: true,
            },
          });
        }

        // Deactivate previous latest on the target submission
        const previousReport = submission.reports.find(r => r.isLatest);
        if (previousReport) {
          await tx.dsdReport.update({
            where: { id: previousReport.id },
            data: { isLatest: false },
          });
        }

        // Lookup or create parser engine reference
        const parserEngineId = await this.getOrCreateParserEngine(tx);

        // Create new manually corrected report revision
        const newReport = await tx.dsdReport.create({
          data: {
            submissionId: submission.id,
            messageId: oldReport.messageId,
            districtId: oldReport.districtId,
            reportDate: finalReportDate,
            receivedAt: oldReport.receivedAt,
            previousReportId: oldReport.id,
            appointmentsBooked: correction.appointmentsBooked,
            served: correction.served,
            cancelled: correction.cancelled,
            rescheduled: correction.rescheduled,
            validationStatus: 'VALID', 
            validationErrors: '[]',
            confidence: 100, 
            isLatest: true,
            revisionNumber: submission.reports.length,
            parserMode: 'MANUAL',
            parserEngineId,
            metricsJson: '{}',
          },
        });

        // Update DailySubmission to SUBMITTED
        await tx.dailySubmission.update({
          where: { id: submission.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });

        // Update WhatsAppMessage status to parsed
        if (oldReport.messageId) {
          await tx.whatsAppMessage.update({
            where: { id: oldReport.messageId },
            data: {
              ingestionStatus: 'PARSED',
            },
          });
        }

        const oldState = {
          appointmentsBooked: oldReport.appointmentsBooked,
          served: oldReport.served,
          cancelled: oldReport.cancelled,
          rescheduled: oldReport.rescheduled,
          reportDate: oldReport.reportDate.toISOString().split('T')[0],
          validationStatus: oldReport.validationStatus
        };
        const newState = {
          appointmentsBooked: correction.appointmentsBooked,
          served: correction.served,
          cancelled: correction.cancelled,
          rescheduled: correction.rescheduled,
          reportDate: finalReportDate.toISOString().split('T')[0],
          validationStatus: 'VALID'
        };

        await tx.auditLog.create({
          data: {
            action: 'REPORT_CORRECTED',
            entity: 'DsdReport',
            entityId: newReport.id,
            beforeJson: JSON.stringify(oldState),
            afterJson: JSON.stringify(newState),
            userName: 'Operator'
          }
        });

        return newReport;
      });
    } catch (error: any) {
      logger.error({ error, reportId }, 'SubmissionRepository: Failed to save manual correction');
      throw new DatabaseError('Failed to save manual review overrides.', error);
    }
  }

  static async saveReplayReport(
    reportId: string,
    result: {
      appointmentsBooked: number;
      served: number;
      cancelled: number;
      rescheduled: number;
      reportDate: Date;
      validationStatus: 'VALID' | 'PARTIAL' | 'INVALID';
      validationErrors: string[];
      confidence: number;
      parserMode: string;
      extraMetrics: any;
      rawExtractedJson?: string;
      processingDurationMs?: number;
    },
    userName: string = 'Operator'
  ) {
    try {
      const {
        reportDate,
        appointmentsBooked,
        served,
        cancelled,
        rescheduled,
        validationStatus: parsedStatus,
        validationErrors,
        confidence,
        parserMode,
        extraMetrics
      } = result;

      const validationStatus = parsedStatus === 'PARTIAL' ? 'WARNING' : parsedStatus;
      const normalizedDate = this.getNormalizedDate(reportDate);

      return await prisma.$transaction(async (tx) => {
        const oldReport = await tx.dsdReport.findUnique({
          where: { id: reportId },
        });

        if (!oldReport) {
          throw new Error('Report not found');
        }

        // Deactivate old report
        await tx.dsdReport.update({
          where: { id: oldReport.id },
          data: { isLatest: false },
        });

        // Find or create DailySubmission
        let submission = await tx.dailySubmission.findUnique({
          where: {
            districtId_reportDate: {
              districtId: oldReport.districtId,
              reportDate: normalizedDate!,
            },
          },
          include: {
            reports: true,
          },
        });

        if (!submission) {
          submission = await tx.dailySubmission.create({
            data: {
              districtId: oldReport.districtId,
              reportDate: normalizedDate!,
              status: 'PENDING',
            },
            include: {
              reports: true,
            },
          });
        }

        const existingReports = submission.reports;
        const revisionNumber = existingReports.length;
        const previousReport = existingReports.find(r => r.isLatest);

        if (previousReport) {
          await tx.dsdReport.update({
            where: { id: previousReport.id },
            data: { isLatest: false },
          });
        }

        // Lookup or create parser engine reference
        const parserEngineId = await this.getOrCreateParserEngine(tx);

        // Create new DsdReport
        const newReport = await tx.dsdReport.create({
          data: {
            submissionId: submission.id,
            messageId: oldReport.messageId,
            districtId: oldReport.districtId,
            reportDate: normalizedDate!,
            receivedAt: oldReport.receivedAt,
            previousReportId: oldReport.id,
            appointmentsBooked,
            served,
            cancelled,
            rescheduled,
            validationStatus,
            validationErrors: JSON.stringify(validationErrors),
            confidence,
            isLatest: true,
            revisionNumber,
            parserMode,
            parserEngineId,
            rawExtractedJson: result.rawExtractedJson,
            processingDurationMs: result.processingDurationMs,
            metricsJson: JSON.stringify(extraMetrics || {}),
          },
        });

        // Update DailySubmission summary status
        await tx.dailySubmission.update({
          where: { id: submission.id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
          },
        });

        // Update WhatsAppMessage status
        if (oldReport.messageId) {
          await tx.whatsAppMessage.update({
            where: { id: oldReport.messageId },
            data: {
              ingestionStatus: validationStatus === 'INVALID' ? 'FAILED' : 'PARSED',
            },
          });
        }

        // Log audit trail
        const oldState = {
          appointmentsBooked: oldReport.appointmentsBooked,
          served: oldReport.served,
          cancelled: oldReport.cancelled,
          rescheduled: oldReport.rescheduled,
          reportDate: oldReport.reportDate.toISOString().split('T')[0],
          validationStatus: oldReport.validationStatus
        };
        const newState = {
          appointmentsBooked,
          served,
          cancelled,
          rescheduled,
          reportDate: normalizedDate!.toISOString().split('T')[0],
          validationStatus
        };

        await tx.auditLog.create({
          data: {
            action: 'REPORT_REPLAY',
            entity: 'DsdReport',
            entityId: newReport.id,
            beforeJson: JSON.stringify(oldState),
            afterJson: JSON.stringify(newState),
            userName
          }
        });

        return newReport;
      });
    } catch (error: any) {
      logger.error({ error, reportId }, 'SubmissionRepository: Failed to save replayed report correction');
      throw new DatabaseError('Failed to save replayed report correction in SQLite.', error);
    }
  }

  // --- ANALYTICS REPORTS METHODS ---

  static async getDistrictHistory(districtId: string, fromDateInput: string, toDateInput: string) {
    const fromDate = this.getNormalizedDate(fromDateInput);
    const toDate = this.getNormalizedDate(toDateInput);
    if (!fromDate || !toDate) {
      throw new Error('Explicit date arguments fromDate and toDate are required.');
    }
    try {
      return await prisma.dsdReport.findMany({
        where: {
          districtId,
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
        },
        orderBy: [
          { reportDate: 'desc' },
          { revisionNumber: 'desc' }
        ],
      });
    } catch (error: any) {
      throw new DatabaseError('Failed to query district history report.', error);
    }
  }

  static async getMonthlyReport(month: number, year: number) {
    if (!month || !year) {
      throw new Error('Explicit arguments month and year are required.');
    }
    const fromDate = new Date(Date.UTC(year, month - 1, 1));
    const toDate = new Date(Date.UTC(year, month, 0)); // Last day of month
    try {
      const reports = await prisma.dsdReport.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          isLatest: true,
          validationStatus: { in: ['VALID', 'WARNING'] },
          district: { isActive: true },
        },
        include: { district: true },
      });

      const map = new Map<string, any>();
      for (const r of reports) {
        const key = r.district.name;
        const existing = map.get(key) || { booked: 0, served: 0, cancelled: 0, rescheduled: 0, count: 0 };
        existing.booked += r.appointmentsBooked;
        existing.served += r.served;
        existing.cancelled += r.cancelled;
        existing.rescheduled += r.rescheduled;
        existing.count++;
        map.set(key, existing);
      }

      return Array.from(map.entries()).map(([districtName, s]) => ({
        districtName,
        booked: s.booked,
        served: s.served,
        cancelled: s.cancelled,
        rescheduled: s.rescheduled,
        serviceRate: s.booked > 0 ? (s.served / s.booked) * 100 : 0,
        cancellationRate: s.booked > 0 ? (s.cancelled / s.booked) * 100 : 0,
        rescheduleRate: s.booked > 0 ? (s.rescheduled / s.booked) * 100 : 0,
        submissionsCount: s.count,
      }));
    } catch (error: any) {
      throw new DatabaseError('Failed to query monthly reports.', error);
    }
  }

  static async getLateSubmissionsReport(fromDateInput: string, toDateInput: string) {
    const fromDate = this.getNormalizedDate(fromDateInput);
    const toDate = this.getNormalizedDate(toDateInput);
    if (!fromDate || !toDate) {
      throw new Error('Explicit date arguments fromDate and toDate are required.');
    }
    try {
      const reports = await prisma.dsdReport.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          isLatest: true,
          validationStatus: { in: ['VALID', 'WARNING'] },
          district: { isActive: true },
        },
        include: { district: true },
      });

      return reports.filter(r => {
        const received = new Date(r.receivedAt);
        const reportMidnight = new Date(r.reportDate);
        // Cut-off is 17:00 (5:00 PM) on reportDate
        const deadline = new Date(reportMidnight.getTime() + 17 * 60 * 60 * 1000);
        return received.getTime() > deadline.getTime();
      }).map(r => {
        const delayMs = new Date(r.receivedAt).getTime() - new Date(r.reportDate).getTime() - 17 * 60 * 60 * 1000;
        const delayHours = Math.max(0, delayMs / (1000 * 60 * 60));
        return {
          districtName: r.district.name,
          reportDate: r.reportDate,
          receivedAt: r.receivedAt,
          delayHours,
        };
      });
    } catch (error: any) {
      throw new DatabaseError('Failed to compile late submission report.', error);
    }
  }

  static async getDistrictPerformance(fromDateInput: string, toDateInput: string) {
    const fromDate = this.getNormalizedDate(fromDateInput);
    const toDate = this.getNormalizedDate(toDateInput);
    if (!fromDate || !toDate) {
      throw new Error('Explicit date arguments fromDate and toDate are required.');
    }
    try {
      const reports = await prisma.dsdReport.findMany({
        where: {
          reportDate: {
            gte: fromDate,
            lte: toDate,
            not: new Date('1970-01-01T00:00:00Z')
          },
          isLatest: true,
          validationStatus: { in: ['VALID', 'WARNING'] },
          district: { isActive: true },
        },
        include: { district: true },
      });

      const list = reports.map(r => {
        const booked = r.appointmentsBooked;
        return {
          districtName: r.district.name,
          booked,
          served: r.served,
          cancelled: r.cancelled,
          rescheduled: r.rescheduled,
          serviceRate: booked > 0 ? (r.served / booked) * 100 : 0,
          cancellationRate: booked > 0 ? (r.cancelled / booked) * 100 : 0,
          rescheduleRate: booked > 0 ? (r.rescheduled / booked) * 100 : 0,
        };
      });

      return list.sort((a, b) => b.serviceRate - a.serviceRate);
    } catch (error: any) {
      throw new DatabaseError('Failed to retrieve performance report.', error);
    }
  }

  static async getSubmissionTimeline(dateInput: string) {
    const reportDate = this.getNormalizedDate(dateInput);
    if (!reportDate) {
      throw new Error('Explicit date argument reportDate is required.');
    }
    try {
      const reports = await prisma.dsdReport.findMany({
        where: {
          reportDate,
          isLatest: true,
          district: { isActive: true },
        },
        include: { district: true },
        orderBy: { receivedAt: 'asc' },
      });

      return reports.map(r => ({
        districtName: r.district.name,
        receivedAt: r.receivedAt,
        parserMode: r.parserMode,
        validationStatus: r.validationStatus,
        booked: r.appointmentsBooked,
      }));
    } catch (error: any) {
      throw new DatabaseError('Failed to query submission timeline.', error);
    }
  }

  static async compileDailyAuditSnapshot(dateInput: string | Date): Promise<any> {
    const reportDate = this.getNormalizedDate(dateInput);
    if (!reportDate) {
      throw new Error('Explicit date argument reportDate is required.');
    }

    try {
      const expectedDistricts = await prisma.district.count({ where: { isActive: true } });
      const districts = await prisma.district.findMany({ where: { isActive: true } });

      const submissions = await prisma.dailySubmission.findMany({
        where: { reportDate },
        include: {
          reports: {
            where: { isLatest: true }
          }
        }
      });

      const reports = await prisma.dsdReport.findMany({
        where: { reportDate, isLatest: true },
        include: { district: true }
      });

      const submittedCount = submissions.filter(s => s.status === 'SUBMITTED').length;
      const pendingCount = Math.max(0, expectedDistricts - submittedCount);

      let validCount = 0;
      let warningCount = 0;
      let invalidCount = 0;
      let confidenceSum = 0;

      let firstSubmissionTime: Date | null = null;
      let lastSubmissionTime: Date | null = null;

      for (const r of reports) {
        if (r.validationStatus === 'VALID') validCount++;
        else if (r.validationStatus === 'WARNING') warningCount++;
        else if (r.validationStatus === 'INVALID') invalidCount++;

        confidenceSum += r.confidence;

        if (!firstSubmissionTime || r.receivedAt < firstSubmissionTime) {
          firstSubmissionTime = r.receivedAt;
        }
        if (!lastSubmissionTime || r.receivedAt > lastSubmissionTime) {
          lastSubmissionTime = r.receivedAt;
        }
      }

      // Count messages parsed/ignored
      const duplicateCount = await prisma.whatsAppMessage.count({
        where: {
          receivedAt: {
            gte: reportDate,
            lt: new Date(reportDate.getTime() + 24 * 60 * 60 * 1000)
          },
          ingestionStatus: 'IGNORED'
        }
      });

      const manualReviewCount = reports.filter(r => r.validationStatus === 'INVALID').length;
      
      const completionPercentage = expectedDistricts > 0 ? (submittedCount / expectedDistricts) * 100 : 0;
      const averageConfidence = reports.length > 0 ? confidenceSum / reports.length : 0;
      const parserSuccessRate = reports.length > 0 ? ((validCount + warningCount) / reports.length) * 100 : 0;

      const districtSnapshotDetails = districts.map(d => {
        const sub = submissions.find(s => s.districtId === d.id);
        const rep = reports.find(r => r.districtId === d.id);
        return {
          districtId: d.id,
          districtName: d.name,
          submitted: sub ? sub.status === 'SUBMITTED' : false,
          validationStatus: rep ? rep.validationStatus : 'PENDING',
          receivedAt: rep ? rep.receivedAt : null,
          confidence: rep ? rep.confidence : null,
          revision: rep ? rep.revisionNumber : 0
        };
      });

      const snapshotDataJson = JSON.stringify(districtSnapshotDetails);

      // Create snapshot record in SQLite (upsert to prevent duplicate conflicts if run twice)
      const existingSnapshot = await prisma.dailyAuditSnapshot.findFirst({
        where: { reportDate }
      });

      if (existingSnapshot) {
        return await prisma.dailyAuditSnapshot.update({
          where: { id: existingSnapshot.id },
          data: {
            expectedDistricts,
            submittedCount,
            pendingCount,
            validCount,
            warningCount,
            invalidCount,
            manualReviewCount,
            duplicateCount,
            firstSubmissionTime,
            lastSubmissionTime,
            completionPercentage,
            averageConfidence,
            parserSuccessRate,
            workerVersion: '1.0.0',
            parserVersion: '2.1.4',
            snapshotDataJson
          }
        });
      }

      return await prisma.dailyAuditSnapshot.create({
        data: {
          reportDate,
          expectedDistricts,
          submittedCount,
          pendingCount,
          validCount,
          warningCount,
          invalidCount,
          manualReviewCount,
          duplicateCount,
          firstSubmissionTime,
          lastSubmissionTime,
          completionPercentage,
          averageConfidence,
          parserSuccessRate,
          workerVersion: '1.0.0',
          parserVersion: '2.1.4',
          snapshotDataJson
        }
      });
    } catch (error: any) {
      logger.error({ error, reportDate }, 'SubmissionRepository: Failed to compile daily audit snapshot');
      throw new DatabaseError('Failed to compile daily audit snapshot.', error);
    }
  }

  private static async getOrCreateParserEngine(tx: any): Promise<string | null> {
    try {
      const engine = await tx.parserEngine.findFirst({
        where: {
          name: 'RegexParser',
          version: '2.1.4',
          build: '2026.07.18'
        }
      });
      if (engine) return engine.id;
      
      const newEngine = await tx.parserEngine.create({
        data: {
          name: 'RegexParser',
          version: '2.1.4',
          build: '2026.07.18'
        }
      });
      return newEngine.id;
    } catch (error) {
      logger.warn({ error }, 'SubmissionRepository: Failed to get/create ParserEngine');
      return null;
    }
  }
}
