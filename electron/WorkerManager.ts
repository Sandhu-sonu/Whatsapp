import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import { WorkerState, WorkerToMainMessage, StartWorkerPayload } from '../src/workers/whatsapp/events';
import { logger } from '../src/lib/logger';
import { MessageRepository } from '../src/repositories/MessageRepository';
import { parseReport } from '../src/lib/parser/pipeline';
import { SubmissionRepository } from '../src/repositories/SubmissionRepository';

export interface Diagnostics {
  workerPid?: number;
  browserVersion: string;
  playwrightVersion: string;
  sessionPath: string;
  currentState: WorkerState;
  lastRestart?: string;
  lastError?: string;
}
console.log(">>>>>>>> WorkerManager.start() called <<<<<<<<");
export class WorkerManager {
  private workerProcess: ChildProcess | null = null;
  private state: WorkerState = 'STOPPED';
  private lastError: string | undefined = undefined;
  
  // Heartbeat values
  private memoryUsage: number = 0;
  private uptime: number = 0;
  private lastSync: string | undefined = undefined;

  // Ingestion metrics
  private capturedCount = 0;
  private duplicateCount = 0;
  private lastMessageDetails: { sender: string; time: string; preview: string } | null = null;

  // Restart Policy
  private restartAttempts = 0;
  private maxAttempts = 3;
  private isShuttingDown = false;
  private lastRestartTime: string | undefined = undefined;
  private startupTimeoutTimer: NodeJS.Timeout | null = null;

  // Config parameters
  private groupName = 'DSD Monitoring';
  private headless = false;

  private onStateChangeCallback: (state: WorkerState) => void;

  constructor(onStateChange: (state: WorkerState) => void) {
    this.onStateChangeCallback = onStateChange;
  }

