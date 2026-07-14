import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Initialize directory in dev mode before loading DB Client
const isDev = !app.isPackaged;
if (isDev) {
  const dbDir = path.join(app.getAppPath(), 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

// Import repositories and logger
import { logger } from '../src/lib/logger';
import { DistrictRepository } from '../src/repositories/DistrictRepository';
import { SubmissionRepository } from '../src/repositories/SubmissionRepository';
import { SettingRepository } from '../src/repositories/SettingRepository';
import { MessageRepository } from '../src/repositories/MessageRepository';
import { WorkerManager } from './WorkerManager';
import { AuditRepository } from '../src/repositories/AuditRepository';
import { NotificationRepository } from '../src/repositories/NotificationRepository';
import { parseReport } from '../src/lib/parser/pipeline';
import { prisma } from '../src/lib/prisma';

let mainWindow: BrowserWindow | null = null;

// Initialize Worker Manager
const workerManager = new WorkerManager((state) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('worker-status-changed', workerManager.getStatus());
  }
});

function createWindow() {
  logger.info('Database Started: Initializing window framework');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register database IPC handlers
ipcMain.handle('db-get-districts', async () => {
  logger.info('Repository Query: db-get-districts requested');
  return await DistrictRepository.getActive();
});

ipcMain.handle('db-get-latest-report-date', async () => {
  logger.info('Repository Query: db-get-latest-report-date requested');
  return await SubmissionRepository.getLatestReportDate();
});

ipcMain.handle('db-get-dashboard-summary', async (_event, fromDate?: string, toDate?: string) => {
  logger.info({ fromDate, toDate }, 'Repository Query: db-get-dashboard-summary requested');
  let finalFrom = fromDate;
  let finalTo = toDate;
  if (!finalFrom || !finalTo) {
    const latest = await SubmissionRepository.getLatestReportDate();
    finalFrom = latest || new Date().toISOString().split('T')[0];
    finalTo = latest || new Date().toISOString().split('T')[0];
  }
  return await SubmissionRepository.getDashboardSummary(finalFrom, finalTo);
});

ipcMain.handle('db-get-submissions-for-date', async (_event, date: string) => {
  logger.info({ date }, 'Repository Query: db-get-submissions-for-date requested');
  return await SubmissionRepository.getSubmissionsForDate(date);
});

ipcMain.handle('db-get-submissions-range', async (_event, fromDate?: string, toDate?: string) => {
  logger.info({ fromDate, toDate }, 'Repository Query: db-get-submissions-range requested');
  let finalFrom = fromDate;
  let finalTo = toDate;
  if (!finalFrom || !finalTo) {
    const latest = await SubmissionRepository.getLatestReportDate();
    finalFrom = latest || new Date().toISOString().split('T')[0];
    finalTo = latest || new Date().toISOString().split('T')[0];
  }
  return await SubmissionRepository.getSubmissionsForRange(finalFrom, finalTo);
});

ipcMain.handle('db-get-district-history', async (_event, districtId: string, fromDate: string, toDate: string) => {
  logger.info({ districtId, fromDate, toDate }, 'Repository Query: db-get-district-history requested');
  return await SubmissionRepository.getDistrictHistory(districtId, fromDate, toDate);
});

ipcMain.handle('db-get-monthly-report', async (_event, month?: number, year?: number) => {
  logger.info({ month, year }, 'Repository Query: db-get-monthly-report requested');
  let finalMonth = month;
  let finalYear = year;
  if (!finalMonth || !finalYear) {
    const latestStr = await SubmissionRepository.getLatestReportDate();
    const refDate = latestStr ? new Date(latestStr) : new Date();
    finalMonth = refDate.getUTCMonth() + 1;
    finalYear = refDate.getUTCFullYear();
  }
  return await SubmissionRepository.getMonthlyReport(finalMonth, finalYear);
});

ipcMain.handle('db-get-late-submissions', async (_event, fromDate?: string, toDate?: string) => {
  logger.info({ fromDate, toDate }, 'Repository Query: db-get-late-submissions requested');
  let finalFrom = fromDate;
  let finalTo = toDate;
  if (!finalFrom || !finalTo) {
    const latest = await SubmissionRepository.getLatestReportDate();
    finalFrom = latest || new Date().toISOString().split('T')[0];
    finalTo = latest || new Date().toISOString().split('T')[0];
  }
  return await SubmissionRepository.getLateSubmissionsReport(finalFrom, finalTo);
});

ipcMain.handle('db-get-performers', async (_event, fromDate?: string, toDate?: string) => {
  logger.info({ fromDate, toDate }, 'Repository Query: db-get-performers requested');
  let finalFrom = fromDate;
  let finalTo = toDate;
  if (!finalFrom || !finalTo) {
    const latest = await SubmissionRepository.getLatestReportDate();
    finalFrom = latest || new Date().toISOString().split('T')[0];
    finalTo = latest || new Date().toISOString().split('T')[0];
  }
  return await SubmissionRepository.getDistrictPerformance(finalFrom, finalTo);
});

ipcMain.handle('db-get-timeline', async (_event, date?: string) => {
  logger.info({ date }, 'Repository Query: db-get-timeline requested');
  let finalDate = date;
  if (!finalDate) {
    const latest = await SubmissionRepository.getLatestReportDate();
    finalDate = latest || new Date().toISOString().split('T')[0];
  }
  return await SubmissionRepository.getSubmissionTimeline(finalDate);
});

ipcMain.handle('db-get-settings', async () => {
  logger.info('Repository Query: db-get-settings requested');
  return await SettingRepository.getAll();
});

ipcMain.handle('db-save-setting', async (_event, key: string, value: string) => {
  logger.info({ key, value }, 'Repository Query: db-save-setting requested');
  await SettingRepository.save(key, value);
});

ipcMain.handle('db-get-messages', async () => {
  logger.info('Repository Query: db-get-messages requested');
  return await MessageRepository.getAll();
});

ipcMain.handle('db-get-manual-review', async () => {
  logger.info('Repository Query: db-get-manual-review requested');
  return await SubmissionRepository.getManualReviewReports();
});

ipcMain.handle('db-save-manual-correction', async (_event, reportId: string, correction: any) => {
  logger.info({ reportId, correction }, 'Repository Query: db-save-manual-correction requested');
  return await SubmissionRepository.saveManualCorrection(reportId, correction);
});

ipcMain.handle('db-export-data', async (_event, defaultFilename: string, format: 'csv' | 'excel' | 'pdf', headers: string[], rows: any[][]) => {
  logger.info({ defaultFilename, format }, 'IPC Request: db-export-data requested');
  try {
    const ext = format === 'pdf' ? 'pdf' : format === 'excel' ? 'xls' : 'csv';
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `${defaultFilename}.${ext}`,
      filters: [
        { name: format.toUpperCase(), extensions: [ext] }
      ]
    });

    if (!filePath) return false;

    if (format === 'csv' || format === 'excel') {
      const delimiter = format === 'excel' ? '\t' : ',';
      const headerLine = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(delimiter);
      const rowLines = rows.map(row => 
        row.map(cell => {
          const str = cell === null || cell === undefined ? '' : String(cell);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(delimiter)
      );
      const content = [headerLine, ...rowLines].join('\n');
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } else if (format === 'pdf') {
      const tableHeaderHtml = headers.map(h => `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left;">${h}</th>`).join('');
      const tableRowsHtml = rows.map(row => 
        `<tr>${row.map(cell => `<td style="border: 1px solid #ddd; padding: 8px;">${cell === null || cell === undefined ? '' : String(cell)}</td>`).join('')}</tr>`
      ).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; margin: 35px; color: #1e293b; }
              h1 { text-align: center; margin-bottom: 20px; font-size: 18px; color: #0f172a; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
              th, td { border: 1px solid #cbd5e1; padding: 6px; }
              .footer { margin-top: 30px; text-align: right; font-size: 8px; color: #64748b; }
            </style>
          </head>
          <body>
            <h1>DSD Performance Report summary - ${defaultFilename}</h1>
            <table>
              <thead><tr>${tableHeaderHtml}</tr></thead>
              <tbody>${tableRowsHtml}</tbody>
            </table>
            <div class="footer">Generated on ${new Date().toLocaleDateString()}</div>
          </body>
        </html>
      `;

      const printWindow = new BrowserWindow({ show: false });
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
      });
      fs.writeFileSync(filePath, pdfBuffer);
      printWindow.destroy();
      return true;
    }
  } catch (err: any) {
    logger.error('Failed to export data: ' + err.message);
    return false;
  }
  return false;
});

// Register WhatsApp Worker IPC handlers
ipcMain.handle('worker-start', async (_event, groupName: string, headless: boolean) => {
  logger.info({ groupName, headless }, 'IPC Request: worker-start requested');
  return await workerManager.start(groupName, headless);
});

ipcMain.handle('worker-stop', async () => {
  logger.info('IPC Request: worker-stop requested');
  await workerManager.stop();
  return true;
});

ipcMain.handle('worker-get-status', () => {
  return workerManager.getStatus();
});

ipcMain.handle('worker-get-diagnostics', () => {
  return workerManager.getDiagnostics();
});

ipcMain.handle('app-log', (_event, message: string) => {
  logger.info(`[Renderer Log]: ${message}`);
});

// --- AUDIT LOGS IPC HANDLERS ---
ipcMain.handle('db-get-audit-logs', async (_event, limit?: number) => {
  return await AuditRepository.getLogs(limit);
});

ipcMain.handle('db-log-audit', async (_event, action: any, entity: string, entityId: string, before: any, after: any, userName?: string) => {
  return await AuditRepository.log(action, entity, entityId, before, after, userName);
});

// --- NOTIFICATIONS IPC HANDLERS ---
ipcMain.handle('db-get-notifications', async (_event, limit?: number) => {
  return await NotificationRepository.getNotifications(limit);
});

ipcMain.handle('db-get-unread-notifications-count', async () => {
  return await NotificationRepository.getUnreadCount();
});

ipcMain.handle('db-mark-notification-read', async (_event, id: string) => {
  return await NotificationRepository.markAsRead(id);
});

ipcMain.handle('db-mark-all-notifications-read', async () => {
  return await NotificationRepository.markAllAsRead();
});

ipcMain.handle('db-delete-notification', async (_event, id: string) => {
  return await NotificationRepository.delete(id);
});

ipcMain.handle('db-create-notification', async (_event, type: any, category: any, title: string, message: string) => {
  return await NotificationRepository.create(type, category, title, message);
});

// --- BACKUP & RESTORE IPC HANDLERS ---
const getDbPath = () => {
  return path.join(app.getAppPath(), 'database', 'dsd-tracker.db');
};

const getBackupsDir = () => {
  const dir = path.join(app.getAppPath(), 'database', 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

ipcMain.handle('db-backup', async () => {
  logger.info('Database Backup requested');
  try {
    const dbPath = getDbPath();
    const backupsDir = getBackupsDir();
    
    if (!fs.existsSync(dbPath)) {
      throw new Error('Active database file not found at: ' + dbPath);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `dsd-tracker_backup_${timestamp}.db`;
    const targetPath = path.join(backupsDir, filename);

    fs.copyFileSync(dbPath, targetPath);
    const stats = fs.statSync(targetPath);

    await AuditRepository.log(
      'DATABASE_BACKUP',
      'Database',
      'dsd-tracker.db',
      null,
      { backupFile: filename, sizeBytes: stats.size }
    );

    await NotificationRepository.create(
      'SUCCESS',
      'SYSTEM',
      'Database Backup Successful',
      `Manual database backup created: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`
    );

    return {
      success: true,
      filename,
      size: stats.size,
      birthtime: stats.birthtime,
    };
  } catch (error: any) {
    logger.error({ error }, 'IPC db-backup: Failed to create database backup');
    await NotificationRepository.create(
      'ERROR',
      'SYSTEM',
      'Database Backup Failed',
      error.message
    );
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-backups', async () => {
  try {
    const backupsDir = getBackupsDir();
    const files = fs.readdirSync(backupsDir);
    const backups = files
      .filter(f => f.startsWith('dsd-tracker_'))
      .map(f => {
        const stats = fs.statSync(path.join(backupsDir, f));
        return {
          filename: f,
          size: stats.size,
          birthtime: stats.birthtime,
        };
      })
      .sort((a, b) => b.birthtime.getTime() - a.birthtime.getTime());
    return backups;
  } catch (error: any) {
    logger.error({ error }, 'IPC db-get-backups: Failed to list backups');
    return [];
  }
});

ipcMain.handle('db-validate-backup', async (_event, filename: string) => {
  try {
    const backupsDir = getBackupsDir();
    const backupPath = path.join(backupsDir, filename);
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Backup file not found' };
    }

    const stats = fs.statSync(backupPath);
    if (stats.size < 100) {
      return { success: true, isValid: false, error: 'File size too small to be valid database' };
    }

    // Verify SQLite magic header bytes: "SQLite format 3\0"
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(backupPath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    
    const header = buffer.toString('ascii', 0, 15);
    const isValid = header === 'SQLite format 3';
    return {
      success: true,
      isValid,
      size: stats.size,
      birthtime: stats.birthtime,
    };
  } catch (error: any) {
    logger.error({ error, filename }, 'IPC db-validate-backup: Failed to validate backup');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-restore', async (_event, filename: string) => {
  logger.info({ filename }, 'Database Restore requested');
  try {
    const dbPath = getDbPath();
    const backupsDir = getBackupsDir();
    const backupPath = path.join(backupsDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    // 1. Create automatic backup of current database first
    const autoTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const autoBackupName = `dsd-tracker_auto_before_restore_${autoTimestamp}.db`;
    const autoBackupPath = path.join(backupsDir, autoBackupName);
    
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, autoBackupPath);
    }

    // 2. Perform the restore (copy backup file to main database file path)
    fs.copyFileSync(backupPath, dbPath);

    await AuditRepository.log(
      'DATABASE_RESTORE',
      'Database',
      'dsd-tracker.db',
      { replacedBy: filename },
      { restoredBackup: filename, autoBackupBefore: autoBackupName }
    );

    await NotificationRepository.create(
      'SUCCESS',
      'SYSTEM',
      'Database Restore Successful',
      `Restored backup ${filename}. Auto-backup before restore saved as ${autoBackupName}. Relaunching...`
    );

    // 3. Restart the Electron application to reload connections
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 1000);

    return { success: true };
  } catch (error: any) {
    logger.error({ error, filename }, 'IPC db-restore: Failed to restore database');
    await NotificationRepository.create(
      'ERROR',
      'SYSTEM',
      'Database Restore Failed',
      error.message
    );
    return { success: false, error: error.message };
  }
});

// --- RESOURCE DIAGNOSTICS IPC HANDLER ---
ipcMain.handle('sys-get-resources', async () => {
  try {
    const dbPath = getDbPath();
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    
    // Count active manual review queue reports
    const queueLength = await prisma.dsdReport.count({
      where: {
        validationStatus: 'INVALID',
        isLatest: true,
      },
    });

    const cpuUsage = process.cpuUsage();
    const memory = process.memoryUsage();

    return {
      success: true,
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      dbSize,
      queueLength,
      uptime: process.uptime(),
    };
  } catch (error: any) {
    logger.error({ error }, 'IPC sys-get-resources: Failed to get resources');
    return { success: false, error: error.message };
  }
});

// --- REPLAY REPORT IPC HANDLERS ---
ipcMain.handle('db-replay-report', async (_event, reportId: string) => {
  logger.info({ reportId }, 'IPC db-replay-report: Replaying report requested');
  try {
    const report = await prisma.dsdReport.findUnique({
      where: { id: reportId },
      include: { message: true, district: true },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    if (!report.message) {
      throw new Error('Raw WhatsApp message associated with report is not available in the database.');
    }

    // Run the raw message text through the current parser version
    const newResult = await parseReport(report.message.message, report.message.receivedAt);

    return {
      success: true,
      oldReport: {
        id: report.id,
        districtName: report.district.name,
        reportDate: report.reportDate,
        appointmentsBooked: report.appointmentsBooked,
        served: report.served,
        cancelled: report.cancelled,
        rescheduled: report.rescheduled,
        validationStatus: report.validationStatus,
        validationErrors: JSON.parse(report.validationErrors || '[]'),
        confidence: report.confidence,
        parserVersion: report.parserVersion,
        extraMetrics: JSON.parse(report.metricsJson || '{}'),
      },
      newResult,
    };
  } catch (error: any) {
    logger.error({ error, reportId }, 'IPC db-replay-report: Failed to replay report');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-apply-replay-correction', async (_event, reportId: string, result: any, userName?: string) => {
  logger.info({ reportId, result }, 'IPC db-apply-replay-correction: Applying replay correction');
  try {
    return await SubmissionRepository.saveReplayReport(reportId, result, userName || 'Operator');
  } catch (error: any) {
    logger.error({ error, reportId }, 'IPC db-apply-replay-correction: Failed to apply replay correction');
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean shutdown hook to ensure no orphaned browser processes are left
app.on('before-quit', async (event) => {
  logger.info('App exiting, stopping WhatsApp worker child processes...');
  await workerManager.stop();
});
