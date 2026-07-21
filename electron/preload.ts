import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Database IPCs
  getDistricts: () => ipcRenderer.invoke('db-get-districts'),
  getLatestReportDate: () => ipcRenderer.invoke('db-get-latest-report-date'),
  getDashboardSummary: (fromDate?: string, toDate?: string) => ipcRenderer.invoke('db-get-dashboard-summary', fromDate, toDate),
  getSubmissionsForDate: (date: string) => ipcRenderer.invoke('db-get-submissions-for-date', date),
  getSubmissionsForRange: (fromDate: string, toDate: string) => ipcRenderer.invoke('db-get-submissions-range', fromDate, toDate),
  getSettings: () => ipcRenderer.invoke('db-get-settings'),
  saveSetting: (key: string, value: string) => ipcRenderer.invoke('db-save-setting', key, value),
  getMessages: () => ipcRenderer.invoke('db-get-messages'),
  getManualReviewReports: () => ipcRenderer.invoke('db-get-manual-review'),
  saveManualCorrection: (reportId: string, correction: any) => ipcRenderer.invoke('db-save-manual-correction', reportId, correction),
  exportData: (filename: string, format: 'csv' | 'excel' | 'pdf', headers: string[], rows: any[][]) => ipcRenderer.invoke('db-export-data', filename, format, headers, rows),
  exportPmuReport: (fromDate: string, toDate: string) => ipcRenderer.invoke('db-export-pmu-report', fromDate, toDate),
  getDistrictHistory: (districtId: string, fromDate: string, toDate: string) => ipcRenderer.invoke('db-get-district-history', districtId, fromDate, toDate),
  getMonthlyReport: (month: number, year: number) => ipcRenderer.invoke('db-get-monthly-report', month, year),
  getLateSubmissions: (fromDate: string, toDate: string) => ipcRenderer.invoke('db-get-late-submissions', fromDate, toDate),
  getDistrictPerformance: (fromDate: string, toDate: string) => ipcRenderer.invoke('db-get-performers', fromDate, toDate),
  getSubmissionTimeline: (date: string) => ipcRenderer.invoke('db-get-timeline', date),

  // Worker IPCs
  startWorker: (groupName: string, headless: boolean) => ipcRenderer.invoke('worker-start', groupName, headless),
  stopWorker: () => ipcRenderer.invoke('worker-stop'),
  getWorkerStatus: () => ipcRenderer.invoke('worker-get-status'),
  getWorkerDiagnostics: () => ipcRenderer.invoke('worker-get-diagnostics'),
  
  onWorkerStatusChanged: (callback: (status: any) => void) => {
    const listener = (_event: any, status: any) => callback(status);
    ipcRenderer.on('worker-status-changed', listener);
    return () => {
      ipcRenderer.removeListener('worker-status-changed', listener);
    };
  },

  onMessageCaptured: (callback: (message: any) => void) => {
    const listener = (_event: any, message: any) => callback(message);
    ipcRenderer.on('message-captured', listener);
    return () => {
      ipcRenderer.removeListener('message-captured', listener);
    };
  },

  log: (message: string) => ipcRenderer.invoke('app-log', message),

  // Audit Logs
  getAuditLogs: (limit?: number) => ipcRenderer.invoke('db-get-audit-logs', limit),
  logAudit: (action: string, entity: string, entityId: string, before: any, after: any, userName?: string) => ipcRenderer.invoke('db-log-audit', action, entity, entityId, before, after, userName),

  // Notifications
  getNotifications: (limit?: number) => ipcRenderer.invoke('db-get-notifications', limit),
  getUnreadNotificationsCount: () => ipcRenderer.invoke('db-get-unread-notifications-count'),
  markNotificationRead: (id: string) => ipcRenderer.invoke('db-mark-notification-read', id),
  markAllNotificationsRead: () => ipcRenderer.invoke('db-mark-all-notifications-read'),
  deleteNotification: (id: string) => ipcRenderer.invoke('db-delete-notification', id),
  createNotification: (type: string, category: string, title: string, message: string) => ipcRenderer.invoke('db-create-notification', type, category, title, message),

  // Backup & Restore
  backupDatabase: () => ipcRenderer.invoke('db-backup'),
  getBackupsList: () => ipcRenderer.invoke('db-get-backups'),
  validateBackup: (filename: string) => ipcRenderer.invoke('db-validate-backup', filename),
  restoreDatabase: (filename: string) => ipcRenderer.invoke('db-restore', filename),

  // Resource Diagnostics
  getSystemResources: () => ipcRenderer.invoke('sys-get-resources'),

  // Replays
  replayReport: (reportId: string) => ipcRenderer.invoke('db-replay-report', reportId),
  applyReplayCorrection: (reportId: string, result: any, userName?: string) => ipcRenderer.invoke('db-apply-replay-correction', reportId, result, userName),
});
