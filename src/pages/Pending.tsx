import { useEffect, useState } from 'react';
import { RefreshCw, Calendar, AlertTriangle, Copy, Check } from 'lucide-react';

interface DistrictItem {
  id: string;
  name: string;
  code: string;
}

interface SubmissionRow {
  districtId: string;
  status: string;
}

export default function PendingPage() {
  const [reportDate, setReportDate] = useState('');
  const [hasData, setHasData] = useState(false);
  const [districts, setDistricts] = useState<DistrictItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Fetch districts once
    window.api.getDistricts()
      .then(data => setDistricts(data))
      .catch(err => console.error('Failed to load districts:', err));

    // Fetch latest report date on mount
    window.api.getLatestReportDate()
      .then((latestDate) => {
        if (latestDate) {
          setReportDate(latestDate);
          setHasData(true);
        } else {
          setReportDate('');
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
      loadPendingSubmissions();
    }

    // Reload when messages are captured
    const unsubscribe = window.api.onMessageCaptured(() => {
      if (hasData) loadPendingSubmissions();
    });

    return () => unsubscribe();
  }, [hasData, reportDate]);

  const loadPendingSubmissions = () => {
    setLoading(true);
    setError('');
    window.api.getSubmissionsForRange(reportDate, reportDate)
      .then((data) => {
        setSubmissions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load submissions range:', err);
        setError('Database Error: Failed to retrieve submissions status.');
        setLoading(false);
      });
  };

  // Compile list of pending districts
  const submittedIds = new Set(
    submissions
      .filter(s => s.status === 'SUBMITTED')
      .map(s => s.districtId)
  );

  const pendingDistricts = districts.filter(d => !submittedIds.has(d.id));

  // Generate reminder text template
  const generateReminderText = () => {
    if (pendingDistricts.length === 0) return '';
    const bullets = pendingDistricts.map(d => `• ${d.name}`).join('\n');
    const formattedDate = reportDate ? reportDate.split('-').reverse().join('-') : '';
    const dateText = formattedDate ? `the DSD Performance Report of ${formattedDate}` : "today's DSD Performance Report";
    return `*Reminder*\n\nThe following districts have not submitted ${dateText}:\n\n${bullets}\n\nKindly submit the report at the earliest.`;
  };

  const handleCopyReminder = () => {
    const text = generateReminderText();
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => console.error('Failed to copy text:', err));
  };  return (
    <div className="p-6 space-y-6 flex flex-col h-full bg-slate-50 text-slate-805">
      {/* Header and Report Date Selector */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-white p-4 border border-slate-200 shadow-sm rounded-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pending Districts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Identify districts that have not reported today and compile alert reminders.</p>
        </div>

        <div className="flex items-center space-x-3 text-xs bg-slate-50 p-2 border border-slate-200 rounded-lg">
          <Calendar size={13} className="text-blue-600" />
          <div className="flex items-center space-x-2">
            <span className="text-[9px] text-slate-500 uppercase font-semibold">Report Date:</span>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="bg-white border border-slate-350 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-blue-500 font-mono font-semibold"
            />
          </div>
          <button 
            onClick={loadPendingSubmissions}
            className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-650 p-1.5 rounded transition shadow-sm"
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

      {/* Main Grid: Pending List vs Reminder Generator */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl h-64 animate-pulse flex items-center justify-center text-slate-550 text-xs shadow-sm">
          Compiling pending district roster...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {/* Left Panel: List of Pending Districts */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center">
              <AlertTriangle size={14} className="mr-1.5 text-amber-600" />
              Districts Pending ({pendingDistricts.length})
            </h3>

            {pendingDistricts.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-emerald-650 font-bold">
                ✔ No districts pending. Roster is fully complete for this date!
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[450px] space-y-2 pr-1">
                {pendingDistricts.map((d) => (
                  <div key={d.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 text-xs">{d.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">Code: {d.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel: Reminder Generator */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-sm">
            <div className="space-y-4 flex-1 flex flex-col">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center">
                <Copy size={14} className="mr-1.5 text-blue-600" />
                WhatsApp Reminder Generator
              </h3>

              {pendingDistricts.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-450 italic text-center p-6">
                  No reminders to generate since all submissions are complete.
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-2">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Copyable WhatsApp Format</span>
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-xs text-slate-700 leading-relaxed whitespace-pre-wrap select-text max-h-[350px] overflow-y-auto shadow-inner">
                    {generateReminderText()}
                  </div>
                </div>
              )}
            </div>

            {pendingDistricts.length > 0 && (
              <button
                onClick={handleCopyReminder}
                disabled={copied}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-emerald-600 text-white font-semibold text-xs py-2.5 rounded-lg flex items-center justify-center space-x-2 transition shadow-sm"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy Reminder to Clipboard</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
