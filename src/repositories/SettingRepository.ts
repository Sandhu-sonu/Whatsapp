import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { DatabaseError } from '../core/errors';

export class SettingRepository {
  static async getAll() {
    logger.debug('SettingRepository: Querying all settings');
    try {
      const settings = await prisma.setting.findMany();
      // Map to an easy to use key-value record
      const record: Record<string, string> = {};
      for (const s of settings) {
        record[s.key] = s.value;
      }
      return record;
    } catch (error: any) {
      logger.error({ error }, 'SettingRepository: Failed to query settings');
      throw new DatabaseError('Failed to load settings from database.', error);
    }
  }

  static async save(key: string, value: string) {
    logger.debug({ key, value }, 'SettingRepository: Saving setting');
    try {
      return await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    } catch (error: any) {
      logger.error({ error, key, value }, 'SettingRepository: Failed to save setting');
      throw new DatabaseError(`Failed to save setting for key "${key}".`, error);
    }
  }
}
