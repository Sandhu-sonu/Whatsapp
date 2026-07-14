import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Activity, RefreshCw, Bookmark, CheckCircle, Clock, Calendar } from 'lucide-react';

interface Stats {
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
}

interface SubmissionRow {
  id: string;
  districtId: string;
  district: {
    id: string;
    name: string;
    code: string;
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
    receivedAt?: string | Date;
  }>;
}

interface DistrictItem {
  id: string;
  name: string;
  code: string;
}

export default function DashboardPage() {
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [reportDate, setReportDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hasData, setHasData] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  const [allDistricts, setAllDistricts] = useState<DistrictItem[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalDistricts: 23,
    submittedCount: 0,
    pendingCount: 23,
    appointmentsBooked: 0,
    served: 0,
    cancelled: 0,
    rescheduled: 0,
    serviceRate: 0,
    cancellationRate: 0,
    rescheduleRate: 0,
  });
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Read telemetry values from the Zustand store
  const workerStatus = useStore((state) => state.workerStatus);
  const workerState = useStore((state) => state.workerState);
  const memory = useStore((state) => state.memory);
  const uptime = useStore((state) => state.uptime);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '--';
    if (dateStr === '1970-01-01') return 'Missing Date';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const showNotification = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  };

  const getYesterdayLocalDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    // Load all districts list once
    window.api.getDistricts()
      .then(data => setAllDistricts(data))
      .catch(err => console.error('Failed to load districts:', err));

    // Establish default date as yesterday's local date
    const yesterdayStr = getYesterdayLocalDateString();
    setReportDate(yesterdayStr);
    setFromDate(yesterdayStr);
    setToDate(yesterdayStr);
    setHasData(true);
  }, []);

  useEffect(() => {
    if (hasData) {
      loadDashboardData();
    }

    // Reload when messages are captured
    const unsubscribe = window.api.onMessageCaptured((payload: any) => {
      const { reportDate: incomingDate, districtName } = payload;
      
      if (incomingDate) {
        // Exclude sentinel date from refreshing the dashboard directly
        if (incomingDate === '1970-01-01') {
          showNotification(`New invalid report received from ${payload.sender || 'Unknown'} (Missing Date).`);
          return;
        }

        const currentSelectedDate = dateMode === 'single' ? reportDate : null;
        if (dateMode === 'single' && incomingDate === currentSelectedDate) {
          // Automatic reload because it matches current date filter
          loadDashboardData();
        } else {
          // Toast alert, do not switch view date
          showNotification(`New report received for District "${districtName}" for Report Date: ${formatDateDisplay(incomingDate)}`);
        }
      } else {
        showNotification(`New message received from ${payload.sender || 'Unknown'}`);
      }
    });

    return () => unsubscribe();
  }, [hasData, dateMode, reportDate, fromDate, toDate]);

  const loadDashboardData = () => {
    const queryFrom = dateMode === 'single' ? reportDate : fromDate;
    const queryTo = dateMode === 'single' ? reportDate : toDate;

    if (!queryFrom || !queryTo) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      window.api.getDashboardSummary(queryFrom, queryTo),
      window.api.getSubmissionsForRange(queryFrom, queryTo)
    ])
      .then(([summaryData, submissionData]) => {
        setStats(summaryData);
        setSubmissions(submissionData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load dashboard data:', err);
        setError('Database Error: Failed to retrieve dashboard summary.');
        setLoading(false);
      });
  };

  const handleStartWorker = async () => {
    setActionLoading(true);
    setError('');
    try {
      const settings = await window.api.getSettings();
      const targetGroup = settings['Group Name'] || 'DSD Monitoring';
      const isHeadless = settings['Theme Selection'] === 'headless' || false;
      const launched = await window.api.startWorker(targetGroup, isHeadless);
      if (!launched) {
        setError('Worker is already running.');
      }
    } catch (err: any) {
      console.error(err);
      setError(`Failed to launch worker: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopWorker = async () => {
    setActionLoading(true);
    setError('');
    try {
      await window.api.stopWorker();
    } catch (err: any) {
      console.error(err);
      setError(`Failed to stop worker: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Determine list of Pending Districts for the selected date or range
  const submittedDistrictIds = new Set(
    submissions
      .filter(s => s.status === 'SUBMITTED')
      .map(s => s.districtId)
  );

  const pendingDistrictsList = allDistricts.filter(d => !submittedDistrictIds.has(d.id));

  // Find latest submission details from submission rows based on WhatsApp message receivedAt time
  const latestSubRow = [...submissions]
    .filter(s => s.status === 'SUBMITTED' && s.reports.length > 0)
    .sort((a, b) => {
      const timeA = new Date(a.reports[0].receivedAt || a.submittedAt || '').getTime();
      const timeB = new Date(b.reports[0].receivedAt || b.submittedAt || '').getTime();
      return timeB - timeA;
    })[0];

  const formatSubmitTime = (input: string | Date | null | undefined) => {
    if (!input) return '--:--';
    try {
      const d = new Date(input);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  };

  return (
    <div className="p-6 space-y-6 relative bg-slate-50 text-slate-800 min-h-full">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-blue-900 border border-blue-800 text-white px-4 py-3 rounded-lg shadow-2xl text-xs flex items-center space-x-2.5 animate-bounce">
          <Activity size={13} className="text-blue-300" />
          <span className="font-semibold">{toast}</span>
          <button onClick={() => setToast(null)} className="text-blue-200 hover:text-white font-bold ml-2">×</button>
        </div>
      )}

      {/* Header & Date Range Selectors */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-4 border border-slate-200 shadow-sm rounded-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daily Operations Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">Real-time Punjab DSD reports monitoring and workflow metrics.</p>
        </div>
        
        {/* Unified Date filter controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-2 border border-slate-200 rounded-lg">
          <div className="flex border border-slate-200 rounded overflow-hidden bg-white">
            <button
              onClick={() => setDateMode('single')}
              className={`px-3 py-1 text-[10px] font-bold uppercase transition ${
                dateMode === 'single' ? 'bg-blue-600 text-white shadow-sm' : 'bg-transparent text-slate-655 hover:bg-slate-50'
              }`}
            >
              Report Date
            </button>
            <button
              onClick={() => setDateMode('range')}
              className={`px-3 py-1 text-[10px] font-bold uppercase transition ${
                dateMode === 'range' ? 'bg-blue-600 text-white shadow-sm' : 'bg-transparent text-slate-655 hover:bg-slate-50'
              }`}
            >
              Date Range
            </button>
          </div>

          <Calendar size={13} className="text-blue-600" />
          
          {dateMode === 'single' ? (
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="bg-white border border-slate-350 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-blue-500 font-mono font-semibold"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-[9px] text-slate-500 uppercase font-bold">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-white border border-slate-350 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
              />
              <span className="text-[9px] text-slate-500 uppercase font-bold">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-white border border-slate-350 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
              />
            </div>
          )}
          <button 
            onClick={loadDashboardData}
            className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 p-1.5 rounded transition shadow-sm"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-xs text-red-700 font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Primary KPI Grid (Operational Statistics only, no charts) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
          Daily Submission Summary Matrix (Report Date: {dateMode === 'single' ? (reportDate ? formatDateDisplay(reportDate) : '--') : `${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`})
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-blue-600 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Districts</span>
            <div className="text-3xl font-black text-slate-900 mt-1 font-mono">{stats.totalDistricts}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-emerald-600 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-emerald-700">Submitted</span>
            <div className="text-3xl font-black text-emerald-700 mt-1 font-mono">{stats.submittedCount}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-rose-500 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-rose-700">Pending</span>
            <div className="text-3xl font-black text-rose-700 mt-1 font-mono">{stats.pendingCount}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-indigo-600 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-blue-700">Service Rate</span>
            <div className="text-3xl font-black text-blue-700 mt-1 font-mono">{stats.serviceRate.toFixed(2)}%</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-sky-500 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Appointments Booked</span>
            <div className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">{stats.appointmentsBooked}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-teal-600 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-emerald-650">Served</span>
            <div className="text-2xl font-extrabold text-emerald-650 mt-1 font-mono">{stats.served}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-orange-500 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-rose-650">Cancelled</span>
            <div className="text-2xl font-extrabold text-rose-650 mt-1 font-mono">{stats.cancelled}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-amber-600">Rescheduled</span>
            <div className="text-2xl font-extrabold text-amber-600 mt-1 font-mono">{stats.rescheduled}</div>
          </div>
        </div>
      </div>

      {/* Two Column Operational Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pending Districts list */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 lg:col-span-2 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center">
              <Clock size={14} className="mr-1.5 text-rose-600" />
              Pending Districts ({pendingDistrictsList.length})
            </h3>
          </div>
          
          {pendingDistrictsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-emerald-650 font-semibold flex items-center justify-center space-x-2">
              <CheckCircle size={16} />
              <span>All 23 districts have submitted their reports!</span>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {pendingDistrictsList.map((district) => (
                <li key={district.id} className="flex items-center space-x-2.5 p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="font-semibold text-slate-700">{district.name}</span>
                  <span className="text-[9px] font-mono text-slate-500 ml-auto">({district.code})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: Latest Submission Info Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-850 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center">
            <Bookmark size={14} className="mr-1.5 text-blue-600" />
            Latest Submission
          </h3>

          {latestSubRow ? (
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3 flex-1 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">District Name</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{latestSubRow.district.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Time</div>
                  <div className="text-xs font-semibold text-slate-700 font-mono mt-0.5">
                    {formatSubmitTime(latestSubRow.reports.length > 0 ? latestSubRow.reports[0].receivedAt : latestSubRow.submittedAt)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Validation Status</div>
                  <div className="text-xs font-bold text-emerald-700 mt-0.5 flex items-center">
                    <CheckCircle size={10} className="mr-1" /> 
                    {latestSubRow.reports.length > 0 ? latestSubRow.reports[0].validationStatus : 'VALID'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400 italic p-6 text-center leading-relaxed">
              No reports received yet.<br/>Waiting for first DSD Performance Report...
            </div>
          )}
        </div>
      </div>

      {/* Worker State Monitor Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap justify-between items-center gap-4 shadow-sm">
        <div className="flex items-center space-x-3 text-xs">
          <Activity size={16} className="text-blue-500 animate-pulse" />
          <span className="text-slate-800 font-semibold">WhatsApp Sync Worker:</span>
          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[9px] border ${
            workerStatus === 'Running' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}>
            {workerState}
          </span>
          <span className="text-slate-500 font-mono">RAM: {(memory / 1024 / 1024).toFixed(1)} MB</span>
          <span className="text-slate-500 font-mono">Uptime: {uptime > 0 ? `${Math.floor(uptime/60)}m ${uptime%60}s` : '0s'}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleStartWorker}
            disabled={actionLoading || workerStatus === 'Running' || workerStatus === 'Starting'}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-1.5 rounded transition shadow-sm"
          >
            Start Worker
          </button>
          <button
            onClick={handleStopWorker}
            disabled={actionLoading || workerStatus === 'Stopped'}
            className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-1.5 rounded transition shadow-sm"
          >
            Stop Worker
          </button>
        </div>
      </div>
    </div>
  );
}
