import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { DatabaseError } from '../core/errors';

export class DistrictRepository {
  static async getAll() {
    logger.debug('DistrictRepository: Querying all districts');
    try {
      return await prisma.district.findMany({
        orderBy: { name: 'asc' },
      });
    } catch (error: any) {
      logger.error({ error }, 'DistrictRepository: Failed to query all districts');
      throw new DatabaseError('Failed to retrieve districts from the database.', error);
    }
  }

  static async getActive() {
    logger.debug('DistrictRepository: Querying active districts');
    try {
      return await prisma.district.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    } catch (error: any) {
      logger.error({ error }, 'DistrictRepository: Failed to query active districts');
      throw new DatabaseError('Failed to retrieve active districts.', error);
    }
  }
}
