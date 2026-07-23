import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useRole, UserRole } from '../contexts/RoleContext';
import { 
  RefreshCw, 
  Terminal, 
  Settings as SettingsIcon,
  Shield,
  Smartphone,
  Sliders,
  Database,
  Monitor,
  AlertTriangle
} from 'lucide-react';

interface Diagnostics {
  workerPid?: number;
  browserVersion: string;
  playwrightVersion: string;
  sessionPath: string;
  currentState: string;
  lastRestart?: string;
  lastError?: string;
}

export default function SettingsPage() {
  const setThemeStore = useStore((state) => state.setTheme);
  const { role, setRole, isDeveloper, isAdmin } = useRole();

  // Config States
  const [groupName, setGroupName] = useState('');
  const [headlessMode, setHeadlessMode] = useState('true');
  const [autoStartWorker, setAutoStartWorker] = useState('false');
  const [browserProfilePath, setBrowserProfilePath] = useState('');
  
  const [parserVersion, setParserVersion] = useState('2.0.0');
  const [confidenceThreshold, setConfidenceThreshold] = useState('80');
  const [manualReviewThreshold, setManualReviewThreshold] = useState('80');
  
  const [defaultDashboardDate, setDefaultDashboardDate] = useState('Latest');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState('30');
  const [exportFolder, setExportFolder] = useState('');
  
  const [backupFolder, setBackupFolder] = useState('');
  const [autoBackupSchedule, setAutoBackupSchedule] = useState('Daily');
  const [retentionPolicy, setRetentionPolicy] = useState('30');
  const [maxBackupCount, setMaxBackupCount] = useState('10');
  
  const [theme, setTheme] = useState('light');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<Record<string, boolean>>({});
  
  // Diagnostics State
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  useEffect(() => {
    // Load Settings
    window.api
      .getSettings()
      .then((settings) => {
        setGroupName(settings['Group Name'] || 'DSD Monitoring');
        setHeadlessMode(settings['Headless Mode'] || 'true');
        setAutoStartWorker(settings['Auto Start Worker'] || 'false');
        setBrowserProfilePath(settings['Browser Profile Path'] || '');
        setParserVersion(settings['Parser Version'] || '2.0.0');
        setConfidenceThreshold(settings['Confidence Threshold'] || '80');
        setManualReviewThreshold(settings['Manual Review Threshold'] || '80');
        setDefaultDashboardDate(settings['Default Dashboard Date'] || 'Latest');
        setAutoRefreshInterval(settings['Auto Refresh Interval'] || '30');
        setExportFolder(settings['Export Folder'] || '');
        setBackupFolder(settings['Backup Folder'] || '');
        setAutoBackupSchedule(settings['Auto Backup Schedule'] || 'Daily');
        setRetentionPolicy(settings['Retention Policy'] || '30');
        setMaxBackupCount(settings['Max Backup Count'] || '10');
        setTheme(settings['Theme'] || 'light');
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load settings:', err);
        setError('Database Error: Failed to retrieve system configurations.');
        setLoading(false);
      });

    // Load Diagnostics
    loadDiagnostics();
  }, []);

  const loadDiagnostics = () => {
    setDiagLoading(true);
    window.api
      .getWorkerDiagnostics()
      .then((diag) => {
        setDiagnostics(diag);
        setDiagLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load worker diagnostics:', err);
        setDiagLoading(false);
      });
  };

  const handleChange = async (key: string, value: string, setter: (val: string) => void) => {
    setter(value);
    try {
      await window.api.saveSetting(key, value);
      
      if (key === 'Theme') {
        setThemeStore(value as 'dark' | 'light');
      }

      setSaveStatus((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [key]: false }));
      }, 1500);
    } catch (err) {
      console.error(`Failed to save setting ${key}:`, err);
      setError('Database Error: Failed to persist configurations.');
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 text-slate-800 min-h-full">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500 mt-1">Configure system variables and monitor diagnostic status.</p>
        </div>
        <div className="flex items-center space-x-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
          <Shield size={16} className="text-blue-600" />
          <span className="text-xs font-bold text-blue-800 uppercase">Simulated Role: {role}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-xs text-red-750 font-mono">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 animate-pulse shadow-sm">
          <div className="h-10 bg-slate-100 rounded w-1/3" />
          <div className="h-10 bg-slate-100 rounded w-1/2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl">
          {/* Main Config Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 1. WhatsApp Configuration */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Smartphone size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">WhatsApp Service Settings</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">WhatsApp Group Name</label>
                    {saveStatus['Group Name'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => handleChange('Group Name', e.target.value, setGroupName)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                    placeholder="DSD Monitoring"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Headless Mode</label>
                    {saveStatus['Headless Mode'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <select
                    value={headlessMode}
                    onChange={(e) => handleChange('Headless Mode', e.target.value, setHeadlessMode)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="true">Headless (Background Process)</option>
                    <option value="false">Visible Browser (Debugging)</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Auto Start Worker</label>
                    {saveStatus['Auto Start Worker'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <select
                    value={autoStartWorker}
                    onChange={(e) => handleChange('Auto Start Worker', e.target.value, setAutoStartWorker)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="true">Yes, on app launch</option>
                    <option value="false">No, start manually</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Browser Profile Path</label>
                    {saveStatus['Browser Profile Path'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="text"
                    value={browserProfilePath}
                    onChange={(e) => handleChange('Browser Profile Path', e.target.value, setBrowserProfilePath)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                    placeholder="default/profile/path"
                  />
                </div>
              </div>
            </div>

            {/* 2. Parser settings */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Sliders size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Parser Rules</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Parser Version</label>
                    {saveStatus['Parser Version'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="text"
                    value={parserVersion}
                    onChange={(e) => handleChange('Parser Version', e.target.value, setParserVersion)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                    placeholder="2.0.0"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Confidence Target (%)</label>
                    {saveStatus['Confidence Threshold'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="number"
                    value={confidenceThreshold}
                    onChange={(e) => handleChange('Confidence Threshold', e.target.value, setConfidenceThreshold)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Review Cutoff (%)</label>
                    {saveStatus['Manual Review Threshold'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="number"
                    value={manualReviewThreshold}
                    onChange={(e) => handleChange('Manual Review Threshold', e.target.value, setManualReviewThreshold)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Reports Settings */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <SettingsIcon size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Reports & Export Preferences</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Auto Refresh Interval (Seconds)</label>
                    {saveStatus['Auto Refresh Interval'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="number"
                    value={autoRefreshInterval}
                    onChange={(e) => handleChange('Auto Refresh Interval', e.target.value, setAutoRefreshInterval)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Default Export Folder</label>
                    {saveStatus['Export Folder'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <input
                    type="text"
                    value={exportFolder}
                    onChange={(e) => handleChange('Export Folder', e.target.value, setExportFolder)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                    placeholder="Downloads/DsdExports"
                  />
                </div>
              </div>
            </div>

            {/* 3. Database Settings */}
            {isAdmin ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                  <Database size={16} className="text-blue-600" />
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Database & Backup Rules</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Backup Folder Path</label>
                      {saveStatus['Backup Folder'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                    </div>
                    <input
                      type="text"
                      value={backupFolder}
                      onChange={(e) => handleChange('Backup Folder', e.target.value, setBackupFolder)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      placeholder="./database/backups"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Auto Backup Schedule</label>
                      {saveStatus['Auto Backup Schedule'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                    </div>
                    <select
                      value={autoBackupSchedule}
                      onChange={(e) => handleChange('Auto Backup Schedule', e.target.value, setAutoBackupSchedule)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                    >
                      <option value="Daily">Daily Backup</option>
                      <option value="Weekly">Weekly Backup</option>
                      <option value="None">Disabled</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Backup Retention (Days)</label>
                      {saveStatus['Retention Policy'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                    </div>
                    <input
                      type="number"
                      value={retentionPolicy}
                      onChange={(e) => handleChange('Retention Policy', e.target.value, setRetentionPolicy)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Max Backups to Keep</label>
                      {saveStatus['Max Backup Count'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                    </div>
                    <input
                      type="number"
                      value={maxBackupCount}
                      onChange={(e) => handleChange('Max Backup Count', e.target.value, setMaxBackupCount)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                      placeholder="10"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-center space-x-2 text-slate-500 text-xs italic">
                <Shield size={14} />
                <span>Database Backup settings are restricted to Administrators and Developers.</span>
              </div>
            )}

            {/* 4. Application Settings */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Monitor size={16} className="text-blue-600" />
                <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Application Preference</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Theme Preference</label>
                    {saveStatus['Theme'] && <span className="text-[10px] text-emerald-600 font-bold font-mono">Saved</span>}
                  </div>
                  <select
                    value={theme}
                    onChange={(e) => handleChange('Theme', e.target.value, setTheme)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="light">Light Theme (Default Admin)</option>
                    <option value="dark">Dark Theme (Deep Slate)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Default Dashboard Date</label>
                  <select
                    value={defaultDashboardDate}
                    onChange={(e) => handleChange('Default Dashboard Date', e.target.value, setDefaultDashboardDate)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="Latest">Latest Received Report Date</option>
                    <option value="Today">Current Operational Day (Today)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Simulate User Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-blue-50 border border-blue-300 rounded-lg p-2 text-xs text-blue-900 focus:outline-none focus:border-blue-500 font-bold uppercase"
                  >
                    <option value="OPERATOR">Operator</option>
                    <option value="ADMINISTRATOR">Administrator</option>
                    <option value="DEVELOPER">Developer</option>
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* Diagnostics Column */}
          <div className="space-y-6">
            
            {/* Diagnostic Panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Terminal size={16} className="text-blue-600" />
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Diagnostics logs</h2>
                </div>
                <button
                  onClick={loadDiagnostics}
                  disabled={diagLoading}
                  className="bg-white border border-slate-300 hover:bg-slate-100 p-1.5 rounded transition shadow-sm"
                >
                  <RefreshCw size={12} className={diagLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {diagnostics ? (
                <div className="space-y-3 text-xs font-mono">
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Worker PID</div>
                    <div className="text-slate-800 font-semibold">{diagnostics.workerPid || 'Not Spawned (Stopped)'}</div>
                  </div>

                  <div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Browser Context</div>
                    <div className="text-slate-800 font-semibold">{diagnostics.browserVersion}</div>
                  </div>

                  <div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Playwright Engine</div>
                    <div className="text-slate-800 font-semibold">{diagnostics.playwrightVersion}</div>
                  </div>

                  <div>
                    <div className="text-[9px] text-slate-500 uppercase font-bold">Worker Status</div>
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mt-0.5 uppercase">
                      {diagnostics.currentState}
                    </div>
                  </div>

                  {diagnostics.lastRestart && (
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold">Last Process Spawn</div>
                      <div className="text-slate-800 font-semibold">{diagnostics.lastRestart}</div>
                    </div>
                  )}

                  {isDeveloper ? (
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold">Browser Profile Directory</div>
                      <div className="text-slate-600 break-all select-all text-[10px] bg-slate-50 p-1.5 rounded border border-slate-200 mt-1 font-semibold">{diagnostics.sessionPath}</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 italic">Profile path hidden in standard view.</div>
                  )}

                  {diagnostics.lastError && (
                    <div className="flex items-start space-x-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-750">
                      <AlertTriangle size={14} className="text-rose-700 mt-0.5" />
                      <div>
                        <div className="text-[9px] text-rose-700 uppercase font-bold">Last Worker Error</div>
                        <div className="text-rose-800 text-[10px] leading-relaxed mt-1 break-words font-semibold">{diagnostics.lastError}</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No diagnostics data loaded.</div>
              )}
            </div>
            
            {/* Version Badge */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-slate-800 space-y-2 shadow-sm">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Application Metadata</div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">Core Engine:</span>
                <span className="font-mono font-bold text-slate-700">v{parserVersion}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">Release Build:</span>
                <span className="font-mono text-slate-700">2026.07.08</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">Database Client:</span>
                <span className="font-mono text-slate-700">Prisma (v5.22.0)</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">Runtime Platform:</span>
                <span className="font-mono text-slate-700 text-[10px]">Electron Sandbox</span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
