export interface AppApi {
  getDistricts: () => Promise<Array<{ id: string; name: string; code: string; isActive: boolean; createdAt: string }>>;
  getLatestReportDate: () => Promise<string | null>;
  getDashboardSummary: (fromDate?: string, toDate?: string) => Promise<{
    totalDistricts: number;
    submittedCount: number;
    pendingCount: number;
    appointmentsBooked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    serviceRate: number;
    cancellationRate: number;
    rescheduleRate: number;
  }>;
  getSubmissionsForRange: (fromDate: string, toDate: string) => Promise<Array<{
    id: string;
    districtId: string;
    district: {
      id: string;
      name: string;
      code: string;
      isActive: boolean;
    };
    reportDate: string;
    submittedAt: string | null;
    status: string;
    reports: Array<{
      id: string;
      appointmentsBooked: number;
      served: number;
      cancelled: number;
      rescheduled: number;
      validationStatus: string;
      confidence: number;
      validationErrors?: string | null;
      receivedAt?: string;
    }>;
  }>>;
  getDistrictHistory: (districtId: string, fromDate: string, toDate: string) => Promise<Array<{
    id: string;
    submissionId: string;
    reportDate: string;
    receivedAt: string;
    appointmentsBooked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    validationStatus: string;
    confidence: number;
  }>>;
  getMonthlyReport: (month: number, year: number) => Promise<Array<{
    districtName: string;
    booked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    serviceRate: number;
    cancellationRate: number;
    rescheduleRate: number;
    submissionsCount: number;
  }>>;
  getLateSubmissions: (fromDate: string, toDate: string) => Promise<Array<{
    districtName: string;
    reportDate: string;
    receivedAt: string;
    delayHours: number;
  }>>;
  getDistrictPerformance: (fromDate: string, toDate: string) => Promise<Array<{
    districtName: string;
    booked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    serviceRate: number;
    cancellationRate: number;
    rescheduleRate: number;
  }>>;
  getSubmissionTimeline: (date: string) => Promise<Array<{
    districtName: string;
    receivedAt: string;
    parserMode: string;
    validationStatus: string;
    booked: number;
  }>>;
  getSubmissionsForDate: (date: string) => Promise<Array<{
    id: string;
    districtId: string;
    district: {
      id: string;
      name: string;
      code: string;
      isActive: boolean;
    };
    reportDate: string;
    submittedAt: string | null;
    status: string;
    reports: Array<{
      id: string;
      appointmentsBooked: number;
      served: number;
      cancelled: number;
      rescheduled: number;
      validationStatus: string;
      confidence: number;
      validationErrors?: string | null;
      receivedAt?: string;
    }>;
  }>>;
  getSettings: () => Promise<Record<string, string>>;
  saveSetting: (key: string, value: string) => Promise<void>;
  getMessages: () => Promise<Array<{
    id: string;
    whatsappId: string;
    sender: string | null;
    senderNumber: string | null;
    isFromMe: boolean;
    message: string;
    messageHash: string | null;
    messageType: string;
    ingestionStatus: string;
    receivedAt: string;
    createdAt: string;
  }>>;
  getManualReviewReports: () => Promise<Array<{
    id: string;
    submissionId: string;
    submission: {
      id: string;
      districtId: string;
      district: {
        id: string;
        name: string;
        code: string;
      };
      reportDate: string;
      status: string;
    };
    messageId: string | null;
    message: {
      id: string;
      message: string;
    } | null;
    previousReportId: string | null;
    appointmentsBooked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    validationStatus: string;
    validationErrors: string | null;
    confidence: number;
    isLatest: boolean;
    revisionNumber: number;
    parserMode: string;
    createdAt: string;
  }>>;
  saveManualCorrection: (reportId: string, correction: {
    appointmentsBooked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    reportDate?: string;
  }) => Promise<any>;
  exportData: (filename: string, format: 'csv' | 'excel' | 'pdf', headers: string[], rows: any[][]) => Promise<boolean>;
  
  // Worker Controls
  startWorker: (groupName: string, headless: boolean) => Promise<boolean>;
  stopWorker: () => Promise<boolean>;
  getWorkerStatus: () => Promise<{
    workerState: string;
    memory: number;
    uptime: number;
    lastSync?: string;
    groupName: string;
  }>;
  getWorkerDiagnostics: () => Promise<{
    workerPid?: number;
    browserVersion: string;
    playwrightVersion: string;
    sessionPath: string;
    currentState: string;
    lastRestart?: string;
    lastError?: string;
  }>;
  onWorkerStatusChanged: (callback: (status: any) => void) => () => void;
  onMessageCaptured: (callback: (message: any) => void) => () => void;

  log: (message: string) => Promise<void>;

  // Audit Logs
  getAuditLogs: (limit?: number) => Promise<Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string;
    beforeJson: string | null;
    afterJson: string | null;
    userId: string | null;
    userName: string;
    timestamp: string;
  }>>;
  logAudit: (action: string, entity: string, entityId: string, before: any, after: any, userName?: string) => Promise<any>;

  // Notifications
  getNotifications: (limit?: number) => Promise<Array<{
    id: string;
    type: string;
    category: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
  }>>;
  getUnreadNotificationsCount: () => Promise<number>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  createNotification: (type: string, category: string, title: string, message: string) => Promise<any>;

  // Backup & Restore
  backupDatabase: () => Promise<{ success: boolean; filename?: string; size?: number; birthtime?: string; error?: string }>;
  getBackupsList: () => Promise<Array<{ filename: string; size: number; birthtime: string }>>;
  validateBackup: (filename: string) => Promise<{ success: boolean; isValid?: boolean; size?: number; birthtime?: string; error?: string }>;
  restoreDatabase: (filename: string) => Promise<{ success: boolean; error?: string }>;

  // Resource Diagnostics
  getSystemResources: () => Promise<{
    success: boolean;
    cpu: { user: number; system: number };
    memory: { rss: number; heapTotal: number; heapUsed: number; external: number };
    dbSize: number;
    queueLength: number;
    uptime: number;
    error?: string;
  }>;

  // Replay
  replayReport: (reportId: string) => Promise<{
    success: boolean;
    error?: string;
    oldReport?: {
      id: string;
      districtName: string;
      reportDate: string;
      appointmentsBooked: number;
      served: number;
      cancelled: number;
      rescheduled: number;
      validationStatus: string;
      validationErrors: string[];
      confidence: number;
      parserVersion: string;
      extraMetrics: any;
    };
    newResult?: any;
  }>;
  applyReplayCorrection: (reportId: string, result: any, userName?: string) => Promise<any>;
}

declare global {
  interface Window {
    api: AppApi;
  }
}
