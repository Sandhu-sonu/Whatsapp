import { useEffect, useState } from 'react';
import { Search, MessageSquare, AlertCircle, FileText, Image as ImageIcon } from 'lucide-react';

interface MessageRow {
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
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadMessages();

    // Subscribe to live incoming messages
    const unsubscribe = window.api.onMessageCaptured(() => {
      // Reload from DB to keep exact order and duplicate checking
      loadMessages();
    });

    return () => unsubscribe();
  }, []);

  const loadMessages = () => {
    window.api
      .getMessages()
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load messages:', err);
        setError('Database Error: Failed to retrieve message log from SQLite.');
        setLoading(false);
      });
  };

  // Filter messages based on search
  const filteredMessages = messages.filter((msg) => {
    const query = searchQuery.toLowerCase();
    const sender = (msg.sender || '').toLowerCase();
    const text = (msg.message || '').toLowerCase();
    return sender.includes(query) || text.includes(query);
  });

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '--:--';
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'NEW') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
          Stored
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-750 border border-slate-200 uppercase">
        {status}
      </span>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'IMAGE':
        return <ImageIcon size={12} className="text-blue-600 inline mr-1 animate-pulse" />;
      case 'DOCUMENT':
        return <FileText size={12} className="text-amber-600 inline mr-1" />;
      default:
        return <MessageSquare size={12} className="text-slate-500 inline mr-1" />;
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 text-slate-800 min-h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Messages Log</h1>
          <p className="text-xs text-slate-500 mt-1">Audit log of all raw messages ingested from the DSD Monitoring group.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-xs text-red-700 font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-3 py-2 max-w-md shadow-sm">
        <Search size={16} className="text-slate-400 mr-2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by sender or message content..."
          className="w-full bg-transparent text-xs text-slate-800 focus:outline-none placeholder-slate-400 font-semibold"
        />
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl h-64 animate-pulse flex items-center justify-center text-slate-450 text-xs shadow-sm">
          Loading messages...
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-2 shadow-sm">
          <AlertCircle size={32} className="text-slate-400" />
          <h3 className="text-sm font-bold text-slate-700">No Messages Logged</h3>
          <p className="text-xs text-slate-500 max-w-xs">
            Start the worker and send messages in the "DSD Monitoring" group to see them stream here in real-time.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[9px] font-mono tracking-wider">
                  <th className="py-3 px-4 w-24">Time</th>
                  <th className="py-3 px-4 w-40">Sender</th>
                  <th className="py-3 px-4 w-28">Type</th>
                  <th className="py-3 px-4">Preview</th>
                  <th className="py-3 px-4 w-24 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredMessages.map((msg) => (
                  <tr key={msg.id} className="odd:bg-white even:bg-slate-50/30 hover:bg-slate-50 text-slate-750 transition duration-150">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {formatTime(msg.receivedAt)}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {msg.sender || 'Unknown'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] font-bold text-slate-655">
                      {getTypeIcon(msg.messageType)}
                      <span>{msg.messageType}</span>
                    </td>
                    <td className="py-3 px-4 select-text font-sans leading-relaxed break-all max-w-xl whitespace-pre-wrap">
                      {msg.message}
                    </td>
                    <td className="py-3 px-4 text-right select-none">
                      {getStatusBadge(msg.ingestionStatus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