  // File Logging Helper
  private appendLog(filename: string, message: string) {
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const timestamp = new Date().toISOString();
      fs.appendFileSync(path.join(logDir, filename), `[${timestamp}] ${message}\n`);
    } catch (e) {
      logger.error('Failed to write to file log: ' + filename);
    }
  }

  public getSessionPath(): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(process.cwd(), 'playwright-profile');
    } else {
      return path.join(app.getPath('userData'), 'playwright-profile');
    }
  }

  public getStatus() {
    return {
      workerState: this.state,
      memory: this.memoryUsage,
      uptime: this.uptime,
      lastSync: this.lastSync,
      groupName: this.groupName,
      capturedCount: this.capturedCount,
      duplicateCount: this.duplicateCount,
      lastMessageDetails: this.lastMessageDetails,
    };
  }

  public getDiagnostics(): Diagnostics {
    return {
      workerPid: this.workerProcess?.pid,
      browserVersion: 'Chromium (Playwright Bound)',
      playwrightVersion: '1.49.0', // Standard target version
      sessionPath: this.getSessionPath(),
      currentState: this.state,
      lastRestart: this.lastRestartTime,
      lastError: this.lastError,
    };
  }

  public async start(groupName: string, headless: boolean): Promise<boolean> {
    // 1. Session Lock Check
    if (this.state !== 'STOPPED' && this.state !== 'ERROR') {
      logger.warn(`Worker start request rejected. Current state is: ${this.state}`);
      return false;
    }

    this.groupName = groupName;
    this.headless = headless;
    this.isShuttingDown = false;
    this.restartAttempts = 0; // Reset manually
    this.lastError = undefined;

    this.appendLog('main.log', `Starting worker for group: "${groupName}"`);
    this.transitionState('STARTING');
    
    this.spawnProcess();
    return true;
  }

  private startStartupTimeout() {
    this.clearStartupTimeout();
    this.startupTimeoutTimer = setTimeout(() => {
      if (this.state === 'STARTING' || this.state === 'OPENING_BROWSER') {
        const errorText = `Startup timed out: Worker remained in ${this.state} for over 30 seconds.`;
        this.appendLog('main.log', `[TIMEOUT] ${errorText} Terminating child process.`);
        this.appendLog('worker.log', `[ERROR] [TIMEOUT] ${errorText}`);
        this.lastError = errorText;

        if (this.workerProcess) {
          try {
            this.workerProcess.kill('SIGKILL');
          } catch (e) {
            // ignore
          }
        }
        this.transitionState('ERROR', this.lastError);
      }
    }, 120000);
  }

  private clearStartupTimeout() {
    if (this.startupTimeoutTimer) {
      clearTimeout(this.startupTimeoutTimer);
      this.startupTimeoutTimer = null;
    }
  }

  private spawnProcess() {
    this.startStartupTimeout();

    const scriptPath = path.join(__dirname, '../src/workers/whatsapp/worker.js');
    this.appendLog('main.log', `[Worker] Starting child process: ${scriptPath}`);
    this.lastRestartTime = new Date().toLocaleTimeString();

    try {
      this.workerProcess = fork(scriptPath, [], {
        env: { ...process.env, NODE_ENV: app.isPackaged ? 'production' : 'development' },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      });
// ===================== DEBUG LISTENERS =====================
this.workerProcess.on("spawn", () => {
  console.log("✅ Worker spawned. PID:", this.workerProcess?.pid);
});

this.workerProcess.on("disconnect", () => {
  console.error("❌ Worker IPC disconnected");
});

this.workerProcess.on("error", (err) => {
  console.error("❌ Worker error:", err);
});

this.workerProcess.on("exit", (code, signal) => {
  console.error(`❌ Worker exited. Code=${code}, Signal=${signal}`);
});

this.workerProcess.on("message", (message) => {
  console.log("📩 Worker Message:", message);
});
// ===========================================================
      // Capture and forward stdout/stderr streams
      this.workerProcess.stdout?.on('data', (data) => {
        const text = data.toString().trim();
        this.appendLog('worker.log', `[STDOUT] ${text}`);
      });
      this.workerProcess.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        this.appendLog('worker.log', `[STDERR] [ERROR] ${text}`);
      });

      // Listen to messages
      this.workerProcess.on('message', (message: any) => {
        this.handleWorkerMessage(message);
      });

      // Handle spawn error
      this.workerProcess.on('error', (err) => {
        this.appendLog('main.log', `Worker child spawn error: ${err.message}`);
        this.appendLog('worker.log', `[ERROR] Spawn error: ${err.message}\n${err.stack || ''}`);
        this.lastError = err.message;
        this.transitionState('ERROR', err.message);
      });

      // Handle exit/crashes
      this.workerProcess.on('exit', (code, signal) => {
        this.clearStartupTimeout();
        this.appendLog('main.log', `Worker child exited with code: ${code}, signal: ${signal}`);
        this.workerProcess = null;

        if (this.isShuttingDown) {
          this.transitionState('STOPPED');
          return;
        }

        // Recovery Logic
        if (this.restartAttempts < this.maxAttempts) {
          this.restartAttempts++;
          const delay = 5000;
          this.appendLog('main.log', `Worker crashed. Reconnecting attempt ${this.restartAttempts}/${this.maxAttempts} in ${delay/1000}s...`);
          this.transitionState('STARTING');
          
          setTimeout(() => {
            if (!this.isShuttingDown) {
              this.spawnProcess();
            }
          }, delay);
        } else {
          this.lastError = 'Maximum recovery attempts exceeded. Browser failed to start.';
          this.appendLog('main.log', `Error: ${this.lastError}`);
          this.transitionState('ERROR', this.lastError);
        }
      });

      // Dispatch START Command
      // Wait until the child has spawned before sending START_WORKER
const payload: StartWorkerPayload = {
  headless: this.headless,
  groupName: this.groupName,
  profilePath: this.getSessionPath(),
};

