import { useEffect, useState } from 'react';
import { ShieldAlert, Check, RefreshCw, AlertCircle, FileText, ChevronRight } from 'lucide-react';

interface ManualReviewReport {
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
}

export default function ManualReviewPage() {
  const [reports, setReports] = useState<ManualReviewReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ManualReviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit fields
  const [booked, setBooked] = useState(0);
  const [served, setServed] = useState(0);
  const [cancelled, setCancelled] = useState(0);
  const [rescheduled, setRescheduled] = useState(0);
  const [correctedDate, setCorrectedDate] = useState('');

  useEffect(() => {
    loadManualReviewReports();

    // Reload when messages are captured
    const unsubscribe = window.api.onMessageCaptured(() => {
      loadManualReviewReports();
    });

    return () => unsubscribe();
  }, []);

  const loadManualReviewReports = () => {
    window.api
      .getManualReviewReports()
      .then((data) => {
        setReports(data);
        if (data.length > 0) {
          selectReport(data[0]);
        } else {
          setSelectedReport(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load manual reviews:', err);
        setError('Database Error: Failed to retrieve manual review queue.');
        setLoading(false);
      });
  };

  const selectReport = (report: ManualReviewReport) => {
    setSelectedReport(report);
    setBooked(report.appointmentsBooked);
    setServed(report.served);
    setCancelled(report.cancelled);
    setRescheduled(report.rescheduled);
    
    // Default to report date split, but if it starts with 1970 sentinel, default to empty
    const rDate = report.submission.reportDate;
    if (rDate) {
      const dateStr = typeof rDate === 'string' ? rDate : (rDate as Date).toISOString();
      if (!dateStr.startsWith('1970-01-01')) {
        setCorrectedDate(dateStr.split('T')[0]);
      } else {
        setCorrectedDate('');
      }
    } else {
      setCorrectedDate('');
    }
    setSaveSuccess(false);
  };

  const parseErrors = (jsonErrors: string | null): string[] => {
    if (!jsonErrors) return [];
    try {
      return JSON.parse(jsonErrors);
    } catch (e) {
      return [jsonErrors];
    }
  };

  const handleSaveCorrection = async () => {
    if (!selectedReport) return;
    if (!correctedDate) {
      setError('Please select a valid report date before approving this report.');
      return;
    }
    setSaveLoading(true);
    setError('');
    setSaveSuccess(false);

    try {
      await window.api.saveManualCorrection(selectedReport.id, {
        appointmentsBooked: booked,
        served,
        cancelled,
        rescheduled,
        reportDate: correctedDate,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        loadManualReviewReports();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError(`Failed to save manual corrections: ${err.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const formatReportDate = (dateVal: any) => {
    if (!dateVal) return 'Missing Report Date';
    const dateStr = typeof dateVal === 'string' ? dateVal : (dateVal as Date).toISOString();
    if (dateStr.startsWith('1970-01-01')) {
      return 'Missing Report Date';
    }
    try {
      return new Date(dateStr).toLocaleDateString('en-IN');
    } catch (e) {
      return String(dateVal);
    }
  };

  return (
    <div className="p-6 space-y-6 flex flex-col h-full bg-slate-50 text-slate-800">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Manual Review Queue</h1>
        <p className="text-xs text-slate-500 mt-1">Audit and correct reports that failed business validation math or confidence thresholds.</p>
      </div>

      {error && (
        <div className="bg-red-55/40 border border-red-200 p-4 rounded-lg text-xs text-red-700 font-mono">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl h-64 animate-pulse flex items-center justify-center text-slate-450 text-xs shadow-sm">
          Loading manual review reports...
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-2 shadow-sm">
          <Check size={32} className="text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-700">Queue is Clear!</h3>
          <p className="text-xs text-slate-500 max-w-xs">
            All ingested WhatsApp reports match validation math rules and have been verified successfully.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[500px]">
          {/* Left Column: Report List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
            <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Failed Submissions ({reports.length})</span>
              <button 
                onClick={loadManualReviewReports}
                className="hover:bg-slate-200 p-1.5 rounded text-slate-600 transition"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            
            <div className="divide-y divide-slate-200 overflow-y-auto flex-1 max-h-[600px]">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectReport(r)}
                  className={`w-full text-left p-3.5 flex justify-between items-center transition ${
                    selectedReport?.id === r.id ? 'bg-blue-50/70 border-l-4 border-blue-500 font-bold shadow-inner' : 'hover:bg-slate-50/50'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-slate-800">{r.submission.district.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Date: {formatReportDate(r.submission.reportDate)}
                    </div>
                    <div className="text-[9px] text-rose-600 font-semibold mt-1 truncate">
                      {parseErrors(r.validationErrors)[0] || 'Verification failed'}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Right Columns: Review Panel (Raw Msg vs Metrics Inputs) */}
          {selectedReport && (
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                {/* Left Side: Raw Message view */}
                <div className="space-y-4 flex flex-col">
                  <div className="flex items-center space-x-1.5 border-b border-slate-200 pb-2">
                    <FileText size={14} className="text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Raw Message Contents</h3>
                  </div>
                  
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-slate-700 leading-relaxed overflow-y-auto whitespace-pre-wrap select-text max-h-[400px] shadow-inner">
                    {selectedReport.message ? selectedReport.message.message : 'No message body available.'}
                  </div>
                </div>

                {/* Right Side: Edit Parsed Metrics */}
                <div className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                      <div className="flex items-center space-x-1.5">
                        <ShieldAlert size={14} className="text-rose-600" />
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Parsed Metrics</h3>
                      </div>
                      <span className="text-[10px] font-mono bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200 font-bold">
                        Confidence: {selectedReport.confidence}%
                      </span>
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Correct Report Date</label>
                        <input
                          type="date"
                          value={correctedDate}
                          onChange={(e) => setCorrectedDate(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono mt-1 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Booked</label>
                        <input
                          type="number"
                          value={booked}
                          onChange={(e) => setBooked(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono mt-1 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Served</label>
                        <input
                          type="number"
                          value={served}
                          onChange={(e) => setServed(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono mt-1 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Cancelled</label>
                        <input
                          type="number"
                          value={cancelled}
                          onChange={(e) => setCancelled(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono mt-1 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Rescheduled</label>
                        <input
                          type="number"
                          value={rescheduled}
                          onChange={(e) => setRescheduled(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono mt-1 font-semibold"
                        />
                      </div>
                    </div>

                    {/* Parser Mode Info */}
                    <div className="text-[10px] text-slate-500 font-mono flex justify-between pt-2">
                      <span>Parser Mode: {selectedReport.parserMode}</span>
                      <span>Revision: #{selectedReport.revisionNumber}</span>
                    </div>

                    {/* Validation Error list */}
                    <div className="space-y-1.5 mt-2 bg-rose-50 border border-rose-200 p-3 rounded-lg">
                      <div className="text-[9px] font-bold text-rose-700 uppercase tracking-wide flex items-center">
                        <AlertCircle size={10} className="mr-1" /> Validation Warnings
                      </div>
                      <ul className="list-disc pl-3 text-[10px] text-rose-750 space-y-1 leading-relaxed mt-1.5">
                        {parseErrors(selectedReport.validationErrors).map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end space-x-3 border-t border-slate-200 pt-4">
                    {saveSuccess && (
                      <span className="text-emerald-700 text-xs font-bold font-mono animate-pulse mr-2">
                        ✔ Status updated successfully!
                      </span>
                    )}
                    <button
                      onClick={handleSaveCorrection}
                      disabled={saveLoading}
                      className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center space-x-1.5 transition shadow-sm"
                    >
                      <Check size={14} />
                      <span>Mark as Reviewed (Approve As-Is)</span>
                    </button>
                    <button
                      onClick={handleSaveCorrection}
                      disabled={saveLoading}
                      className="bg-emerald-650 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-lg flex items-center space-x-1.5 transition shadow-sm"
                    >
                      <Check size={14} />
                      <span>{saveLoading ? 'Saving...' : 'Approve and Save'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
