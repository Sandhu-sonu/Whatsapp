"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingRepository = void 0;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const errors_1 = require("../core/errors");
class SettingRepository {
    static async getAll() {
        logger_1.logger.debug('SettingRepository: Querying all settings');
        try {
            const settings = await prisma_1.prisma.setting.findMany();
            // Map to an easy to use key-value record
            const record = {};
            for (const s of settings) {
                record[s.key] = s.value;
            }
            return record;
        }
        catch (error) {
            logger_1.logger.error({ error }, 'SettingRepository: Failed to query settings');
            throw new errors_1.DatabaseError('Failed to load settings from database.', error);
        }
    }
    static async save(key, value) {
        logger_1.logger.debug({ key, value }, 'SettingRepository: Saving setting');
        try {
            return await prisma_1.prisma.setting.upsert({
                where: { key },
                update: { value },
                create: { key, value },
            });
        }
        catch (error) {
            logger_1.logger.error({ error, key, value }, 'SettingRepository: Failed to save setting');
            throw new errors_1.DatabaseError(`Failed to save setting for key "${key}".`, error);
        }
    }
}
exports.SettingRepository = SettingRepository;