this.workerProcess.once("spawn", () => {
  console.log("✅ Worker spawned");

  if (!this.workerProcess?.connected) {
    console.error("Worker IPC is not connected.");
    return;
  }

  console.log("📤 Sending START_WORKER");

  this.workerProcess.send({
    type: "START_WORKER",
    payload,
  });
});

    } catch (e: any) {
      this.clearStartupTimeout();
      this.lastError = e.message;
      this.appendLog('main.log', `Spawn Failed: ${e.message}`);
      this.transitionState('ERROR', e.message);
    }
  }

  public async stop() {
    this.clearStartupTimeout();
    if (this.state === 'STOPPED') return;
    this.isShuttingDown = true;
    this.appendLog('main.log', 'Stopping worker process...');

    if (this.workerProcess) {
      this.workerProcess.send({ type: 'STOP_WORKER' });
      
      // Force kill after 5 seconds if not responsive
      const proc = this.workerProcess;
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch (e) {
          // ignore
        }
      }, 5000);
    } else {
      this.transitionState('STOPPED');
    }
  }

  private handleWorkerMessage(message: any) {
    switch (message.type) {
      case 'STATE_CHANGE':
        this.transitionState(message.payload.state, message.payload.error);
        break;

      case 'HEARTBEAT':
        this.memoryUsage = message.payload.memory;
        this.uptime = message.payload.uptime;
        this.lastSync = message.payload.lastSync;
        // Trigger state refresh for UI
        this.onStateChangeCallback(this.state);
        break;

      case 'MESSAGE_RECEIVED':
        this.handleMessageReceived(message.payload);
        break;

      case 'LOG': {
        const { level, message: logMsg, meta } = message.payload;
        const formatted = `${level.toUpperCase()}: ${logMsg} ${meta ? JSON.stringify(meta) : ''}`;
        
        if (logMsg.includes('Playwright')) {
          this.appendLog('playwright.log', formatted);
        } else if (logMsg.includes('browser') || logMsg.includes('Chromium')) {
          this.appendLog('browser.log', formatted);
        } else {
          this.appendLog('worker.log', formatted);
        }
        break;
      }
    }
  }

  private async handleMessageReceived(payload: any) {
    try {
      const { whatsappId, sender, senderNumber, isFromMe, message, messageType, receivedAt } = payload;
      
      // 1. Check duplicate
      const duplicate = await MessageRepository.exists(whatsappId);
      if (duplicate) {
        this.duplicateCount++;
        this.appendLog('main.log', `Ignored duplicate message ID: ${whatsappId}`);
        this.onStateChangeCallback(this.state);
        return;
      }

      // 2. Generate Hash
      const hashInput = `${sender || ''}${receivedAt}${message}`;
      const messageHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      // 3. Create message in SQLite
      const createdMessage = await MessageRepository.createMessage({
        whatsappId,
        sender,
        senderNumber,
        isFromMe,
        message,
        messageHash,
        messageType,
        receivedAt: new Date(receivedAt),
      });

      this.capturedCount++;
      this.lastMessageDetails = {
        sender: sender || 'Unknown',
        time: new Date(receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        preview: message.length > 50 ? `${message.substring(0, 50)}...` : message,
      };

      this.appendLog('main.log', `Stored message from ${sender} (Type: ${messageType})`);

      // 4. Trigger Report Ingestion Parser
      let parsedReportDate: string | null = null;
      let parsedDistrictName: string | null = null;
      if (!isFromMe && messageType === 'TEXT') {
        try {
          const parseResult = await parseReport(message, new Date(receivedAt));
          if (parseResult.districtId) {
            await SubmissionRepository.saveParsedReport(createdMessage.id, parseResult);
            parsedReportDate = parseResult.reportDate.toISOString().split('T')[0];
            parsedDistrictName = parseResult.districtName;
            this.appendLog('main.log', `[PARSER] Successfully parsed report for district: ${parseResult.districtName} (Mode: ${parseResult.parserMode})`);
          } else {
            this.appendLog('main.log', `[PARSER] Skipped message: No district identified.`);
          }
        } catch (err: any) {
          logger.error('Failed to parse incoming report: ' + err.message);
          this.appendLog('main.log', `[ERROR] Ingestion parsing crash: ${err.message}`);
        }
      }

      this.onStateChangeCallback(this.state);

      // Notify window to refresh the Messages Log page
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('message-captured', {
          ...payload,
          reportDate: parsedReportDate,
          districtName: parsedDistrictName,
        });
      }
    } catch (e: any) {
      logger.error('Failed to store WhatsApp message: ' + e.message);
      this.appendLog('main.log', `[ERROR] Failed to store message: ${e.message}`);
    }
  }

  private transitionState(newState: WorkerState, error?: string) {
    this.state = newState;
    if (error) {
      this.lastError = error;
      this.appendLog('main.log', `[STATE] Transitioned to ERROR: ${error}`);
      this.appendLog('worker.log', `[ERROR] Worker transitioned to ERROR state: ${error}`);
    } else {
      this.appendLog('main.log', `[STATE] Transitioned to ${newState}`);
    }

    // Clear timeout if out of STARTING or OPENING_BROWSER
    if (newState !== 'STARTING' && newState !== 'OPENING_BROWSER') {
      this.clearStartupTimeout();
    }

    this.onStateChangeCallback(newState);
  }
}
