"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionRepository = void 0;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const errors_1 = require("../core/errors");
class SubmissionRepository {
    static getNormalizedDate(dateInput) {
        const d = new Date(dateInput);
        // Reset to UTC midnight
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
    }
    static async getDashboardSummary(dateInput = new Date()) {
        const reportDate = this.getNormalizedDate(dateInput);
        logger_1.logger.debug({ reportDate }, 'SubmissionRepository: Querying dashboard summary');
        try {
            // 1. Count active districts
            const totalDistricts = await prisma_1.prisma.district.count({
                where: { isActive: true },
            });
            // 2. Count submitted reports for today
            const submittedCount = await prisma_1.prisma.dailySubmission.count({
                where: {
                    reportDate,
                    status: 'SUBMITTED',
                    district: { isActive: true },
                },
            });
            const pendingCount = Math.max(0, totalDistricts - submittedCount);
            return {
                totalDistricts,
                submittedCount,
                pendingCount,
            };
        }
        catch (error) {
            logger_1.logger.error({ error }, 'SubmissionRepository: Failed to compile dashboard summary');
            throw new errors_1.DatabaseError('Failed to retrieve daily submission stats from SQLite.', error);
        }
    }
    static async getSubmissionsForDate(dateInput) {
        const reportDate = this.getNormalizedDate(dateInput);
        logger_1.logger.debug({ reportDate }, 'SubmissionRepository: Querying submissions for date');
        try {
            return await prisma_1.prisma.dailySubmission.findMany({
                where: { reportDate },
                include: { district: true },
                orderBy: { district: { name: 'asc' } },
            });
        }
        catch (error) {
            logger_1.logger.error({ error }, 'SubmissionRepository: Failed to query submissions for date');
            throw new errors_1.DatabaseError('Failed to retrieve submissions.', error);
        }
    }
}
exports.SubmissionRepository = SubmissionRepository;
