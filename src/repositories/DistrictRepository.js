"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistrictRepository = void 0;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const errors_1 = require("../core/errors");
class DistrictRepository {
    static async getAll() {
        logger_1.logger.debug('DistrictRepository: Querying all districts');
        try {
            return await prisma_1.prisma.district.findMany({
                orderBy: { name: 'asc' },
            });
        }
        catch (error) {
            logger_1.logger.error({ error }, 'DistrictRepository: Failed to query all districts');
            throw new errors_1.DatabaseError('Failed to retrieve districts from the database.', error);
        }
    }
    static async getActive() {
        logger_1.logger.debug('DistrictRepository: Querying active districts');
        try {
            return await prisma_1.prisma.district.findMany({
                where: { isActive: true },
                orderBy: { name: 'asc' },
            });
        }
        catch (error) {
            logger_1.logger.error({ error }, 'DistrictRepository: Failed to query active districts');
            throw new errors_1.DatabaseError('Failed to retrieve active districts.', error);
        }
    }
}
exports.DistrictRepository = DistrictRepository;
