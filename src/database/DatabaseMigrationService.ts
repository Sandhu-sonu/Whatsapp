import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { DatabaseError } from '../core/errors';
import { BackupService } from './BackupService';

export class DatabaseMigrationService {
  static async runMigrations(): Promise<number> {
    logger.info('DatabaseMigrationService: Starting schema migration check...');

    try {
      // 1. Ensure SchemaVersion table exists
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SchemaVersion" (
          "version" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Query current schema version
      const versionRows = await prisma.$queryRawUnsafe<{ version: number }[]>(
        'SELECT version FROM SchemaVersion ORDER BY version DESC LIMIT 1;'
      );
      const currentVersion = versionRows.length > 0 ? versionRows[0].version : 0;
      logger.info({ currentVersion }, `DatabaseMigrationService: Current schema version is ${currentVersion}`);

      // 3. Resolve migrations directory path
      let migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) {
        // Fallback for dist-electron built layout in packaged app
        migrationsDir = path.join(__dirname, '../src/database/migrations');
      }
      if (!fs.existsSync(migrationsDir)) {
        // Fallback for electron build package layout
        migrationsDir = path.join(process.resourcesPath || '', 'migrations');
      }
      if (!fs.existsSync(migrationsDir)) {
        // Fallback for local development execution from workspace root
        migrationsDir = path.join(__dirname, '../../src/database/migrations');
      }

      if (!fs.existsSync(migrationsDir)) {
        logger.warn({ migrationsDir }, 'DatabaseMigrationService: Migrations directory not found, skipping migrations');
        return currentVersion;
      }

      // 4. Read and sort migration SQL files
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort((a, b) => {
          const numA = parseInt(a.split('_')[0], 10);
          const numB = parseInt(b.split('_')[0], 10);
          return numA - numB;
        });

      let hasPending = false;
      for (const file of files) {
        const fileVersion = parseInt(file.split('_')[0], 10);
        if (!isNaN(fileVersion) && fileVersion > currentVersion) {
          hasPending = true;
          break;
        }
      }

      if (hasPending) {
        logger.info('DatabaseMigrationService: Pending migrations found, creating automatic backup...');
        try {
          await BackupService.createBackup('before_migration');
        } catch (backupErr) {
          logger.warn({ backupErr }, 'DatabaseMigrationService: Backup failed, but continuing with migration anyway...');
        }
      }

      let appliedCount = 0;
      let latestVersion = currentVersion;

      // 5. Apply pending migrations sequentially
      for (const file of files) {
        const versionStr = file.split('_')[0];
        const fileVersion = parseInt(versionStr, 10);

        if (isNaN(fileVersion)) {
          logger.warn({ file }, 'DatabaseMigrationService: Skipping migration file with invalid version format');
          continue;
        }

        if (fileVersion <= currentVersion) {
          continue;
        }

        logger.info({ file, fileVersion }, `DatabaseMigrationService: Applying migration ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf-8');

        // Split by semicolons, filtering comments
        const statements = sqlContent
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => {
            // Remove line comments and check if empty
            const clean = stmt.replace(/^--.*$/gm, '').trim();
            return clean.length > 0;
          });

        // Run statements in a transaction-like execution loop
        await prisma.$transaction(async (tx) => {
          for (const rawStmt of statements) {
            const statement = rawStmt.replace(/^--.*$/gm, '').trim();
            try {
              await tx.$executeRawUnsafe(statement);
            } catch (err: any) {
              const errMsg = err.message || '';
              // Gracefully ignore duplicate column/index errors during upgrades
              const isDuplicateColumn = errMsg.includes('duplicate column') || errMsg.includes('duplicate column name');
              const isDuplicateIndex = errMsg.includes('already exists') || errMsg.includes('already an index');
              
              if (isDuplicateColumn || isDuplicateIndex) {
                logger.debug({ statement, errMsg }, 'DatabaseMigrationService: Ignored duplicate schema column/index warning');
              } else {
                logger.error({ statement, err }, 'DatabaseMigrationService: Failed to execute statement');
                throw err;
              }
            }
          }

          // Record new version in SchemaVersion table
          await tx.$executeRawUnsafe(
            'INSERT INTO SchemaVersion (version, appliedAt) VALUES (?, CURRENT_TIMESTAMP);',
            fileVersion
          );
        });

        logger.info({ file, fileVersion }, `DatabaseMigrationService: Migration ${file} successfully applied`);
        appliedCount++;
        latestVersion = fileVersion;
      }

      logger.info({ appliedCount, latestVersion }, 'DatabaseMigrationService: Completed migrations check');
      return latestVersion;
    } catch (error: any) {
      logger.error({ error }, 'DatabaseMigrationService: Failed to apply database migrations');
      throw new DatabaseError('Failed to run database migrations.', error);
    }
  }
}
