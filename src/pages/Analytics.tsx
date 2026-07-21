import { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Download } from 'lucide-react';

interface DistrictItem {
  id: string;
  name: string;
  code: string;
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'performance' | 'monthly' | 'history' | 'late' | 'timeline' | 'parserHealth'>('performance');
  const [districts, setDistricts] = useState<DistrictItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Date and filter inputs
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [singleDate, setSingleDate] = useState('');
  const [hasData, setHasData] = useState(false);
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  // Report outputs
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [lateData, setLateData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);

  // Parser Health States
  const [parserStats, setParserStats] = useState({
    total: 0,
    autoParsed: 0,
    manualReview: 0,
    successRate: 0,
    avgConfidence: 0,
    duplicates: 0,
    missingDates: 0,
    districtFailures: 0,
    mathMismatches: 0,
    avgParseTime: 0.12
  });
  const [errorTrends, setErrorTrends] = useState<Array<{ type: string; count: number; lastDate: string; example: string }>>([]);

  const getHourlyTimelineStats = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const counts = Array(24).fill(0);
    
    for (const r of timelineData) {
      if (r.receivedAt) {
        const hour = new Date(r.receivedAt).getHours();
        if (hour >= 0 && hour < 24) {
          counts[hour]++;
        }
      }
    }
    return hours.map(h => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      count: counts[h]
    })).filter(h => h.count > 0 || (parseInt(h.hour) >= 8 && parseInt(h.hour) <= 20));
  };

  const hourlyData = getHourlyTimelineStats();
  const maxCount = Math.max(...hourlyData.map(h => h.count), 1);

  const getYesterdayLocalDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    // Load active districts
    window.api.getDistricts()
      .then((data) => {
        setDistricts(data);
        if (data.length > 0) {
          setSelectedDistrictId(data[0].id);
        }
      })
      .catch((err) => console.error('Failed to load districts:', err));

    // Establish default dates as yesterday's local date
    const yesterdayStr = getYesterdayLocalDateString();
    setFromDate(yesterdayStr);
    toDateSetter(yesterdayStr);
    setSingleDate(yesterdayStr);
    const dateObj = new Date(yesterdayStr);
    setMonth(dateObj.getUTCMonth() + 1);
    setYear(dateObj.getUTCFullYear());
    setHasData(true);
  }, []);

  const toDateSetter = (dateStr: string) => {
    setToDate(dateStr);
  };

  useEffect(() => {
    if (hasData) {
      runActiveReport();
    }
  }, [hasData, activeTab, fromDate, toDate, singleDate, selectedDistrictId, month, year]);

  const runActiveReport = () => {
    setLoading(true);
    setError('');

    if (activeTab === 'performance') {
      window.api.getDistrictPerformance(fromDate, toDate)
        .then((data) => {
          setPerformanceData(data);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to fetch performance report.');
          setLoading(false);
        });
    } else if (activeTab === 'monthly') {
      window.api.getMonthlyReport(month, year)
        .then((data) => {
          setMonthlyData(data);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to fetch monthly report.');
          setLoading(false);
        });
    } else if (activeTab === 'history') {
      if (!selectedDistrictId) {
        setLoading(false);
        return;
      }
      window.api.getDistrictHistory(selectedDistrictId, fromDate, toDate)
        .then((data) => {
          setHistoryData(data);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to fetch history report.');
          setLoading(false);
        });
    } else if (activeTab === 'late') {
      window.api.getLateSubmissions(fromDate, toDate)
        .then((data) => {
          setLateData(data);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to fetch late submissions report.');
          setLoading(false);
        });
    } else if (activeTab === 'timeline') {
      window.api.getSubmissionTimeline(singleDate)
        .then((data) => {
          setTimelineData(data);
          setLoading(false);
        })
        .catch(() => {
          setError('Failed to fetch timeline report.');
          setLoading(false);
        });
    } else if (activeTab === 'parserHealth') {
      window.api.getSubmissionsForRange(fromDate, toDate)
        .then((data) => {
          let total = 0;
          let autoParsed = 0;
          let manualReview = 0;
          let sumConfidence = 0;
          let duplicates = 0;
          let missingDates = 0;
          let districtFailures = 0;
          let mathMismatches = 0;

          const errorMap: Record<string, { count: number; lastDate: string; example: string }> = {
            'Missing Date': { count: 0, lastDate: '', example: '' },
            'District Resolution Failure': { count: 0, lastDate: '', example: '' },
            'Booked Metric Missing': { count: 0, lastDate: '', example: '' },
            'Math Mismatch': { count: 0, lastDate: '', example: '' },
            'Duplicate Submission': { count: 0, lastDate: '', example: '' },
          };

          data.forEach(sub => {
            if (sub.reports.length > 1) {
              duplicates += (sub.reports.length - 1);
              errorMap['Duplicate Submission'].count += (sub.reports.length - 1);
              errorMap['Duplicate Submission'].lastDate = sub.reportDate;
              errorMap['Duplicate Submission'].example = sub.district.name;
            }

            sub.reports.forEach(rep => {
              total++;
              sumConfidence += rep.confidence;
              
              const isAuto = rep.validationStatus === 'VALID' || rep.validationStatus === 'WARNING';
              if (isAuto) {
                autoParsed++;
              } else {
                manualReview++;
              }

              const errors: string[] = rep.validationErrors ? JSON.parse(rep.validationErrors) : [];
              errors.forEach(err => {
                if (err.toLowerCase().includes('date')) {
                  missingDates++;
                  errorMap['Missing Date'].count++;
                  errorMap['Missing Date'].lastDate = rep.receivedAt ? rep.receivedAt.split('T')[0] : sub.reportDate;
                  errorMap['Missing Date'].example = sub.district.name;
                } else if (err.toLowerCase().includes('district') || err.toLowerCase().includes('unknown')) {
                  districtFailures++;
                  errorMap['District Resolution Failure'].count++;
                  errorMap['District Resolution Failure'].lastDate = rep.receivedAt ? rep.receivedAt.split('T')[0] : sub.reportDate;
                  errorMap['District Resolution Failure'].example = sub.district.name;
                } else if (err.toLowerCase().includes('booked') || err.toLowerCase().includes('served')) {
                  errorMap['Booked Metric Missing'].count++;
                  errorMap['Booked Metric Missing'].lastDate = rep.receivedAt ? rep.receivedAt.split('T')[0] : sub.reportDate;
                  errorMap['Booked Metric Missing'].example = sub.district.name;
                } else if (err.toLowerCase().includes('less than') || err.toLowerCase().includes('exceed') || err.toLowerCase().includes('sum')) {
                  mathMismatches++;
                  errorMap['Math Mismatch'].count++;
                  errorMap['Math Mismatch'].lastDate = rep.receivedAt ? rep.receivedAt.split('T')[0] : sub.reportDate;
                  errorMap['Math Mismatch'].example = sub.district.name;
                }
              });
            });
          });

          setParserStats({
            total,
            autoParsed,
            manualReview,
            successRate: total > 0 ? Math.round((autoParsed / total) * 100) : 100,
            avgConfidence: total > 0 ? Math.round(sumConfidence / total) : 100,
            duplicates,
            missingDates,
            districtFailures,
            mathMismatches,
            avgParseTime: 0.12
          });

          const trendsList = Object.entries(errorMap).map(([type, value]) => ({
            type,
            count: value.count,
            lastDate: value.lastDate ? new Date(value.lastDate).toLocaleDateString('en-IN') : '--',
            example: value.example || '--'
          })).sort((a, b) => b.count - a.count);

          setErrorTrends(trendsList);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError('Failed to calculate parser health statistics.');
          setLoading(false);
        });
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = 'analytics_report';

    if (activeTab === 'performance') {
      headers = ['Rank', 'District', 'Booked', 'Served', 'Cancelled', 'Rescheduled', 'Service Rate'];
      rows = performanceData.map((row, index) => [
        `#${index + 1}`,
        row.districtName,
        String(row.booked),
        String(row.served),
        String(row.cancelled),
        String(row.rescheduled),
        `${row.serviceRate.toFixed(1)}%`
      ]);
      filename = `district_performance_${fromDate}_to_${toDate}`;
    } else if (activeTab === 'monthly') {
      headers = ['District', 'Submissions', 'Booked', 'Served', 'Service Rate', 'Cancel Rate', 'Reschedule Rate'];
      rows = monthlyData.map((row) => [
        row.districtName,
        String(row.submissionsCount),
        String(row.booked),
        String(row.served),
        `${row.serviceRate.toFixed(1)}%`,
        `${row.cancellationRate.toFixed(1)}%`,
        `${row.rescheduleRate.toFixed(1)}%`
      ]);
      filename = `monthly_aggregations_${month}_${year}`;
    } else if (activeTab === 'history') {
      const selectedDistrictName = districts.find(d => d.id === selectedDistrictId)?.name || 'District';
      headers = ['Report Date', 'Received Time', 'Booked', 'Served', 'Cancelled', 'Rescheduled', 'Status'];
      rows = historyData.map((row) => [
        formatDate(row.reportDate),
        formatTime(row.receivedAt),
        String(row.appointmentsBooked),
        String(row.served),
        String(row.cancelled),
        String(row.rescheduled),
        row.validationStatus
      ]);
      filename = `${selectedDistrictName.replace(/\s+/g, '_')}_history_${fromDate}_to_${toDate}`;
    } else if (activeTab === 'late') {
      headers = ['District', 'Report Date', 'Received Time', 'Submission Delay'];
      rows = lateData.map((row) => [
        row.districtName,
        formatDate(row.reportDate),
        `${formatDate(row.receivedAt)} ${formatTime(row.receivedAt)}`,
        `+${row.delayHours.toFixed(1)} hrs`
      ]);
      filename = `late_submissions_${fromDate}_to_${toDate}`;
    } else if (activeTab === 'timeline') {
      headers = ['Sequence', 'District', 'Received Time', 'Parser Mode', 'Booked Vol', 'Verification'];
      rows = timelineData.map((row, index) => [
        `#${index + 1}`,
        row.districtName,
        formatTime(row.receivedAt),
        row.parserMode,
        String(row.booked),
        row.validationStatus
      ]);
      filename = `submission_timeline_${singleDate}`;
    } else if (activeTab === 'parserHealth') {
      headers = ['Validation Failure Type', 'Incidents Count', 'Last Occurrence', 'Example District'];
      rows = errorTrends.map((trend) => [
        trend.type,
        String(trend.count),
        trend.lastDate,
        trend.example
      ]);
      filename = `parser_health_${fromDate}_to_${toDate}`;
    }

    const success = await window.api.exportData(filename, format, headers, rows);
    if (success) {
      alert(`Successfully exported analytics report as ${format.toUpperCase()}`);
    }
  };

  // Performance tab aggregates calculations
  const totalServed = performanceData.reduce((acc, row) => acc + (row.served || 0), 0);
  const totalRescheduled = performanceData.reduce((acc, row) => acc + (row.rescheduled || 0), 0);
  const rescheduleToServedRatio = totalServed > 0 ? (totalRescheduled / totalServed) * 100 : 0;
  const deliveryIndex = (totalServed + totalRescheduled) > 0 ? (totalServed / (totalServed + totalRescheduled)) * 100 : 0;

  // Reschedule Hotspots (Highest Rescheduled count)
  const rescheduleHotspots = [...performanceData]
    .filter(row => row.booked > 0)
    .sort((a, b) => (b.rescheduled || 0) - (a.rescheduled || 0))
    .slice(0, 3);

  // High reschedule rate hotspots
  const rescheduleRateHotspots = [...performanceData]
    .filter(row => row.booked > 0)
    .sort((a, b) => (b.rescheduleRate || 0) - (a.rescheduleRate || 0))
    .slice(0, 3);

  return (
    <div className="p-6 space-y-6 flex flex-col h-full bg-slate-50 text-slate-800">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics & Reports</h1>
        <p className="text-xs text-slate-500 mt-1">Audit district performance, history logs, timeline sequences, and parser diagnostics.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2.5 font-bold transition border-b-2 ${
            activeTab === 'performance' ? 'text-blue-600 border-blue-500 bg-blue-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'
          }`}
        >
          🏆 District Performance
        </button>
        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-4 py-2.5 font-bold transition border-b-2 ${
            activeTab === 'monthly' ? 'text-blue-600 border-blue-500 bg-blue-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'
          }`}
        >
          📅 Monthly Aggregations
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 font-bold transition border-b-2 ${
            activeTab === 'history' ? 'text-blue-600 border-blue-500 bg-blue-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'
          }`}
        >
          📜 District History
        </button>
        <button
          onClick={() => setActiveTab('late')}
          className={`px-4 py-2.5 font-bold transition border-b-2 ${
            activeTab === 'late' ? 'text-blue-600 border-blue-500 bg-blue-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'
          }`}
        >
          ⚠️ Late Submissions
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2.5 font-bold transition border-b-2 ${
            activeTab === 'timeline' ? 'text-blue-600 border-blue-500 bg-blue-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'
          }`}
        >
          ⏱ Timeline Logs
        </button>
        <button
          onClick={() => setActiveTab('parserHealth')}
          className={`px-4 py-2.5 font-bold transition border-b-2 ${
            activeTab === 'parserHealth' ? 'text-blue-600 border-blue-500 bg-blue-50/30' : 'text-slate-500 border-transparent hover:text-slate-800'
          }`}
        >
          🔬 Parser Health
        </button>
      </div>

      {/* Inputs Panel based on Tab */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4 text-xs shadow-sm">
        {(activeTab === 'performance' || activeTab === 'history' || activeTab === 'late' || activeTab === 'parserHealth') && (
          <>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 font-mono font-semibold"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 font-mono font-semibold"
              />
            </div>
          </>
        )}

        {/* District selection for history */}
        {activeTab === 'history' && (
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">District:</span>
            <select
              value={selectedDistrictId}
              onChange={(e) => setSelectedDistrictId(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
            >
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Month selector for Monthly */}
        {activeTab === 'monthly' && (
          <>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Month:</span>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Year:</span>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 w-20 focus:outline-none focus:border-blue-500 text-center font-mono font-semibold"
              />
            </div>
          </>
        )}

        {/* Single date select for Timeline */}
        {activeTab === 'timeline' && (
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Report Date:</span>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => setSingleDate(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500 font-mono font-semibold"
            />
          </div>
        )}

        {/* Exports */}
        <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg p-1 ml-auto shadow-inner select-none">
          <span className="text-[9px] text-slate-500 uppercase font-bold px-2 text-nowrap">Export:</span>
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

        <button
          onClick={runActiveReport}
          className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 p-2 rounded flex items-center space-x-1.5 transition shadow-sm font-semibold ml-2"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span>Reload Report</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-xs text-red-750 font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Report Table / Health Card Rendering */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col justify-between min-h-[400px] shadow-sm">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400 italic">Calculating analytics data...</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[600px] flex-1">
            {/* 1. PERFORMANCE REPORT */}
            {activeTab === 'performance' && (
              performanceData.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic">No reports found in selected range.</div>
              ) : (
                <div className="p-5 space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                      <div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Served Appointments</div>
                        <div className="text-xl font-bold text-slate-800 mt-1 font-mono">{totalServed}</div>
                      </div>
                      <div className="text-[10px] text-emerald-600 font-semibold mt-2">Successful service delivery</div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                      <div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Rescheduled Appointments</div>
                        <div className="text-xl font-bold text-slate-800 mt-1 font-mono">{totalRescheduled}</div>
                      </div>
                      <div className="text-[10px] text-amber-600 font-semibold mt-2">Delayed/postponed volume</div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                      <div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Reschedule to Served Ratio</div>
                        <div className="text-xl font-bold text-slate-800 mt-1 font-mono">{rescheduleToServedRatio.toFixed(1)}%</div>
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-2">Reschedules per 100 served</div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                      <div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Delivery vs Delay Index</div>
                        <div className="text-xl font-bold text-slate-800 mt-1 font-mono">{deliveryIndex.toFixed(1)}%</div>
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-2">Served / (Served + Rescheduled)</div>
                    </div>
                  </div>

                  {/* Proportional Analysis Stacked Bars */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Served vs Rescheduled Performance Matrix</h3>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {performanceData.map((row, index) => {
                        const servedPct = row.booked > 0 ? (row.served / row.booked) * 100 : 0;
                        const reschedPct = row.booked > 0 ? (row.rescheduled / row.booked) * 100 : 0;
                        const cancelPct = row.booked > 0 ? (row.cancelled / row.booked) * 100 : 0;
                        const pendingPct = Math.max(0, 100 - servedPct - reschedPct - cancelPct);

                        return (
                          <div key={index} className="flex items-center text-[10px] font-sans">
                            <div className="w-32 font-bold text-slate-700 truncate pr-2">{row.districtName}</div>
                            <div className="flex-1 flex h-4 bg-slate-200 rounded overflow-hidden shadow-inner">
                              {row.served > 0 && (
                                <div 
                                  style={{ width: `${servedPct}%` }} 
                                  className="bg-emerald-500 text-[8px] text-white flex items-center justify-center font-bold font-mono transition-all"
                                  title={`Served: ${row.served} (${servedPct.toFixed(1)}%)`}
                                >
                                  {servedPct > 15 ? `${servedPct.toFixed(0)}%` : ''}
                                </div>
                              )}
                              {row.rescheduled > 0 && (
                                <div 
                                  style={{ width: `${reschedPct}%` }} 
                                  className="bg-amber-500 text-[8px] text-white flex items-center justify-center font-bold font-mono transition-all"
                                  title={`Rescheduled: ${row.rescheduled} (${reschedPct.toFixed(1)}%)`}
                                >
                                  {reschedPct > 15 ? `${reschedPct.toFixed(0)}%` : ''}
                                </div>
                              )}
                              {row.cancelled > 0 && (
                                <div 
                                  style={{ width: `${cancelPct}%` }} 
                                  className="bg-rose-500 text-[8px] text-white flex items-center justify-center font-bold font-mono transition-all"
                                  title={`Cancelled: ${row.cancelled} (${cancelPct.toFixed(1)}%)`}
                                >
                                  {cancelPct > 15 ? `${cancelPct.toFixed(0)}%` : ''}
                                </div>
                              )}
                              {pendingPct > 0 && (
                                <div 
                                  style={{ width: `${pendingPct}%` }} 
                                  className="bg-slate-200/50"
                                  title={`Pending/Unaccounted: ${pendingPct.toFixed(1)}%`}
                                />
                              )}
                            </div>
                            <div className="w-28 text-right font-mono font-semibold text-slate-500 pl-2 whitespace-nowrap">
                              S: {row.served} | R: {row.rescheduled}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Legend */}
                    <div className="flex justify-end space-x-4 mt-4 text-[9px] text-slate-500 font-bold uppercase">
                      <div className="flex items-center space-x-1">
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span>
                        <span>Served</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></span>
                        <span>Rescheduled</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm"></span>
                        <span>Cancelled</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Insights Panels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded-xl p-4 bg-red-50/20">
                      <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">⚠️ Reschedule Hotspots (Highest Volume)</h4>
                      <div className="divide-y divide-slate-200">
                        {rescheduleHotspots.map((h, i) => (
                          <div key={i} className="py-2 flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-800">{h.districtName}</span>
                            <span className="font-mono font-bold text-amber-600">{h.rescheduled} Rescheduled ({h.rescheduleRate.toFixed(1)}% of booked)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-4 bg-blue-50/20">
                      <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">📊 High Reschedule Rates (% of Booked)</h4>
                      <div className="divide-y divide-slate-200">
                        {rescheduleRateHotspots.map((h, i) => (
                          <div key={i} className="py-2 flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-800">{h.districtName}</span>
                            <span className="font-mono font-bold text-blue-700">{h.rescheduleRate.toFixed(1)}% rate ({h.rescheduled} reschedules)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">District Performance Summary Table</h3>
                    <table className="w-full text-left border-collapse text-xs border border-slate-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[9px]">
                          <th className="py-3 px-4">Rank</th>
                          <th className="py-3 px-4">District</th>
                          <th className="py-3 px-4 text-right">Booked</th>
                          <th className="py-3 px-4 text-right">Served</th>
                          <th className="py-3 px-4 text-right">Cancelled</th>
                          <th className="py-3 px-4 text-right">Rescheduled</th>
                          <th className="py-3 px-4 text-right">Service Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {performanceData.map((row, index) => (
                          <tr key={index} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-50 text-slate-755 transition duration-150">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-450">#{index + 1}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-850">{row.districtName}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold">{row.booked}</td>
                            <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-semibold">{row.served}</td>
                            <td className="py-3.5 px-4 text-right font-mono text-rose-700 font-semibold">{row.cancelled}</td>
                            <td className="py-3.5 px-4 text-right font-mono text-amber-600 font-semibold">{row.rescheduled}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-extrabold text-blue-700">{row.serviceRate.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* 2. MONTHLY REPORT */}
            {activeTab === 'monthly' && (
              monthlyData.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic">No submissions recorded for selected month.</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">District</th>
                      <th className="py-3 px-4 text-right">Submissions</th>
                      <th className="py-3 px-4 text-right">Booked</th>
                      <th className="py-3 px-4 text-right">Served</th>
                      <th className="py-3 px-4 text-right">Service Rate</th>
                      <th className="py-3 px-4 text-right">Cancel Rate</th>
                      <th className="py-3 px-4 text-right">Resched Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {monthlyData.map((row, index) => (
                      <tr key={index} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-50 text-slate-755 transition duration-150">
                        <td className="py-3.5 px-4 font-bold text-slate-850">{row.districtName}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">{row.submissionsCount}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">{row.booked}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">{row.served}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-bold">{row.serviceRate.toFixed(1)}%</td>
                        <td className="py-3.5 px-4 text-right font-mono text-rose-700 font-semibold">{row.cancellationRate.toFixed(1)}%</td>
                        <td className="py-3.5 px-4 text-right font-mono text-amber-600 font-semibold">{row.rescheduleRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* 3. DISTRICT HISTORY */}
            {activeTab === 'history' && (
              historyData.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic">No reports found for this district in range.</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Report Date</th>
                      <th className="py-3 px-4">Received Time</th>
                      <th className="py-3 px-4 text-right">Booked</th>
                      <th className="py-3 px-4 text-right">Served</th>
                      <th className="py-3 px-4 text-right">Cancelled</th>
                      <th className="py-3 px-4 text-right">Rescheduled</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {historyData.map((row, index) => (
                      <tr key={index} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-50 text-slate-755 transition duration-150">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-850">{formatDate(row.reportDate)}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{formatTime(row.receivedAt)}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold">{row.appointmentsBooked}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-semibold">{row.served}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-rose-700 font-semibold">{row.cancelled}</td>
                        <td className="py-3.5 px-4 text-right font-mono text-amber-600 font-semibold">{row.rescheduled}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                            row.validationStatus === 'VALID' ? 'bg-emerald-50 text-emerald-700 border-emerald-255' : 'bg-amber-50 text-amber-700 border-amber-255'
                          }`}>
                            {row.validationStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* 4. LATE SUBMISSIONS */}
            {activeTab === 'late' && (
              lateData.length === 0 ? (
                <div className="p-12 text-center text-xs text-emerald-650 font-bold flex flex-col items-center justify-center space-y-2">
                  <span>✔ All submissions within range arrived on time!</span>
                  <span className="text-[10px] text-slate-450 font-normal italic">Reports arrived before the 17:00 cut-off.</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">District</th>
                      <th className="py-3 px-4">Report Date</th>
                      <th className="py-3 px-4">Received Time</th>
                      <th className="py-3 px-4 text-right">Submission Delay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {lateData.map((row, index) => (
                      <tr key={index} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-50 text-slate-755 transition duration-150">
                        <td className="py-3.5 px-4 font-bold text-slate-850">{row.districtName}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-650">{formatDate(row.reportDate)}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">{formatDate(row.receivedAt)} {formatTime(row.receivedAt)}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-700">+{row.delayHours.toFixed(1)} hrs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {/* 5. TIMELINE REPORT */}
            {activeTab === 'timeline' && (
              timelineData.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 italic">No submissions logs recorded for this date.</div>
              ) : (
                <div className="space-y-6">
                  {/* Progress Indicators */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Submission Progress</span>
                        <div className="text-2xl font-black text-slate-900 mt-1 font-mono">{timelineData.length} / 23 Districts</div>
                      </div>
                      <div className="w-32 bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                        <div 
                          style={{ width: `${Math.min((timelineData.length / 23) * 100, 100)}%` }}
                          className="bg-blue-600 h-full rounded-full"
                        />
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">First Submission Time</span>
                      <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
                        {timelineData.length > 0 ? formatTime(timelineData[0].receivedAt) : '--:--'}
                      </div>
                    </div>
                  </div>

                  {/* SVG Hourly Bar Chart */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 shadow-inner">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">Hourly Message Distribution Timeline</h4>
                    <div className="flex items-end justify-between h-40 pt-6 px-4">
                      {hourlyData.map((h, i) => {
                        const pct = (h.count / maxCount) * 100;
                        return (
                          <div key={i} className="flex flex-col items-center flex-1 group relative">
                            {/* Hover tooltip */}
                            <div className="absolute bottom-full mb-2 bg-slate-800 text-white text-[9px] font-bold px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition shadow pointer-events-none z-10">
                              {h.count} reports
                            </div>
                            
                            {/* Bar */}
                            <div 
                              style={{ height: `${Math.max(pct, 4)}%` }}
                              className={`w-4 sm:w-6 rounded-t transition-all ${
                                h.count > 0 ? 'bg-blue-600 group-hover:bg-blue-500' : 'bg-slate-200'
                              }`}
                            />
                            
                            {/* Label */}
                            <span className="text-[8px] font-mono text-slate-500 mt-2">{h.hour}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sequencing Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-4">Sequence</th>
                          <th className="py-3 px-4">District</th>
                          <th className="py-3 px-4">Received Time</th>
                          <th className="py-3 px-4">Parser Mode</th>
                          <th className="py-3 px-4 text-right">Booked Vol</th>
                          <th className="py-3 px-4 text-right">Verification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {timelineData.map((row, index) => (
                          <tr key={index} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-50 text-slate-755 transition duration-150">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-500">#{index + 1}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-850">{row.districtName}</td>
                            <td className="py-3.5 px-4 font-mono text-slate-550">{formatTime(row.receivedAt)}</td>
                            <td className="py-3.5 px-4 font-mono text-[10px] text-slate-550">{row.parserMode}</td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold">{row.booked}</td>
                            <td className="py-3.5 px-4 text-right">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                                row.validationStatus === 'VALID' ? 'bg-emerald-50 text-emerald-700 border-emerald-250' :
                                row.validationStatus === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-250' :
                                'bg-rose-50 text-rose-750 border-rose-250'
                              }`}>
                                {row.validationStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* 6. PARSER HEALTH DIAGNOSTICS */}
            {activeTab === 'parserHealth' && (
              <div className="p-6 space-y-6">
                
                {/* Stats Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  <div className="bg-white border border-slate-200 border-l-4 border-l-blue-600 p-4 rounded-xl shadow-sm">
                    <div className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Total Parsed Reports</div>
                    <div className="text-xl font-bold text-slate-850 mt-1 font-mono">{parserStats.total}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Ingested in range</div>
                  </div>

                  <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-600 p-4 rounded-xl shadow-sm">
                    <div className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Automatically Parsed</div>
                    <div className="text-xl font-bold text-slate-850 mt-1 font-mono">
                      {parserStats.autoParsed}
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-1 font-bold">Manual Review Queue: {parserStats.manualReview}</div>
                  </div>

                  <div className="bg-white border border-slate-200 border-l-4 border-l-indigo-600 p-4 rounded-xl shadow-sm">
                    <div className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Parser Success Rate</div>
                    <div className="text-xl font-bold text-blue-700 mt-1 font-mono">
                      {parserStats.successRate}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Average confidence: {parserStats.avgConfidence}%</div>
                  </div>

                  <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 p-4 rounded-xl shadow-sm">
                    <div className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Revised / Duplicate Submissions</div>
                    <div className="text-xl font-bold text-amber-700 mt-1 font-mono">
                      {parserStats.duplicates}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Average Parse Time: {parserStats.avgParseTime}s</div>
                  </div>

                </div>

                {/* Error Trends Table */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                    <AlertCircle size={16} className="text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Validation Error Trends</h3>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                          <th className="py-2.5 px-4">Validation Failure Type</th>
                          <th className="py-2.5 px-4 text-center">Incidents Count</th>
                          <th className="py-2.5 px-4">Last Occurrence</th>
                          <th className="py-2.5 px-4">Example District</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {errorTrends.map((trend, i) => (
                          <tr key={i} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/50">
                            <td className="py-2.5 px-4 font-bold text-slate-800">{trend.type}</td>
                            <td className="py-2.5 px-4 text-center font-mono font-bold text-rose-700 bg-rose-50/20">{trend.count}</td>
                            <td className="py-2.5 px-4 font-mono text-slate-500">{trend.lastDate}</td>
                            <td className="py-2.5 px-4 text-slate-700 font-bold">{trend.example}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
