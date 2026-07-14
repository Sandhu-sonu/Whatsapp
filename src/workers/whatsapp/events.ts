export type WorkerState =
  | 'STOPPED'
  | 'STARTING'
  | 'OPENING_BROWSER'
  | 'WAITING_FOR_QR'
  | 'AUTHENTICATED'
  | 'OPENING_GROUP'
  | 'MONITORING'
  | 'ERROR';

export type WorkerLogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface StartWorkerPayload {
  headless: boolean;
  groupName: string;
  profilePath: string;
}

// Messages sent from Main to Worker
export type MainToWorkerMessage =
  | { type: 'START_WORKER'; payload: StartWorkerPayload }
  | { type: 'STOP_WORKER' };

// Messages sent from Worker to Main
export type WorkerToMainMessage =
  | { type: 'STATE_CHANGE'; payload: { state: WorkerState; error?: string } }
  | { type: 'HEARTBEAT'; payload: { status: WorkerState; memory: number; uptime: number; lastSync?: string } }
  | { type: 'LOG'; payload: { level: WorkerLogLevel; message: string; meta?: any } };
