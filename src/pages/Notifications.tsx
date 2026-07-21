import { useEffect, useState } from 'react';
import { 
  Bell, 
  BellOff, 
  CheckCheck, 
  Trash2, 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  RefreshCw,
  Search
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string; // INFO | SUCCESS | WARNING | ERROR
  category: string; // OPERATIONAL | TECHNICAL | SYSTEM
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'OPERATIONAL' | 'TECHNICAL' | 'SYSTEM'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadNotifications();

    // Listen for live messages that might generate notifications
    const unsubscribe = window.api.onMessageCaptured(() => {
      loadNotifications();
    });

    return () => unsubscribe();
  }, []);

  const loadNotifications = () => {
    window.api.getNotifications(100)
      .then((data) => {
        setNotifications(data as any[]);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load notifications:', err);
        setError('Failed to load system notifications.');
        setLoading(false);
      });
  };

  const handleMarkRead = async (id: string) => {
    try {
      await window.api.markNotificationRead(id);
      // Optimistic update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await window.api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.api.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Filter & Search Logic
  const filteredNotifications = notifications.filter(n => {
    const categoryMatch = activeCategory === 'ALL' || n.category === activeCategory;
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery || 
      n.title.toLowerCase().includes(searchLower) || 
      n.message.toLowerCase().includes(searchLower);
    return categoryMatch && searchMatch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={16} />;
      case 'WARNING':
        return <AlertTriangle className="text-amber-500 flex-shrink-0" size={16} />;
      case 'ERROR':
        return <AlertCircle className="text-rose-600 flex-shrink-0" size={16} />;
      default:
        return <Info className="text-blue-600 flex-shrink-0" size={16} />;
    }
  };

  const getTypeStyle = (type: string, read: boolean) => {
    if (read) return 'border-l-slate-300 bg-white/70';
    switch (type) {
      case 'SUCCESS': return 'border-l-emerald-500 bg-emerald-50/10 hover:bg-emerald-50/20';
      case 'WARNING': return 'border-l-amber-500 bg-amber-50/10 hover:bg-amber-50/20';
      case 'ERROR': return 'border-l-rose-500 bg-rose-50/10 hover:bg-rose-50/20';
      default: return 'border-l-blue-500 bg-blue-50/10 hover:bg-blue-50/20';
    }
  };

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
      return '';
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="p-6 space-y-6 bg-slate-50 text-slate-800 min-h-full">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bell size={24} className="text-blue-600" />
            <span>System Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full font-sans">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-1">Audit log of system processes, parsing events, database integrity alerts, and worker operations.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setLoading(true); loadNotifications(); }}
            className="flex items-center space-x-1 bg-white border border-slate-350 hover:bg-slate-100 text-xs font-semibold px-3 py-2 rounded-lg shadow-sm"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-750 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition"
          >
            <CheckCheck size={14} />
            <span>Mark All as Read</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-xs text-red-700 font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-1">
          {(['ALL', 'OPERATIONAL', 'TECHNICAL', 'SYSTEM'] as const).map(cat => {
            const count = cat === 'ALL' 
              ? notifications.length 
              : notifications.filter(n => n.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs font-bold px-3.5 py-2 rounded-lg transition border ${
                  activeCategory === cat 
                    ? 'bg-slate-800 border-slate-900 text-white' 
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{cat}</span>
                <span className={`ml-1.5 text-[9px] px-1 rounded-full ${
                  activeCategory === cat ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="flex-1 max-w-sm flex items-center bg-white border border-slate-350 rounded-lg px-3 py-2 shadow-sm ml-auto">
          <Search size={14} className="text-slate-400 mr-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notifications..."
            className="w-full bg-transparent text-xs text-slate-800 focus:outline-none placeholder-slate-400 font-semibold"
          />
        </div>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl h-64 animate-pulse flex items-center justify-center text-slate-400 text-xs italic shadow-sm">
          Fetching notifications queue...
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center flex flex-col items-center justify-center space-y-3 shadow-sm max-w-3xl mx-auto">
          <div className="bg-slate-100 p-4 rounded-full text-slate-400">
            <BellOff size={36} />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Notifications Logged</h3>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            All caught up! Notifications generated by parser anomalies, database health checks, and restore jobs will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-w-4xl">
          {filteredNotifications.map((n) => (
            <div 
              key={n.id} 
              className={`border border-slate-250 border-l-4 p-4 rounded-xl shadow-sm transition flex gap-3.5 items-start ${
                getTypeStyle(n.type, n.read)
              }`}
            >
              {/* Type Icon Indicator */}
              <div className="mt-0.5">
                {getIcon(n.type)}
              </div>

              {/* Message Details */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-xs font-bold leading-none ${n.read ? 'text-slate-550' : 'text-slate-900'}`}>
                    {n.title}
                  </h4>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded font-mono ${
                    n.category === 'TECHNICAL' ? 'bg-amber-100 text-amber-800' :
                    n.category === 'OPERATIONAL' ? 'bg-purple-100 text-purple-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {n.category}
                  </span>
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                  )}
                </div>
                <p className={`text-xs ${n.read ? 'text-slate-450 font-normal' : 'text-slate-700 font-medium'} leading-relaxed`}>
                  {n.message}
                </p>
                <div className="text-[9px] font-semibold text-slate-400 font-mono">
                  {formatDateTime(n.createdAt)}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-1">
                {!n.read && (
                  <button
                    onClick={() => handleMarkRead(n.id)}
                    title="Mark as read"
                    className="p-1.5 hover:bg-slate-205/60 rounded-lg text-slate-500 hover:text-slate-800 transition"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(n.id)}
                  title="Delete"
                  className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
