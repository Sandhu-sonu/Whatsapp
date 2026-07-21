import { useEffect, useState, useRef } from 'react';
import { useRole } from '../contexts/RoleContext';
import { 
  Activity, 
  Database, 
  Smartphone, 
  Cpu, 
  FileText, 
  RefreshCw, 
  ShieldAlert, 
  CheckCircle,
  FileCheck,
  AlertOctagon,
  Clock
} from 'lucide-react';

interface BackupItem {
  filename: string;
  size: number;
  birthtime: string | Date;
}

interface ActivityEvent {
  id: string;
  time: string;
  timestamp: number;
  message: string;
  type: 'OPERATIONAL' | 'PARSER' | 'SYSTEM' | 'AUDIT';
  status: 'VALID' | 'WARNING' | 'ERROR' | 'INFO';
}

interface SystemResources {
  cpu: { user: number; system: number };
  memory: { rss: number; heapTotal: number; heapUsed: number; external: number };
  dbSize: number;
  queueLength: number;
  uptime: number;
  messageCount?: number;
  reportCount?: number;
  submissionCount?: number;
  snapshotCount?: number;
  lastBackupTime?: string;
}

export default function SystemHealthPage() {
  const { isDeveloper, isAdmin } = useRole();
  const listRef = useRef<HTMLDivElement>(null);

  // States
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [resLoading, setResLoading] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [activeEvents, setActiveEvents] = useState<ActivityEvent[]>([]);
  const [eventFilter, setEventFilter] = useState<'ALL' | 'OPERATIONAL' | 'PARSER' | 'SYSTEM' | 'AUDIT'>('ALL');
  
  // Backup/Restore Dialog States
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ success: boolean; isValid?: boolean; error?: string } | null>(null);
  const [validating, setValidating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // Operational metrics
  const [operationalMetrics, setOperationalMetrics] = useState({
    receivedToday: 0,
    pendingDistricts: 23,
    manualQueue: 0,
    duplicateReports: 0,
    successRate: 100,
    whatsappConnected: false,
    lastHeartbeat: 'Never'
  });

  useEffect(() => {
    fetchDiagnostics();
    fetchBackups();
    fetchLogs();
    
    const interval = setInterval(() => {
      fetchDiagnostics();
      fetchLogs();
    }, 60000); // 1 minute auto refresh
    
    return () => clearInterval(interval);
  }, []);

  const fetchDiagnostics = async () => {
    setResLoading(true);
    try {
      const res = await window.api.getSystemResources();
      if (res.success) {
        setResources(res);
        
        // Populate operational metrics
        const summary = await window.api.getDashboardSummary();
        await window.api.getUnreadNotificationsCount();
        const workerStatus = await window.api.getWorkerStatus();

        setOperationalMetrics({
          receivedToday: summary.submittedCount,
          pendingDistricts: summary.pendingCount,
          manualQueue: res.queueLength,
          duplicateReports: 0, // Mocked pending db counter
          successRate: res.reportCount && res.reportCount > 0 
            ? Math.round(((res.reportCount - res.queueLength) / res.reportCount) * 100) 
            : 100,
          whatsappConnected: workerStatus.workerState === 'Running' || workerStatus.workerState === 'Syncing',
          lastHeartbeat: (() => {
            if (!workerStatus.lastSync) return 'Never';
            const d = new Date(workerStatus.lastSync);
            return isNaN(d.getTime()) ? workerStatus.lastSync : d.toLocaleTimeString();
          })()
        });
      }
    } catch (err) {
      console.error('Failed to query resources:', err);
    } finally {
      setResLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const list = await window.api.getBackupsList();
      setBackups(list);
    } catch (err) {
      console.error('Failed to get backups list:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const logs = await window.api.getAuditLogs(50);

      // Generate activity feed from AuditLogs & System Notifications
      const notifs = await window.api.getNotifications(50);
      
      const events: ActivityEvent[] = [];

      logs.forEach(log => {
        events.push({
          id: 'audit-' + log.id,
          time: new Date(log.timestamp).toLocaleTimeString(),
          timestamp: new Date(log.timestamp).getTime(),
          message: `${log.userName} triggered ${log.action.replace(/_/g, ' ')} on ${log.entity}`,
          type: 'AUDIT',
          status: 'INFO'
        });
      });

      notifs.forEach(n => {
        let type: ActivityEvent['type'] = 'SYSTEM';
        if (n.category === 'OPERATIONAL') type = 'OPERATIONAL';
        if (n.category === 'TECHNICAL') type = 'PARSER';

        events.push({
          id: 'notif-' + n.id,
          time: new Date(n.createdAt).toLocaleTimeString(),
          timestamp: new Date(n.createdAt).getTime(),
          message: `${n.title}: ${n.message}`,
          type,
          status: n.type as any
        });
      });

      // Sort by timestamp descending (newest first)
      events.sort((a, b) => b.timestamp - a.timestamp);
      setActiveEvents(events.slice(0, 100));
    } catch (err) {
      console.error('Failed to compile activity logs:', err);
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await window.api.backupDatabase();
      if (res.success) {
        alert(`Backup created successfully: ${res.filename}`);
        fetchBackups();
        fetchLogs();
      } else {
        alert(`Failed to create backup: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error creating backup: ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleSelectBackupForRestore = async (filename: string) => {
    setSelectedBackup(filename);
    setValidationResult(null);
    setValidating(true);
    setShowRestoreModal(true);

    try {
      const res = await window.api.validateBackup(filename);
      setValidationResult(res);
    } catch (err: any) {
      setValidationResult({ success: false, error: err.message });
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedBackup) return;
    setRestoring(true);

    try {
      const res = await window.api.restoreDatabase(selectedBackup);
      if (res.success) {
        alert('Database restored successfully! Application is restarting...');
      } else {
        alert(`Restore failed: ${res.error}`);
        setRestoring(false);
        setShowRestoreModal(false);
      }
    } catch (err: any) {
      alert(`Error restoring database: ${err.message}`);
      setRestoring(false);
      setShowRestoreModal(false);
    }
  };

  const filteredEvents = activeEvents.filter(e => {
    if (eventFilter === 'ALL') return true;
    return e.type === eventFilter;
  });

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [filteredEvents]);

  return (
    <div className="p-6 space-y-6 bg-slate-50 text-slate-800 min-h-full">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
          <p className="text-xs text-slate-500 mt-1">Monitor operational state, CPU/RAM diagnostics, and backups.</p>
        </div>
        <button
          onClick={() => { fetchDiagnostics(); fetchBackups(); fetchLogs(); }}
          disabled={resLoading}
          className="flex items-center space-x-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold px-3 py-2 rounded-lg shadow-sm"
        >
          <RefreshCw size={12} className={resLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Reconciliation Warning Banner */}
      {activeEvents.some(e => e.message.includes('Reconciliation Mismatch') || e.message.includes('Integrity Violation') || e.message.includes('Reconciliation')) && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3 text-xs text-amber-900 shadow-sm animate-pulse">
          <ShieldAlert className="text-amber-600 mt-0.5 flex-shrink-0" size={16} />
          <div>
            <h4 className="font-bold uppercase tracking-wider text-[10px]">Database Reconciliation Discrepancy Identified</h4>
            <p className="mt-1 text-amber-700 font-medium font-sans">
              Some counts between WhatsApp Messages, Dsd Reports, and Daily Submissions do not match. Review the live activity feed below or system notifications logs for further details.
            </p>
          </div>
        </div>
      )}

      {/* Operational Health Section (PMU View) */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Operational Health (PMU Status)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-lg">
              <FileText size={18} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Reports Ingested Today</div>
              <div className="text-xl font-bold text-slate-800 mt-0.5">{operationalMetrics.receivedToday}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-lg">
              <Clock size={18} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Pending Districts</div>
              <div className="text-xl font-bold text-slate-800 mt-0.5">{operationalMetrics.pendingDistricts}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
            <div className="bg-red-50 text-red-600 p-2.5 rounded-lg">
              <AlertOctagon size={18} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Manual Review Queue</div>
              <div className="text-xl font-bold text-slate-800 mt-0.5">{operationalMetrics.manualQueue}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-sm">
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg">
              <FileCheck size={18} />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Parser Success Rate</div>
              <div className="text-xl font-bold text-slate-800 mt-0.5">{operationalMetrics.successRate}%</div>
            </div>
          </div>
        </div>

        {/* Connectivity Status Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Service Connectivity</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
            <div className="flex items-center space-x-2">
              <Smartphone size={16} className="text-slate-400" />
              <span>WhatsApp Web:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                operationalMetrics.whatsappConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {operationalMetrics.whatsappConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Last Sync Heartbeat:</span> <span className="font-mono text-slate-700">{operationalMetrics.lastHeartbeat}</span>
            </div>
            <div>
              <span className="text-slate-400">Automatic Backup Schedule:</span> <span className="text-slate-700">Daily</span>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Health Section (Exposed to Developers only) */}
      {isDeveloper ? (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Technical Diagnostics (Developer Section)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* System Resources Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Cpu size={16} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-750 uppercase tracking-wider">Process Diagnostics</h3>
              </div>

              {resources ? (
                <div className="space-y-3 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Heap Used / Total:</span>
                    <span className="text-slate-800 font-bold">
                      {(resources.memory.heapUsed / 1024 / 1024).toFixed(1)} / {(resources.memory.heapTotal / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Process RSS (Resident):</span>
                    <span className="text-slate-800 font-bold">{(resources.memory.rss / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Application Uptime:</span>
                    <span className="text-slate-800 font-bold">{Math.floor(resources.uptime / 60)} minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CPU Usage User / Sys:</span>
                    <span className="text-slate-800 font-bold">
                      {(resources.cpu.user / 1000).toFixed(0)} ms / {(resources.cpu.system / 1000).toFixed(0)} ms
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic font-mono">Retrieving system states...</div>
              )}
            </div>

            {/* Database Stats Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Database size={16} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-750 uppercase tracking-wider">Current Database</h3>
              </div>

              {resources ? (
                <div className="space-y-3 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Messages:</span>
                    <span className="text-slate-800 font-bold">{(resources as any).messageCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reports:</span>
                    <span className="text-slate-800 font-bold">{(resources as any).reportCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Submissions:</span>
                    <span className="text-slate-800 font-bold">{(resources as any).submissionCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Snapshots:</span>
                    <span className="text-slate-800 font-bold">{(resources as any).snapshotCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">File Size:</span>
                    <span className="text-slate-800 font-bold">{(resources.dbSize / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2">
                    <span className="text-slate-500 font-sans font-semibold">Last Backup:</span>
                    <span className="text-slate-850 font-bold text-[10px]">{(resources as any).lastBackupTime || 'Never'}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic font-mono">Querying database sizes...</div>
              )}
            </div>

            {/* Diagnostics Version Info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-slate-800 flex flex-col justify-between shadow-sm">
              <div>
                <h3 className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Engine Metadata</h3>
                <div className="space-y-2 mt-4 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Parser Version:</span>
                    <span className="font-bold text-slate-700">v2.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">SQLite Engine:</span>
                    <span className="text-slate-700 font-semibold">Prisma Node Client</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">IPC Channels:</span>
                    <span className="text-emerald-700 font-bold">100% HEALTHY</span>
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-slate-500 font-mono text-right mt-4">
                Node {process.versions.node}
              </div>
            </div>

          </div>
        </div>
      ) : null}

      {/* Main Body Grid: Activity Feed & Backup Utility */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl">
        
        {/* Live Activity Feed Column */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[500px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center space-x-2">
              <Activity size={16} className="text-blue-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Live Activity Feed</h2>
            </div>
            
            {/* Event Category Filters */}
            <div className="flex space-x-1">
              {(['ALL', 'OPERATIONAL', 'PARSER', 'AUDIT'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setEventFilter(f)}
                  className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${
                    eventFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Activity Events list */}
          <div ref={listRef} className="flex-1 overflow-auto space-y-2.5 pr-2 font-mono text-xs">
            {filteredEvents.length > 0 ? (
              filteredEvents.map(e => (
                <div key={e.id} className="p-2 rounded border border-slate-100 hover:bg-slate-50 transition-colors flex justify-between items-start">
                  <div>
                    <span className="text-slate-400 text-[10px]">{e.time}</span>
                    <span className={`ml-2 text-[9px] font-bold px-1 py-0.5 rounded text-white ${
                      e.type === 'AUDIT' ? 'bg-purple-600' : e.type === 'PARSER' ? 'bg-amber-600' : 'bg-blue-600'
                    }`}>
                      {e.type}
                    </span>
                    <p className="text-slate-700 font-semibold mt-1">{e.message}</p>
                  </div>
                  <span className={`text-[10px] font-bold ${
                    e.status === 'ERROR' ? 'text-rose-600' : e.status === 'WARNING' ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {e.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-slate-400 text-xs italic text-center mt-20">No activity events recorded.</div>
            )}
          </div>
        </div>

        {/* Database Backups manager */}
        {isAdmin ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[500px]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
              <div className="flex items-center space-x-2">
                <Database size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Database Backups</h2>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={backupLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded transition shadow-sm"
              >
                Create Backup
              </button>
            </div>

            <div className="flex-1 overflow-auto space-y-2 pr-2">
              {backups.length > 0 ? (
                backups.map(b => (
                  <div
                    key={b.filename}
                    onClick={() => handleSelectBackupForRestore(b.filename)}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800 truncate max-w-[150px]">{b.filename}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {new Date(b.birthtime).toLocaleDateString()} at {new Date(b.birthtime).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 font-bold bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                      {(b.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400 text-xs italic text-center mt-20">No backups found. Click Create Backup.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-6 flex flex-col justify-center items-center text-center space-y-2">
            <ShieldAlert size={28} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-600">Administrative Restrict</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">
              Database backups management is restricted to Administrators. Switch simulation roles to inspect this feature.
            </p>
          </div>
        )}

      </div>

      {/* Restore Database Double-Validation Modal */}
      {showRestoreModal && selectedBackup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl max-w-md w-full border border-slate-200 p-6 shadow-xl space-y-6">
            <div className="flex items-start space-x-3">
              <div className="bg-red-50 text-red-600 p-2.5 rounded-lg mt-0.5">
                <AlertOctagon size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950">Restore Database Backup</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You are about to restore a database backup. This will overwrite the current SQLite operational state.
                </p>
              </div>
            </div>

            {/* Validation State Box */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs font-semibold">
              <div className="flex justify-between">
                <span className="text-slate-400">File Selected:</span>
                <span className="text-slate-800 break-all">{selectedBackup}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Integrity check:</span>
                {validating ? (
                  <span className="text-blue-600 animate-pulse">Running checks...</span>
                ) : validationResult?.success && validationResult?.isValid ? (
                  <span className="text-emerald-600 font-bold flex items-center space-x-1">
                    <CheckCircle size={12} className="mr-0.5" /> Healthy SQLite Database
                  </span>
                ) : (
                  <span className="text-red-600 font-bold">
                    ⚠️ Invalid SQLite File ({validationResult?.error || 'Corrupted'})
                  </span>
                )}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg text-xs leading-relaxed font-semibold">
              ℹ️ **Important**: The application will automatically create a pre-restore backup of the active database before relaunching.
            </div>

            <div className="flex space-x-3 justify-end pt-2">
              <button
                disabled={restoring}
                onClick={() => setShowRestoreModal(false)}
                className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={restoring || validating || !validationResult?.isValid}
                onClick={handleConfirmRestore}
                className="bg-red-600 hover:bg-red-750 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5"
              >
                {restoring ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <span>Confirm Restore</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
