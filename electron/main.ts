import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import cron from 'node-cron';

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
import { DatabaseMigrationService } from '../src/database/DatabaseMigrationService';
import { DatabaseIntegrityService } from '../src/database/DatabaseIntegrityService';

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
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
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

import { BackupService } from '../src/database/BackupService';

ipcMain.handle('db-save-manual-correction', async (_event, reportId: string, correction: any) => {
  logger.info({ reportId, correction }, 'Repository Query: db-save-manual-correction requested');
  try {
    await BackupService.createBackup('before_manual_correction');
  } catch (err) {
    logger.warn({ err }, 'Manual correction backup failed, continuing...');
  }
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

ipcMain.handle('db-export-pmu-report', async (_event, fromDate: string, toDate: string) => {
  logger.info({ fromDate, toDate }, 'IPC Request: db-export-pmu-report requested');
  try {
    const start = new Date(fromDate + 'T00:00:00.000Z');
    const end = new Date(toDate + 'T23:59:59.999Z');

    // Period calculations (for comparison)
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const N = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start.getTime() - N * 24 * 60 * 60 * 1000);
    const prevEnd = new Date(end.getTime() - N * 24 * 60 * 60 * 1000);

    // Queries
    const currentReports = await prisma.dsdReport.findMany({
      where: {
        reportDate: { gte: start, lte: end },
        isLatest: true
      },
      include: { district: true }
    });

    const prevReports = await prisma.dsdReport.findMany({
      where: {
        reportDate: { gte: prevStart, lte: prevEnd },
        isLatest: true
      }
    });

    // Compute Current Range Summaries
    let cBooked = 0, cServed = 0, cCancelled = 0, cRescheduled = 0;
    for (const r of currentReports) {
      cBooked += r.appointmentsBooked;
      cServed += r.served;
      cCancelled += r.cancelled;
      cRescheduled += r.rescheduled;
    }
    const cRate = cBooked > 0 ? (cServed / cBooked) * 100 : 0;

    // Compute Previous Range Summaries
    let pBooked = 0, pServed = 0, pCancelled = 0, pRescheduled = 0;
    for (const r of prevReports) {
      pBooked += r.appointmentsBooked;
      pServed += r.served;
      pCancelled += r.cancelled;
      pRescheduled += r.rescheduled;
    }
    const pRate = pBooked > 0 ? (pServed / pBooked) * 100 : 0;

    // Comparisons
    const deltaRate = cRate - pRate;
    const deltaBooked = cBooked - pBooked;
    const deltaServed = cServed - pServed;

    // Leaderboards (Top 3 and Bottom 3)
    const sorted = [...currentReports].sort((a, b) => {
      const rateA = a.appointmentsBooked > 0 ? (a.served / a.appointmentsBooked) : 0;
      const rateB = b.appointmentsBooked > 0 ? (b.served / b.appointmentsBooked) : 0;
      return rateB - rateA;
    });

    const topDistricts = sorted.slice(0, 3);
    const bottomDistricts = sorted.filter(r => r.appointmentsBooked > 0).slice(-3).reverse();

    // Show Save Dialog
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `PMU_Performance_Report_${fromDate}_to_${toDate}.pdf`,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });

    if (!filePath) return false;

    // Construct Executive HTML Template
    const formatPct = (val: number) => val.toFixed(1) + '%';
    const renderDelta = (delta: number, isPct = false) => {
      if (delta === 0) return `<span style="color:#64748b; font-size:10px; font-weight:bold;">0 (No change)</span>`;
      const arrow = delta > 0 ? '▲' : '▼';
      const color = delta > 0 ? '#10b981' : '#ef4444';
      const sign = delta > 0 ? '+' : '';
      const formatted = isPct ? delta.toFixed(1) + '%' : String(delta);
      return `<span style="color:${color}; font-size:10px; font-weight:bold;">${arrow} ${sign}${formatted} vs prev period</span>`;
    };

    const topListHtml = topDistricts.map((d, index) => {
      const rate = d.appointmentsBooked > 0 ? (d.served / d.appointmentsBooked) * 100 : 0;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px; font-weight: bold; width: 40px;">#${index+1}</td>
          <td style="padding: 8px; font-weight: bold; color: #1e3a8a;">${d.district.name}</td>
          <td style="padding: 8px; font-mono: true; font-weight: bold; text-align: right; color: #10b981;">${formatPct(rate)}</td>
        </tr>
      `;
    }).join('');

    const bottomListHtml = bottomDistricts.map((d, index) => {
      const rate = d.appointmentsBooked > 0 ? (d.served / d.appointmentsBooked) * 100 : 0;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px; font-weight: bold; width: 40px;">#${3 - index}</td>
          <td style="padding: 8px; font-weight: bold; color: #7c2d12;">${d.district.name}</td>
          <td style="padding: 8px; font-mono: true; font-weight: bold; text-align: right; color: #ef4444;">${formatPct(rate)}</td>
        </tr>
      `;
    }).join('');

    const ledgerHtml = sorted.map(r => {
      const rate = r.appointmentsBooked > 0 ? (r.served / r.appointmentsBooked) * 100 : 0;
      const rateColor = rate >= 80 ? '#10b981' : rate >= 50 ? '#d97706' : '#ef4444';
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
          <td style="padding: 6px; font-weight: bold; border-left: 3px solid ${rateColor};">${r.district.name}</td>
          <td style="padding: 6px; text-align: right; font-mono: true;">${r.appointmentsBooked}</td>
          <td style="padding: 6px; text-align: right; font-mono: true; color: #2563eb; font-weight: bold;">${r.served}</td>
          <td style="padding: 6px; text-align: right; font-mono: true; color: #dc2626;">${r.cancelled}</td>
          <td style="padding: 6px; text-align: right; font-mono: true; color: #d97706;">${r.rescheduled}</td>
          <td style="padding: 6px; text-align: right; font-mono: true; font-weight: bold; color: ${rateColor};">${formatPct(rate)}</td>
          <td style="padding: 6px; text-align: center; color: #64748b;">${r.validationStatus}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #334155; margin: 0; padding: 25px; line-height: 1.4; background-color: #ffffff; }
            .header-bar { background-color: #1e3a8a; color: white; padding: 18px 24px; border-radius: 8px; margin-bottom: 20px; }
            .header-bar h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px; }
            .header-bar p { margin: 4px 0 0 0; font-size: 11px; opacity: 0.9; }
            .meta-table { width: 100%; font-size: 10px; color: #64748b; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
            
            /* Stat Cards Layout */
            .stats-container { width: 100%; margin-bottom: 20px; display: table; table-layout: fixed; border-spacing: 10px; }
            .stat-card { display: table-cell; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
            .stat-title { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
            .stat-value { font-size: 20px; font-weight: bold; color: #0f172a; margin: 4px 0; }
            
            /* Leaderboards Layout */
            .leaderboard-container { width: 100%; margin-bottom: 25px; display: table; table-layout: fixed; border-spacing: 10px; }
            .leaderboard-column { display: table-cell; width: 50%; border: 1px solid #e2e8f0; border-radius: 8px; vertical-align: top; }
            .leaderboard-header { padding: 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
            
            /* Ledger Table */
            .ledger-header { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #0f172a; border-bottom: 2px solid #0f172a; margin-top: 25px; padding-bottom: 6px; }
            .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            .main-table th { background-color: #f1f5f9; color: #475569; font-weight: bold; font-size: 10px; text-transform: uppercase; padding: 6px; border: 1px solid #cbd5e1; }
            
            .footer { margin-top: 40px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <h1>Punjab District DSD Performance Scorecard</h1>
            <p>Punjab State Enterprise Group Sewa (PSEGS) PMU Division</p>
          </div>

          <table class="meta-table">
            <tr>
              <td><strong>Report Date Range:</strong> ${fromDate} to ${toDate}</td>
              <td style="text-align: right;"><strong>Generated On:</strong> ${new Date().toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td><strong>Audience:</strong> PMU Director / Leadership Desk</td>
              <td style="text-align: right;"><strong>Scraper Ingestion:</strong> Operational Live Data Mode</td>
            </tr>
          </table>

          <!-- Operational Overview Metrics -->
          <div class="stats-container">
            <div class="stat-card" style="border-top: 3px solid #3b82f6;">
              <div class="stat-title">Total Appointments Booked</div>
              <div class="stat-value">${cBooked}</div>
              <div>${renderDelta(deltaBooked)}</div>
            </div>
            <div class="stat-card" style="border-top: 3px solid #10b981;">
              <div class="stat-title">Total Served</div>
              <div class="stat-value" style="color: #2563eb;">${cServed}</div>
              <div>${renderDelta(deltaServed)}</div>
            </div>
            <div class="stat-card" style="border-top: 3px solid #059669;">
              <div class="stat-title">Average Service Rate</div>
              <div class="stat-value" style="color: #059669;">${formatPct(cRate)}</div>
              <div>${renderDelta(deltaRate, true)}</div>
            </div>
            <div class="stat-card" style="border-top: 3px solid #dc2626;">
              <div class="stat-title">Rescheduled / Cancelled</div>
              <div class="stat-value" style="color: #ea580c;">${cRescheduled} / ${cCancelled}</div>
              <div style="font-size: 9px; color: #64748b;">Loss Volume</div>
            </div>
          </div>

          <!-- Leaderboards -->
          <div class="leaderboard-container">
            <!-- Top Districts -->
            <div class="leaderboard-column" style="background-color: #f0fdf4; border-color: #bbf7d0;">
              <div class="leaderboard-header" style="background-color: #dcfce7; color: #15803d;">🏆 Top Performers</div>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                ${topListHtml || '<tr><td style="padding:10px; color:#64748b;">No data available</td></tr>'}
              </table>
            </div>

            <!-- Action Required -->
            <div class="leaderboard-column" style="background-color: #fff7ed; border-color: #fed7aa;">
              <div class="leaderboard-header" style="background-color: #ffedd5; color: #c2410c;">⚠️ Action Required (Lowest Rates)</div>
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                ${bottomListHtml || '<tr><td style="padding:10px; color:#64748b;">No data available</td></tr>'}
              </table>
            </div>
          </div>

          <!-- Ledger Table -->
          <div class="ledger-header">Detailed District Ledger</div>
          <table class="main-table">
            <thead>
              <tr>
                <th style="text-align: left;">District Name</th>
                <th style="text-align: right; width: 80px;">Booked</th>
                <th style="text-align: right; width: 80px;">Served</th>
                <th style="text-align: right; width: 80px;">Cancelled</th>
                <th style="text-align: right; width: 80px;">Rescheduled</th>
                <th style="text-align: right; width: 90px;">Service Rate</th>
                <th style="text-align: center; width: 80px;">Validation</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerHtml || '<tr><td colspan="7" style="padding:15px; text-align:center; color:#64748b;">No reports found in selected range</td></tr>'}
            </tbody>
          </table>

          <div class="footer">
            Punjab District DSD Performance Tracker • Confidential PMU Distribution Only
          </div>
        </body>
      </html>
    `;

    const printWindow = new BrowserWindow({ show: false });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdfBuffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });
    fs.writeFileSync(filePath, pdfBuffer);
    printWindow.destroy();
    return true;
  } catch (err: any) {
    logger.error('Failed to export PMU PDF: ' + err.message);
    return false;
  }
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
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'dsd-tracker.db');
  }
  return path.join(app.getAppPath(), 'database', 'dsd-tracker.db');
};

const getBackupsDir = () => {
  const baseDir = app.isPackaged ? app.getPath('userData') : app.getAppPath();
  const dir = path.join(baseDir, app.isPackaged ? 'backups' : 'database/backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

ipcMain.handle('db-backup', async () => {
  logger.info('Database Backup requested');
  try {
    const filename = await BackupService.createBackup('manual');
    const backupsDir = BackupService.getBackupsDir();
    const stats = fs.statSync(path.join(backupsDir, filename));

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
      birthtime: stats.mtime,
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
  logger.info({ filename }, 'Validate Backup requested');
  try {
    const backupsDir = getBackupsDir();
    const backupPath = path.join(backupsDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found');
    }

    const stats = fs.statSync(backupPath);
    return {
      success: true,
      filename,
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
    const autoBackupName = await BackupService.createBackup('before_restore');
    
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

    const messageCount = await prisma.whatsAppMessage.count();
    const reportCount = await prisma.dsdReport.count();
    const submissionCount = await prisma.dailySubmission.count();
    const snapshotCount = await prisma.dailyAuditSnapshot.count();

    const backupsDir = getBackupsDir();
    let lastBackupTime = 'Never';
    try {
      if (fs.existsSync(backupsDir)) {
        const files = fs.readdirSync(backupsDir);
        const backupFiles = files
          .filter(f => f.startsWith('dsd-tracker_'))
          .map(f => fs.statSync(path.join(backupsDir, f)).birthtime)
          .sort((a, b) => b.getTime() - a.getTime());
        if (backupFiles.length > 0) {
          lastBackupTime = backupFiles[0].toLocaleString();
        }
      }
    } catch (e) {
      // ignore
    }

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
      messageCount,
      reportCount,
      submissionCount,
      snapshotCount,
      lastBackupTime,
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
      include: { message: true, district: true, parserEngine: true },
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
        parserVersion: report.parserEngine?.version || '2.1.4',
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
    try {
      await BackupService.createBackup('before_replay');
    } catch (err) {
      logger.warn({ err }, 'Replay backup failed, continuing...');
    }
    return await SubmissionRepository.saveReplayReport(reportId, result, userName || 'Operator');
  } catch (error: any) {
    logger.error({ error, reportId }, 'IPC db-apply-replay-correction: Failed to apply replay correction');
    return { success: false, error: error.message };
  }
});

app.whenReady().then(async () => {
  try {
    // 1. Run database migrations dynamically
    await DatabaseMigrationService.runMigrations();
    // 2. Perform startup database integrity checks
    await DatabaseIntegrityService.checkIntegrity();

    // 3. Run Daily Audit Snapshot on startup
    try {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await SubmissionRepository.compileDailyAuditSnapshot(yesterday);
      await SubmissionRepository.compileDailyAuditSnapshot(today);
      logger.info('Startup Daily Audit Snapshots compiled successfully.');
    } catch (err) {
      logger.error(err, 'Failed compiling startup daily audit snapshots');
    }

    // 4. Schedule midnight daily snapshot compiles
    cron.schedule('5 0 * * *', async () => {
      logger.info('Midnight Ticker: Compiling Daily Audit Snapshot for yesterday...');
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        await SubmissionRepository.compileDailyAuditSnapshot(yesterday);
      } catch (err) {
        logger.error(err, 'Failed compiling midnight audit snapshot');
      }
    });

    // Set up hourly database integrity checks
    setInterval(async () => {
      logger.info('Running recurring hourly database integrity & reconciliation check...');
      try {
        await DatabaseIntegrityService.checkIntegrity();
      } catch (err) {
        logger.error(err, 'Failed running recurring database integrity check');
      }
    }, 60 * 60 * 1000);

    // 5. Auto-resume worker if it was running before crash/exit
    try {
      const state = workerManager.getStatus().workerState;
      if (state === 'MONITORING' || state === 'RECOVERY_SYNCING' || state === 'STARTING' || state === 'OPENING_BROWSER') {
        logger.info({ previousState: state }, 'Auto-resuming worker process after crash/restart...');
        const settings = await SettingRepository.getAll();
        const groupName = settings.groupName || 'DSD Monitoring';
        const headless = settings.headless === 'true';
        await workerManager.start(groupName, headless);
      }
    } catch (err) {
      logger.error(err, 'Failed to auto-resume worker process');
    }
  } catch (error) {
    logger.error({ error }, 'Startup initialization failed');
  }

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
