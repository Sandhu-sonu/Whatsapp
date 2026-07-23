import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { AuditRepository } from '../repositories/AuditRepository';

export class BackupService {
  public static getDbPath(): string {
    const isDev = !app.isPackaged;
    const dbDir = isDev
      ? path.join(app.getAppPath(), 'database')
      : path.join(app.getPath('userData'), 'database');
    return path.join(dbDir, 'dsd-tracker.db');
  }

  public static getBackupsDir(): string {
    const baseDir = app.isPackaged ? app.getPath('userData') : app.getAppPath();
    const dir = app.isPackaged 
      ? path.join(baseDir, 'backups') 
      : path.join(baseDir, 'database', 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public static async createBackup(reason: string): Promise<string> {
    try {
      const dbPath = this.getDbPath();
      const backupsDir = this.getBackupsDir();

      if (!fs.existsSync(dbPath)) {
        logger.warn('BackupService: Database file not found, skipping backup.');
        return '';
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedReason = reason.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filename = `dsd-tracker_backup_${sanitizedReason}_${timestamp}.db`;
      const targetPath = path.join(backupsDir, filename);

      fs.copyFileSync(dbPath, targetPath);
      const stats = fs.statSync(targetPath);

      logger.info({ filename, reason }, 'BackupService: Backup created successfully');

      // Log to Audit trail
      await AuditRepository.log(
        'DATABASE_BACKUP',
        'Database',
        'dsd-tracker.db',
        null,
        { backupFile: filename, sizeBytes: stats.size, reason }
      );

      // Trigger automatic cleanup of old backups
      await this.cleanupOldBackups();

      return filename;
    } catch (error: any) {
      logger.error(error, 'BackupService: Failed to create database backup');
      throw error;
    }
  }

  public static async cleanupOldBackups() {
    try {
      // Query settings for limits
      const settingsList = await prisma.setting.findMany();
      const settings: Record<string, string> = {};
      for (const s of settingsList) {
        settings[s.key] = s.value;
      }

      const maxBackups = parseInt(settings['Max Backup Count'] || '10', 10);
      const retentionDays = parseInt(settings['Retention Policy'] || '30', 10);

      const backupsDir = this.getBackupsDir();
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('dsd-tracker_backup_') && f.endsWith('.db'))
        .map(f => {
          const filePath = path.join(backupsDir, f);
          const stats = fs.statSync(filePath);
          return { name: f, path: filePath, mtime: stats.mtimeMs };
        });

      if (files.length === 0) return;

      // Sort by modified time ascending (oldest first)
      files.sort((a, b) => a.mtime - b.mtime);

      const now = Date.now();
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      
      const toDeletePaths = new Set<string>();

      // 1. Prune backups older than retention days limit
      for (const file of files) {
        const ageMs = now - file.mtime;
        if (ageMs > retentionMs) {
          toDeletePaths.add(file.path);
          logger.info({ file: file.name, ageDays: (ageMs / (24*60*60*1000)).toFixed(1) }, 'BackupService: Flagged backup for deletion (exceeded retention policy)');
        }
      }

      // 2. Prune excess backups if remaining count exceeds max count limit
      const remainingFiles = files.filter(f => !toDeletePaths.has(f.path));
      if (remainingFiles.length > maxBackups) {
        const excessCount = remainingFiles.length - maxBackups;
        for (let i = 0; i < excessCount; i++) {
          toDeletePaths.add(remainingFiles[i].path);
          logger.info({ file: remainingFiles[i].name }, 'BackupService: Flagged backup for deletion (exceeded max count)');
        }
      }

      // Perform deletions
      for (const filePath of toDeletePaths) {
        fs.unlinkSync(filePath);
        logger.info({ file: path.basename(filePath) }, 'BackupService: Deleted old backup file');
      }
    } catch (e) {
      logger.error(e, 'BackupService: Failed to clean up old backups');
    }
  }
}
