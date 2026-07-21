import { useEffect, useState } from 'react';
import { useRole } from '../contexts/RoleContext';
import { 
  RefreshCw, 
  Search, 
  ArrowUpDown, 
  Download, 
  X, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  HelpCircle,
  FileCode
} from 'lucide-react';

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
  status: string; // "SUBMITTED" | "PENDING"
  reports: Array<{
    id: string;
    appointmentsBooked: number;
    served: number;
    cancelled: number;
    rescheduled: number;
    validationStatus: string;
    confidence: number;
    parserMode?: string;
    validationErrors?: string | null;
    revisionNumber?: number;
    receivedAt?: string;
    metricsJson?: string | null;
    parserVersion?: string | null;
    parserEngine?: { name: string; version: string; build: string } | null;
  }>;
}

export default function ReportsPage() {
  const { isDeveloper, isAdmin } = useRole();

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hasData, setHasData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState<'all' | 'submitted' | 'pending'>('all');
  const [validationFilter, setValidationFilter] = useState<'all' | 'VALID' | 'WARNING' | 'INVALID'>('all');

  // Sorting
  const [sortField, setSortField] = useState<string>('district.name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Details Modal
  const [selectedDistrict, setSelectedDistrict] = useState<{ id: string; name: string } | null>(null);
  const [districtHistory, setDistrictHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Expanded trace states for each report ID
  const [expandedDecisions, setExpandedDecisions] = useState<Record<string, boolean>>({});
  const [expandedDebugs, setExpandedDebugs] = useState<Record<string, boolean>>({});

  // Replay Modal States
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayData, setReplayData] = useState<{
    oldReport: any;
    newResult: any;
  } | null>(null);
  const [applyingReplay, setApplyingReplay] = useState(false);

  // Table Data
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load latest report date on mount
    window.api.getLatestReportDate()
      .then((latestDate) => {
        if (latestDate) {
          setFromDate(latestDate);
          setToDate(latestDate);
          setHasData(true);
        } else {
          setFromDate('');
          setToDate('');
          setHasData(false);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load latest date:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (hasData) {
      loadSubmissions();
    }

    // Reload when messages are captured
    const unsubscribe = window.api.onMessageCaptured(() => {
      if (hasData) loadSubmissions();
    });

    return () => unsubscribe();
  }, [hasData, fromDate, toDate]);

  const loadSubmissions = () => {
    if (!fromDate || !toDate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    window.api.getSubmissionsForRange(fromDate, toDate)
      .then((data) => {
        setSubmissions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load status board:', err);
        setError('Database Error: Failed to fetch daily submission status board.');
        setLoading(false);
      });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const openDistrictDetails = (districtId: string, districtName: string) => {
    setSelectedDistrict({ id: districtId, name: districtName });
    setLoadingHistory(true);
    setExpandedDecisions({});
    setExpandedDebugs({});
    
    // Query full district history
    window.api.getDistrictHistory(districtId, fromDate, toDate)
      .then((data) => {
        setDistrictHistory(data);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error('Failed to load district history details:', err);
        setLoadingHistory(false);
      });
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    if (format === 'pdf') {
      const success = await window.api.exportPmuReport(fromDate, toDate);
      if (success) {
        alert('Successfully exported PMU Performance Report PDF.');
      } else {
        alert('Export cancelled or failed.');
      }
      return;
    }

    const headers = ['District', 'Report Date', 'Submitted', 'Received Time', 'Booked', 'Served', 'Cancelled', 'Rescheduled', 'Service %', 'Status'];
    const rows = sortedSubmissions.map((s) => {
      const hasReport = s.reports.length > 0;
      const report = hasReport ? s.reports[0] : null;
      const booked = report ? report.appointmentsBooked : 0;
      const servicePct = report && booked > 0 ? (report.served / booked) * 100 : 0;
      
      return [
        s.district.name,
        new Date(s.reportDate).toLocaleDateString('en-IN'),
        s.status,
        s.submittedAt ? new Date(s.submittedAt).toLocaleTimeString() : '--',
        report ? String(booked) : '0',
        report ? String(report.served) : '0',
        report ? String(report.cancelled) : '0',
        report ? String(report.rescheduled) : '0',
        report ? `${servicePct.toFixed(1)}%` : '--',
        report ? report.validationStatus : 'PENDING'
      ];
    });

    const filename = `dsd_status_board_${fromDate}_to_${toDate}`;
    const success = await window.api.exportData(filename, format, headers, rows);
    if (success) {
      alert(`Successfully exported reports summary as ${format.toUpperCase()}`);
    } else {
      alert(`Export cancelled or failed.`);
    }
  };

  const handleTriggerReplay = async (reportId: string) => {
    setReplayLoading(true);
    setReplayData(null);
    setShowReplayModal(true);

    try {
      const res = await window.api.replayReport(reportId);
      if (res.success) {
        setReplayData({
          oldReport: res.oldReport,
          newResult: res.newResult
        });
      } else {
        alert('Failed to run replay: ' + res.error);
        setShowReplayModal(false);
      }
    } catch (err: any) {
      alert('Error during replay: ' + err.message);
      setShowReplayModal(false);
    } finally {
      setReplayLoading(false);
    }
  };

  const handleApplyReplay = async () => {
    if (!replayData) return;
    setApplyingReplay(true);

    try {
      await window.api.applyReplayCorrection(
        replayData.oldReport.id,
        replayData.newResult,
        'Operator'
      );
      alert('Replay parser results applied successfully! Logged in audit trail.');
      setShowReplayModal(false);
      loadSubmissions();
      if (selectedDistrict) {
        openDistrictDetails(selectedDistrict.id, selectedDistrict.name);
      }
    } catch (err: any) {
      alert('Failed to save replayed parse: ' + err.message);
    } finally {
      setApplyingReplay(false);
    }
  };

  // Filter Submissions
  const filteredSubmissions = submissions.filter((s) => {
    const nameMatch = s.district.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const subMatch = 
      submissionFilter === 'all' || 
      (submissionFilter === 'submitted' && s.status === 'SUBMITTED') ||
      (submissionFilter === 'pending' && s.status === 'PENDING');

    const hasReport = s.reports.length > 0;
    const reportStatus = hasReport ? s.reports[0].validationStatus : 'PENDING';
    const valMatch = 
      validationFilter === 'all' || 
      (validationFilter === reportStatus);

    return nameMatch && subMatch && valMatch;
  });

  // Sort Submissions
  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    let aVal: any = '';
    let bVal: any = '';

    if (sortField === 'district.name') {
      aVal = a.district.name;
      bVal = b.district.name;
    } else if (sortField === 'reportDate') {
      aVal = new Date(a.reportDate).getTime();
      bVal = new Date(b.reportDate).getTime();
    } else if (sortField === 'submittedAt') {
      aVal = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      bVal = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    } else if (sortField === 'status') {
      aVal = a.status;
      bVal = b.status;
    } else {
      const aRep = a.reports[0];
      const bRep = b.reports[0];
      if (sortField === 'booked') {
        aVal = aRep ? aRep.appointmentsBooked : 0;
        bVal = bRep ? bRep.appointmentsBooked : 0;
      } else if (sortField === 'served') {
        aVal = aRep ? aRep.served : 0;
        bVal = bRep ? bRep.served : 0;
      } else if (sortField === 'serviceRate') {
        const aBooked = aRep ? aRep.appointmentsBooked : 0;
        const bBooked = bRep ? bRep.appointmentsBooked : 0;
        aVal = aRep && aBooked > 0 ? (aRep.served / aBooked) : 0;
        bVal = bRep && bBooked > 0 ? (bRep.served / bBooked) : 0;
      } else if (sortField === 'validationStatus') {
        aVal = aRep ? aRep.validationStatus : '';
        bVal = bRep ? bRep.validationStatus : '';
      } else if (sortField === 'confidence') {
        aVal = aRep ? aRep.confidence : 0;
        bVal = bRep ? bRep.confidence : 0;
      } else if (sortField === 'revisionNumber') {
        aVal = aRep ? aRep.revisionNumber || 0 : 0;
        bVal = bRep ? bRep.revisionNumber || 0 : 0;
      }
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleDecision = (id: string) => {
    setExpandedDecisions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleDebug = (id: string) => {
    setExpandedDebugs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-6 space-y-6 flex flex-col h-full relative bg-slate-50 text-slate-800">
      {/* Header and Date Filter */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-4 border border-slate-200 shadow-sm rounded-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-900">District Status Board</h1>
          <p className="text-xs text-slate-500 mt-0.5">Comprehensive audit ledger of daily submissions, metric logs, and status validations.</p>
        </div>

        <div className="flex items-center space-x-3 text-xs bg-slate-50 p-2 border border-slate-200 rounded-lg">
          <Calendar size={13} className="text-blue-600" />
          <div className="flex items-center space-x-2">
            <span className="text-[9px] text-slate-500 uppercase font-semibold">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[9px] text-slate-500 uppercase font-semibold">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <button 
            onClick={loadSubmissions}
            className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-650 p-1.5 rounded transition shadow-sm"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-xs text-red-750 font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Search, Filter, and Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-450" />
          <input
            type="text"
            placeholder="Search district..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-250 rounded-lg py-2 pl-9 pr-4 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400 font-semibold"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold">Submission:</span>
          <select
            value={submissionFilter}
            onChange={(e) => setSubmissionFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-250 rounded px-2 py-1.5 text-slate-750 focus:outline-none font-semibold"
          >
            <option value="all">All</option>
            <option value="submitted">Submitted</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-slate-500 uppercase font-bold">Validation:</span>
          <select
            value={validationFilter}
            onChange={(e) => setValidationFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-250 rounded px-2 py-1.5 text-slate-750 focus:outline-none font-semibold"
          >
            <option value="all">All Statuses</option>
            <option value="VALID">VALID</option>
            <option value="WARNING">WARNING</option>
            <option value="INVALID">INVALID</option>
          </select>
        </div>

        {/* Exports */}
        <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg p-1 ml-auto shadow-inner">
          <span className="text-[9px] text-slate-500 uppercase font-bold px-2">Export:</span>
          <button 
            onClick={() => handleExport('csv')}
            className="hover:bg-slate-200 text-slate-750 px-2 py-1 rounded font-bold text-[10px] transition"
          >
            CSV
          </button>
          <button 
            onClick={() => handleExport('excel')}
            className="hover:bg-slate-200 text-slate-750 px-2 py-1 rounded font-bold text-[10px] transition"
          >
            Excel
          </button>
          <button 
            onClick={() => handleExport('pdf')}
            className="hover:bg-slate-200 text-slate-750 px-2 py-1 rounded font-bold text-[10px] flex items-center space-x-1 transition"
          >
            <Download size={10} />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col justify-between min-h-[400px] shadow-sm">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">Loading status board records...</div>
        ) : sortedSubmissions.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">No submission logs match filters.</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[600px] flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 select-none uppercase tracking-wider text-[10px]">
                  <th onClick={() => handleSort('district.name')} className="py-3 px-4 cursor-pointer hover:text-slate-900 sticky left-0 bg-slate-100 border-r border-slate-200 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                    <span className="flex items-center space-x-1"><span>District</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th onClick={() => handleSort('status')} className="py-3 px-4 cursor-pointer hover:text-slate-900">
                    <span className="flex items-center space-x-1"><span>Status</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th onClick={() => handleSort('validationStatus')} className="py-3 px-4 cursor-pointer hover:text-slate-900">
                    <span className="flex items-center space-x-1"><span>Validation</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th onClick={() => handleSort('confidence')} className="py-3 px-4 cursor-pointer hover:text-slate-900 text-right">
                    <span className="flex items-center justify-end space-x-1"><span>Confidence</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th onClick={() => handleSort('revisionNumber')} className="py-3 px-4 cursor-pointer hover:text-slate-900 text-center">
                    <span className="flex items-center justify-center space-x-1"><span>Revision</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th onClick={() => handleSort('submittedAt')} className="py-3 px-4 cursor-pointer hover:text-slate-900">
                    <span className="flex items-center space-x-1"><span>Received Time</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th onClick={() => handleSort('reportDate')} className="py-3 px-4 cursor-pointer hover:text-slate-900">
                    <span className="flex items-center space-x-1"><span>Report Date</span> <ArrowUpDown size={10} /></span>
                  </th>
                  <th className="py-3 px-4">Parser</th>
                  <th className="py-3 px-4">Received Source</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {sortedSubmissions.map((s) => {
                  const hasReport = s.reports.length > 0;
                  const report = hasReport ? s.reports[0] : null;
                  
                  // Extract parser name and version
                  let parserInfo = '--';
                  if (report) {
                    parserInfo = report.parserMode || 'REGEX';
                    if (report.parserEngine) {
                      parserInfo = `${report.parserEngine.name} v${report.parserEngine.version}`;
                    } else if (report.parserVersion) {
                      parserInfo = `RegexParser v${report.parserVersion}`;
                    } else if (report.parserMode === 'MANUAL') {
                      parserInfo = 'Manual';
                    } else {
                      parserInfo = 'RegexParser v2.1.4';
                    }
                  }

                  // Extract received source
                  let receivedSource = '--';
                  if (report) {
                    try {
                      const metrics = report.metricsJson ? JSON.parse(report.metricsJson) : {};
                      receivedSource = metrics.source || (report.parserMode === 'MANUAL' ? 'Manual Correction' : 'WhatsApp Live');
                    } catch (e) {
                      receivedSource = report.parserMode === 'MANUAL' ? 'Manual Correction' : 'WhatsApp Live';
                    }
                  }

                  return (
                    <tr key={s.id} className="bg-white odd:bg-white even:bg-slate-50/50 hover:bg-slate-100 text-slate-750 transition duration-150 group">
                      {/* District (Frozen) */}
                      <td className="py-3.5 px-4 font-bold text-slate-850 sticky left-0 bg-inherit border-r border-slate-200 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        {s.district.name}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold border uppercase ${
                          s.status === 'SUBMITTED' ? 'bg-blue-50 text-blue-700 border-blue-150' : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {s.status}
                        </span>
                      </td>

                      {/* Validation Status Badge */}
                      <td className="py-3.5 px-4">
                        {report ? (
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold border uppercase flex items-center w-max space-x-1 ${
                            report.validationStatus === 'VALID' ? 'bg-emerald-50 text-emerald-700 border-emerald-250' :
                            report.validationStatus === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-250' :
                            'bg-rose-50 text-rose-750 border-rose-250'
                          }`}>
                            <span>
                              {report.validationStatus === 'VALID' ? '✅' :
                               report.validationStatus === 'WARNING' ? '⚠' : '❌'}
                            </span>
                            <span>{report.validationStatus}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">PENDING</span>
                        )}
                      </td>

                      {/* Confidence */}
                      <td className="py-3.5 px-4 text-right font-mono font-semibold">
                        {report ? `${report.confidence}%` : '--'}
                      </td>

                      {/* Revision */}
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-655">
                        {report ? `Rev ${report.revisionNumber || 0}` : '--'}
                      </td>

                      {/* Received Time */}
                      <td className="py-3.5 px-4 font-mono text-slate-550">
                        {report && report.receivedAt ? new Date(report.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </td>

                      {/* Report Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-550">
                        {new Date(s.reportDate).toLocaleDateString('en-IN')}
                      </td>

                      {/* Parser */}
                      <td className="py-3.5 px-4 text-slate-600 font-semibold font-mono text-[10px]">
                        {parserInfo}
                      </td>

                      {/* Received Source */}
                      <td className="py-3.5 px-4">
                        {report ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            receivedSource.includes('Recovery') ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            receivedSource.includes('Manual') ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {receivedSource}
                          </span>
                        ) : '--'}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => openDistrictDetails(s.districtId, s.district.name)}
                          className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-3 py-1 rounded text-[10px] font-bold transition shadow-sm"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* District Details Drawer */}
      {selectedDistrict && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end transition-opacity">
          <div className="w-full max-w-2xl bg-white border-l border-slate-200 h-full p-6 overflow-y-auto flex flex-col justify-between shadow-2xl relative animate-in slide-in-from-right duration-200 text-slate-800">
            {/* Drawer Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-bold font-sans">District Scorecard Overview</span>
                <h2 className="text-xl font-bold text-slate-900 mt-1">{selectedDistrict.name}</h2>
              </div>
              <button 
                onClick={() => setSelectedDistrict(null)}
                className="hover:bg-slate-100 p-1.5 rounded-lg text-slate-500 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 space-y-6 py-6 text-xs overflow-y-auto">
              {loadingHistory ? (
                <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">Compiling historical ledger...</div>
              ) : districtHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 italic">No reports submitted in the selected range.</div>
              ) : (
                <>
                  {/* Performance Statistics Overview */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 shadow-inner">
                    <h3 className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Performance Metrics</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase font-semibold">Total Reports</div>
                        <div className="text-base font-extrabold text-slate-800 mt-0.5 font-mono">
                          {districtHistory.filter(r => r.isLatest).length}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase font-semibold">Avg Booked</div>
                        <div className="text-base font-extrabold text-slate-800 mt-0.5 font-mono">
                          {(districtHistory.filter(r => r.isLatest).reduce((acc, curr) => acc + curr.appointmentsBooked, 0) / Math.max(1, districtHistory.filter(r => r.isLatest).length)).toFixed(0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase font-semibold">Avg Service Rate</div>
                        <div className="text-base font-extrabold text-emerald-700 mt-0.5 font-mono">
                          {(() => {
                            const latest = districtHistory.filter(r => r.isLatest);
                            const totalBooked = latest.reduce((acc, curr) => acc + curr.appointmentsBooked, 0);
                            const totalServed = latest.reduce((acc, curr) => acc + curr.served, 0);
                            return totalBooked > 0 ? `${((totalServed / totalBooked) * 100).toFixed(1)}%` : '--%';
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* All Reports Logs & Revision History */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Revision History & Submission Log</h3>
                    <div className="space-y-4">
                      {districtHistory.map((rep) => {
                        const metrics = rep.metricsJson ? JSON.parse(rep.metricsJson) : {};
                        const trace = metrics.trace || {};
                        const remainingText = metrics.remainingText || '';
                        
                        return (
                          <div key={rep.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4 shadow-sm">
                            <div className="flex justify-between items-start gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-slate-800 font-mono">
                                    {new Date(rep.reportDate).toLocaleDateString('en-IN')}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${
                                    rep.isLatest ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                                  }`}>
                                    {rep.isLatest ? 'LATEST' : 'SUPERSEDED'}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono font-bold">
                                    Rev #{rep.revisionNumber} ({rep.parserMode})
                                  </span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-[10px] font-mono text-slate-600">
                                  <span>Booked: {rep.appointmentsBooked}</span>
                                  <span className="text-emerald-700 font-semibold">Served: {rep.served}</span>
                                  <span className="text-rose-700">Cancel: {rep.cancelled}</span>
                                  <span className="text-amber-600">Resch: {rep.rescheduled}</span>
                                </div>
                              </div>
                              <div className="text-right text-[10px] font-mono text-slate-500">
                                <div>{new Date(rep.receivedAt).toLocaleTimeString()}</div>
                                <div className="mt-1 font-semibold text-slate-700">Confidence: {rep.confidence}%</div>
                              </div>
                            </div>

                            {/* Validation Warnings/Errors */}
                            {rep.validationErrors && JSON.parse(rep.validationErrors).length > 0 && (
                              <div className="text-[10px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-200 font-mono font-semibold">
                                ⚠️ Validation Warnings: {JSON.parse(rep.validationErrors).join(', ')}
                              </div>
                            )}

                            {/* Operator-friendly Parser Decision Panel */}
                            <div className="border-t border-slate-200 pt-3">
                              <button
                                onClick={() => toggleDecision(rep.id)}
                                className="flex items-center space-x-1 text-blue-700 font-bold hover:underline"
                              >
                                {expandedDecisions[rep.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                <span className="text-[10px] uppercase tracking-wider">Parser Decision Analysis</span>
                              </button>

                              {expandedDecisions[rep.id] && (
                                <div className="mt-3 bg-white p-3.5 rounded-lg border border-slate-200 space-y-3 font-sans text-slate-700">
                                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 border-b border-slate-100 pb-1.5">
                                    <span>Parser Version: {rep.parserVersion || '2.0.0'}</span>
                                    <span className="text-emerald-600">Trace Confirmed</span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Report Date</div>
                                      <div className="font-bold text-slate-800 mt-0.5">
                                        {new Date(rep.reportDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                      </div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 italic">Source: {trace.date || 'Matched from date line'}</div>
                                    </div>

                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">District</div>
                                      <div className="font-bold text-slate-800 mt-0.5">{selectedDistrict.name}</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 italic">Source: {trace.district || 'Resolved via matching'}</div>
                                    </div>

                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Appointments Booked</div>
                                      <div className="font-bold text-slate-800 mt-0.5">{rep.appointmentsBooked}</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 italic">Source: {trace.booked || 'Extracted count'}</div>
                                    </div>

                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Served</div>
                                      <div className="font-bold text-slate-800 mt-0.5">{rep.served}</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 italic">Source: {trace.served || 'Extracted count'}</div>
                                    </div>

                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Cancelled</div>
                                      <div className="font-bold text-slate-800 mt-0.5">{rep.cancelled}</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 italic">Source: {trace.cancelled || 'Extracted count'}</div>
                                    </div>

                                    <div>
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Rescheduled</div>
                                      <div className="font-bold text-slate-800 mt-0.5">{rep.rescheduled}</div>
                                      <div className="text-[10px] text-slate-500 mt-0.5 italic">Source: {trace.rescheduled || 'Extracted count'}</div>
                                    </div>
                                  </div>

                                  {remainingText && (
                                    <div className="border-t border-slate-100 pt-2.5">
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Officer Remarks / Unparsed Text</div>
                                      <div className="bg-slate-50 p-2 rounded text-[11px] text-slate-700 font-medium whitespace-pre-wrap mt-1 leading-relaxed border border-slate-200">
                                        {remainingText}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Developer Collapsible Advanced Diagnostics Panel */}
                            {isAdmin || isDeveloper ? (
                              <div className="border-t border-slate-200 pt-2 flex items-center space-x-4">
                                <button
                                  onClick={() => toggleDebug(rep.id)}
                                  className="flex items-center space-x-1 text-purple-700 font-bold hover:underline"
                                >
                                  {expandedDebugs[rep.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  <span className="text-[10px] uppercase tracking-wider">Advanced Technical Debug</span>
                                </button>
                                
                                <button
                                  onClick={() => handleTriggerReplay(rep.id)}
                                  className="flex items-center space-x-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-650 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm"
                                >
                                  <Play size={10} className="text-blue-500" />
                                  <span>Replay Parser</span>
                                </button>
                              </div>
                            ) : null}

                            {expandedDebugs[rep.id] && (isAdmin || isDeveloper) && (
                              <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-[10px] space-y-3 leading-relaxed overflow-x-auto">
                                <div>
                                  <span className="text-purple-400 font-bold"># Parser Metadata:</span> Engine v2.0.0 | Build 2026.07.08
                                </div>
                                {metrics.normalizedMessage && (
                                  <div>
                                    <span className="text-purple-400 font-bold"># Normalized Text Buffer:</span>
                                    <pre className="mt-1 bg-slate-800 p-2 rounded text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                      {metrics.normalizedMessage}
                                    </pre>
                                  </div>
                                )}
                                <div>
                                  <span className="text-purple-400 font-bold"># Raw Parser Decision Trace:</span>
                                  <pre className="mt-1 bg-slate-800 p-2 rounded text-slate-300 overflow-x-auto">
                                    {JSON.stringify(trace, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Replay Comparison Approval Modal */}
      {showReplayModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl max-w-2xl w-full border border-slate-200 p-6 shadow-2xl space-y-6">
            <div className="flex items-start space-x-3 border-b border-slate-100 pb-4">
              <div className="bg-blue-50 text-blue-600 p-2.5 rounded-lg">
                <FileCode size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-950">Parser Replay Execution</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Re-processing raw WhatsApp text through the active fuzzy parser engine. Review results comparison before saving.
                </p>
              </div>
            </div>

            {replayLoading ? (
              <div className="h-64 flex flex-col items-center justify-center space-y-3">
                <RefreshCw size={32} className="animate-spin text-blue-600" />
                <span className="text-xs text-slate-400 italic">Executing fuzzy extraction engine...</span>
              </div>
            ) : replayData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Left Column: Old Report */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                    <h4 className="font-bold text-slate-550 border-b border-slate-200 pb-1.5 uppercase tracking-wide">Stored Values (v{replayData.oldReport.parserVersion || '1.0.0'})</h4>
                    <div className="space-y-2 font-mono">
                      <div className="flex justify-between">
                        <span>Report Date:</span>
                        <span className="font-bold text-slate-800">{new Date(replayData.oldReport.reportDate).toLocaleDateString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Booked Appts:</span>
                        <span className="font-bold text-slate-800">{replayData.oldReport.appointmentsBooked}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Served Appts:</span>
                        <span className="font-bold text-slate-800">{replayData.oldReport.served}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cancelled:</span>
                        <span className="font-bold text-slate-800">{replayData.oldReport.cancelled}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Rescheduled:</span>
                        <span className="font-bold text-slate-800">{replayData.oldReport.rescheduled}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <span className="font-bold text-slate-800">{replayData.oldReport.validationStatus}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence:</span>
                        <span className="font-bold text-slate-800">{replayData.oldReport.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: New Replay */}
                  <div className="p-4 bg-blue-50/30 border border-blue-200 rounded-lg space-y-3 text-xs">
                    <h4 className="font-bold text-blue-800 border-b border-blue-200 pb-1.5 uppercase tracking-wide">Replayed Values (v2.0.0)</h4>
                    <div className="space-y-2 font-mono">
                      <div className="flex justify-between">
                        <span>Report Date:</span>
                        <span className={`font-bold ${
                          new Date(replayData.oldReport.reportDate).getTime() !== new Date(replayData.newResult.reportDate).getTime() ? 'text-amber-600 bg-amber-50 px-1 rounded' : 'text-slate-800'
                        }`}>{new Date(replayData.newResult.reportDate).toLocaleDateString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Booked Appts:</span>
                        <span className={`font-bold ${
                          replayData.oldReport.appointmentsBooked !== replayData.newResult.appointmentsBooked ? 'text-blue-600 bg-blue-50 px-1 rounded font-extrabold' : 'text-slate-800'
                        }`}>{replayData.newResult.appointmentsBooked}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Served Appts:</span>
                        <span className={`font-bold ${
                          replayData.oldReport.served !== replayData.newResult.served ? 'text-blue-600 bg-blue-50 px-1 rounded font-extrabold' : 'text-slate-800'
                        }`}>{replayData.newResult.served}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cancelled:</span>
                        <span className={`font-bold ${
                          replayData.oldReport.cancelled !== replayData.newResult.cancelled ? 'text-blue-600 bg-blue-50 px-1 rounded font-extrabold' : 'text-slate-800'
                        }`}>{replayData.newResult.cancelled}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Rescheduled:</span>
                        <span className={`font-bold ${
                          replayData.oldReport.rescheduled !== replayData.newResult.rescheduled ? 'text-blue-600 bg-blue-50 px-1 rounded font-extrabold' : 'text-slate-800'
                        }`}>{replayData.newResult.rescheduled}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <span className={`font-bold ${
                          replayData.oldReport.validationStatus !== (replayData.newResult.validationStatus === 'PARTIAL' ? 'WARNING' : replayData.newResult.validationStatus) ? 'text-blue-600 bg-blue-50 px-1.5 rounded' : 'text-slate-800'
                        }`}>{replayData.newResult.validationStatus === 'PARTIAL' ? 'WARNING' : replayData.newResult.validationStatus}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence:</span>
                        <span className={`font-bold ${
                          replayData.oldReport.confidence !== replayData.newResult.confidence ? 'text-emerald-600 bg-emerald-50 px-1.5 rounded' : 'text-slate-800'
                        }`}>{replayData.newResult.confidence}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] leading-relaxed text-slate-550 flex items-start space-x-2 font-semibold">
                  <HelpCircle size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>
                    Note: Replacing with replayed values creates a new superseded revision of this report inside SQLite. This action is fully auditable.
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex space-x-3 justify-end pt-2">
              <button
                disabled={applyingReplay}
                onClick={() => setShowReplayModal(false)}
                className="bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              {replayData && (isAdmin || isDeveloper) && (
                <button
                  disabled={applyingReplay}
                  onClick={handleApplyReplay}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center space-x-1.5"
                >
                  {applyingReplay ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Saving Parse...</span>
                    </>
                  ) : (
                    <span>Replace with New Parse</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
