import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  Clock, 
  BarChart3, 
  MessageSquare, 
  AlertTriangle, 
  Bell, 
  Settings as SettingsIcon,
  Activity,
  Cpu
} from 'lucide-react';
import { useStore } from '../store';
import { useRole } from '../contexts/RoleContext';

// Pages
import DashboardPage from '../pages/Dashboard';
import ReportsPage from '../pages/Reports';
import PendingPage from '../pages/Pending';
import AnalyticsPage from '../pages/Analytics';
import MessagesPage from '../pages/Messages';
import ReviewPage from '../pages/ManualReview';
import NotificationsPage from '../pages/Notifications';
import SettingsPage from '../pages/Settings';
import SystemHealthPage from '../pages/SystemHealth';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? `${h}h ` : ''}${m > 0 ? `${m}m ` : ''}${s}s`;
}

function LayoutContent() {
  const location = useLocation();
  const { role } = useRole();
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Store values
  const workerStatus = useStore((state) => state.workerStatus);
  const workerState = useStore((state) => state.workerState);
  const whatsappStatus = useStore((state) => state.whatsappStatus);
  const memory = useStore((state) => state.memory);
  const uptime = useStore((state) => state.uptime);
  const lastSync = useStore((state) => state.lastSync);
  const groupName = useStore((state) => state.groupName);
  const currentDate = useStore((state) => state.currentDate);
  const theme = useStore((state) => state.theme);
  const syncWorkerStatus = useStore((state) => state.syncWorkerStatus);

  // Subscribe to main IPC events on mount
  useEffect(() => {
    // Initial fetch
    window.api.getWorkerStatus().then((status) => {
      syncWorkerStatus(status);
    }).catch(err => console.error('Failed to get initial worker status:', err));

    // Listen for updates
    const unsubscribe = window.api.onWorkerStatusChanged((status) => {
      syncWorkerStatus(status);
    });

    return () => unsubscribe();
  }, [syncWorkerStatus]);

  // Notifications unread count polling
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const count = await window.api.getUnreadNotificationsCount();
        setUnreadCount(count);
      } catch (err) {
        console.error('Failed to fetch unread notifications count:', err);
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 5000);
    return () => clearInterval(interval);
  }, []);

  // WhatsApp status color
  const getWhatsAppColor = () => {
    switch (whatsappStatus) {
      case 'Connected': return 'bg-emerald-500';
      case 'QR Scan Required': return 'bg-blue-500 animate-pulse';
      case 'Connecting': return 'bg-yellow-500 animate-pulse';
      default: return 'bg-red-500';
    }
  };

  // Worker status color
  const getWorkerColor = () => {
    switch (workerStatus) {
      case 'Running': return 'bg-emerald-500';
      case 'Starting': return 'bg-yellow-500 animate-pulse';
      case 'Error': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: "Today's Reports", path: '/reports', icon: FileText },
    { name: 'Pending Districts', path: '/pending', icon: Clock },
    { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Messages Log', path: '/messages', icon: MessageSquare },
    { name: 'Manual Review', path: '/review', icon: AlertTriangle },
    { name: 'Notifications', path: '/notifications', icon: Bell },
    { name: 'System Health', path: '/health', icon: Activity },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-full w-full bg-slate-50 text-slate-800 overflow-hidden font-sans select-none">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0e1e38] border-r border-slate-800 flex flex-col justify-between select-none text-slate-300">
        <div>
          {/* Logo / Header */}
          <div className="p-5 border-b border-white/5 flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Cpu size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider uppercase text-white">PSeGS PMU</h2>
              <p className="text-[10px] text-slate-400 font-semibold uppercase">DSD Tracker</p>
            </div>
          </div>

          {/* Menu */}
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    isActive
                      ? 'bg-white/10 text-white border-l-4 border-blue-500 shadow-sm'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                  <span>{item.name}</span>
                  {item.name === 'Notifications' && unreadCount > 0 && (
                    <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* System Info Panel */}
        <div className="p-4 border-t border-white/5 bg-white/5 text-[10px] text-slate-450 font-mono space-y-1">
          <div>OS: Windows Desktop</div>
          <div>Version: 1.0.0 (Milestone 7)</div>
        </div>
      </aside>

      {/* Main Body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 select-none shadow-sm">
          <div className="flex items-center space-x-2">
            <h1 className="text-sm font-extrabold tracking-wider text-slate-900 uppercase">
              Punjab District Performance Report Tracker
            </h1>
          </div>
          
          {/* Status indicators */}
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold uppercase font-sans">
              <span>Role:</span>
              <span>{role}</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-bold uppercase">WhatsApp:</span>
              <span className={`w-2 h-2 rounded-full ${getWhatsAppColor()}`} />
              <span className="text-slate-700 font-semibold">{whatsappStatus}</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Worker:</span>
              <span className={`w-2 h-2 rounded-full ${getWorkerColor()}`} />
              <span className="text-slate-700 font-semibold">{workerState}</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-slate-50">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/pending" element={<PendingPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/health" element={<SystemHealthPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {/* Footer Status Bar */}
        <footer className="h-8 bg-white border-t border-slate-200 flex items-center justify-between px-6 text-[10px] text-slate-500 font-mono select-none shadow-inner">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <Activity size={10} className="text-blue-500" />
              <span>Sync Group: <span className="text-slate-700 font-semibold">{groupName}</span></span>
            </div>
            {uptime > 0 && (
              <>
                <span>Uptime: <span className="text-slate-700 font-semibold">{formatUptime(uptime)}</span></span>
                <span>RAM: <span className="text-slate-700 font-semibold">{(memory / 1024 / 1024).toFixed(1)} MB</span></span>
              </>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span>Last Sync: {lastSync}</span>
            <span>Theme: {theme}</span>
            <span>Date: {currentDate}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AppLayout() {
  return (
    <HashRouter>
      <LayoutContent />
    </HashRouter>
  );
}
