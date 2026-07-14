import { create } from 'zustand';

interface AppState {
  workerStatus: 'Running' | 'Stopped' | 'Starting' | 'Error';
  workerState: string;
  whatsappStatus: 'Connected' | 'Disconnected' | 'Connecting' | 'QR Scan Required';
  memory: number;
  uptime: number;
  lastSync: string;
  groupName: string;
  capturedCount: number;
  duplicateCount: number;
  lastMessageDetails: { sender: string; time: string; preview: string } | null;
  currentDate: string;
  theme: 'dark' | 'light';
  
  setWorkerStatus: (status: 'Running' | 'Stopped' | 'Starting' | 'Error') => void;
  setWhatsappStatus: (status: 'Connected' | 'Disconnected' | 'Connecting' | 'QR Scan Required') => void;
  setCurrentDate: (date: string) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  syncWorkerStatus: (status: { 
    workerState: string; 
    memory: number; 
    uptime: number; 
    lastSync?: string; 
    groupName: string;
    capturedCount?: number;
    duplicateCount?: number;
    lastMessageDetails?: { sender: string; time: string; preview: string } | null;
  }) => void;
}

export const useStore = create<AppState>((set) => ({
  workerStatus: 'Stopped',
  workerState: 'STOPPED',
  whatsappStatus: 'Disconnected',
  memory: 0,
  uptime: 0,
  lastSync: 'Never',
  groupName: 'DSD Monitoring',
  capturedCount: 0,
  duplicateCount: 0,
  lastMessageDetails: null,
  currentDate: new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  theme: 'dark',
  
  setWorkerStatus: (status) => set({ workerStatus: status }),
  setWhatsappStatus: (status) => set({ whatsappStatus: status }),
  setCurrentDate: (date) => set({ currentDate: date }),
  setTheme: (theme) => set({ theme }),
  
  syncWorkerStatus: (status) => {
    // Map workerState to workerStatus
    let wStatus: 'Running' | 'Stopped' | 'Starting' | 'Error' = 'Stopped';
    if (status.workerState === 'STARTING' || status.workerState === 'OPENING_BROWSER' || status.workerState === 'OPENING_GROUP') {
      wStatus = 'Starting';
    } else if (status.workerState === 'MONITORING' || status.workerState === 'AUTHENTICATED') {
      wStatus = 'Running';
    } else if (status.workerState === 'ERROR') {
      wStatus = 'Error';
    }

    // Map workerState to whatsappStatus
    let waStatus: 'Connected' | 'Disconnected' | 'Connecting' | 'QR Scan Required' = 'Disconnected';
    if (status.workerState === 'MONITORING') {
      waStatus = 'Connected';
    } else if (status.workerState === 'AUTHENTICATED' || status.workerState === 'OPENING_GROUP') {
      waStatus = 'Connecting';
    } else if (status.workerState === 'WAITING_FOR_QR') {
      waStatus = 'QR Scan Required';
    }

    set({
      workerState: status.workerState,
      workerStatus: wStatus,
      whatsappStatus: waStatus,
      memory: status.memory,
      uptime: status.uptime,
      lastSync: status.lastSync || 'Never',
      groupName: status.groupName,
      capturedCount: status.capturedCount || 0,
      duplicateCount: status.duplicateCount || 0,
      lastMessageDetails: status.lastMessageDetails || null,
    });
  },
}));
