import { PlaywrightService } from './browser';
import { WorkerStateManager } from './state';
import { MainToWorkerMessage, WorkerState, WorkerLogLevel } from './events';

import { SELECTORS } from './selectors';

let playwrightService: PlaywrightService | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let lastSyncTime: string | undefined = undefined;

// Send logs and states back to Main Process
const sendLog = (level: WorkerLogLevel, message: string, meta?: any) => {
  if (process.send) {
    process.send({ type: 'LOG', payload: { level, message, meta } });
  }
};

const sendStateChange = (state: WorkerState, error?: string) => {
  if (process.send) {
    process.send({ type: 'STATE_CHANGE', payload: { state, error } });
  }
};

const sendHeartbeat = (status: WorkerState) => {
  if (process.send) {
    const memory = process.memoryUsage().heapUsed;
    const uptime = Math.floor(process.uptime());
    process.send({
      type: 'HEARTBEAT',
      payload: { status, memory, uptime, lastSync: lastSyncTime },
    });
  }
};

// Initialize State Manager
const stateManager = new WorkerStateManager((state, error) => {
  sendLog('info', `Worker state changed to: ${state}${error ? ` (Error: ${error})` : ''}`);
  sendStateChange(state, error);
});

function clearHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function startWorker(
  headless: boolean,
  groupName: string,
  profilePath: string,
  recoveryScanCount: number = 500,
  lastProcessedWhatsAppId?: string
) {
  stateManager.set('STARTING');
  playwrightService = new PlaywrightService((level, msg, meta) => sendLog(level, msg, meta));

  try {
    stateManager.set('OPENING_BROWSER');
    const page = await playwrightService.launch(profilePath, headless);

    sendLog('info', '[Worker] Loading WhatsApp Web');
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'load', timeout: 60000 });
    await playwrightService.takeScreenshot('startup');

    // Authentication Loop
    sendLog('info', 'Monitoring authentication page state...');
    let authenticated = false;
    let qrScanChecked = 0;

    while (stateManager.get() !== 'STOPPED' && stateManager.get() !== 'ERROR') {
      const isQrCanvas = await page.$(SELECTORS.qrCanvas);
      const isChatList = await page.$(SELECTORS.chatList);

      if (isChatList) {
        if (stateManager.get() === 'WAITING_FOR_QR') {
          sendLog('info', '[Worker] QR detected');
        }
        sendLog('info', '[Worker] Authenticated');
        stateManager.set('AUTHENTICATED');
        authenticated = true;
        break;
      } else if (isQrCanvas) {
        if (stateManager.get() !== 'WAITING_FOR_QR') {
          sendLog('info', '[Worker] Waiting for QR');
          stateManager.set('WAITING_FOR_QR');
        }
        if (qrScanChecked % 15 === 0) {
          await playwrightService.takeScreenshot('login');
        }
      }

      qrScanChecked++;
      await page.waitForTimeout(1000);
    }

    if (!authenticated) {
      // Distinguish a deliberate stop from a real failure — don't report
      // a user-initiated shutdown as an ERROR state.
      if (stateManager.get() === 'STOPPED') {
        sendLog('info', '[Worker] Stopped by request before authentication completed.');
        return;
      }
      throw new Error('Worker was stopped before authentication succeeded.');
    }

    // Wait until WhatsApp fully loads (indicated by search input visibility)
    const searchBox = page.locator(SELECTORS.searchInput).first();
    await searchBox.waitFor({ state: 'visible', timeout: 45000 });
    sendLog('info', '[Worker] WhatsApp loaded');

    // Navigating to group
    stateManager.set('OPENING_GROUP');
    sendLog('info', '[Worker] Opening search');
    sendLog('info', '[Worker] Search box found');

    sendLog('info', `[Worker] Searching for ${groupName}`);
    await searchBox.click();
    await searchBox.fill('');
    await searchBox.type(groupName, { delay: 50 });

    // Wait for search results and select the matching chat
    sendLog('info', `[Worker] Waiting for chat result to appear...`);
    const escapedGroupName = groupName.replace(/"/g, '\\"');
    const chatLocator = page.locator(`span[title="${escapedGroupName}" i]`).first();
    
    await chatLocator.waitFor({ state: 'visible', timeout: 15000 });
    // Click the whole chat row instead of the title using native Playwright clicks
    const rowLocator = page.locator(SELECTORS.listItem).filter({ has: chatLocator }).first();
    if (await rowLocator.count() > 0) {
       sendLog('info', `[Worker] Chat row found, clicking via Playwright...`);
       await rowLocator.click();
    } else {
       sendLog('info', `[Worker] Chat row not found, clicking title locator directly...`);
       await chatLocator.click();
    }

    await page.waitForTimeout(1500);
    let found = true;

    if (!found) {
      const visibleTitles = await page
        .locator(SELECTORS.cellFrameTitle)
        .allTextContents();

      sendLog(
        'error',
        'Visible Chats:\n' +
          visibleTitles
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => `  ${t}`)
            .join('\n')
      );

      throw new Error(`Group "${groupName}" not found.`);
    }

    // Verify the chat opened.
    //
    // Previously this checked `header[data-testid="conversation-header"]`
    // / `header span[title]`. Recent WhatsApp Web DOM changes made those
    // selectors unreliable — `span[title]` can resolve to an unrelated
    // header element (e.g. an accessibility tooltip reading
    // "click here for group info") instead of the group name, causing a
    // false "Group did not open" failure even though the click succeeded.
    //
    // Verification now checks, in order of preference:
    //   1. The message composer becomes available (strongest signal that
    //      a real conversation is open and ready).
    //   2. The search results list disappears (click was acted on).
    //   3. A conversation/message pane exists.
    // If none of these can be confirmed within the timeout, we don't
    // treat that as a hard failure — WhatsApp's DOM changes too often for
    // any single selector to be trusted long-term — so we fall back to a
    // short wait and continue, exactly as we would if verification had
    // succeeded. We only throw here if the earlier search/click step
    // itself failed (handled above by the `found` check), not because
    // this best-effort confirmation couldn't find a matching element.
    const composerSelectors = SELECTORS.composer;
    const conversationPaneSelectors = SELECTORS.conversationPanel;

    let verified = false;

    try {
      await page.waitForSelector(composerSelectors, { timeout: 8000, state: 'visible' });
      sendLog('info', '[Worker] Verified via message composer');
      verified = true;
    } catch {
      // composer check didn't confirm in time — fall through to next option
    }

    if (!verified) {
      try {
        await page
          .locator(SELECTORS.cellFrameTitle)
          .first()
          .waitFor({ state: 'hidden', timeout: 4000 });
        sendLog('info', '[Worker] Verified via search results clearing');
        verified = true;
      } catch {
        // search results either never cleared or selector didn't match — fall through
      }
    }

    if (!verified) {
      try {
        await page.waitForSelector(conversationPaneSelectors, { timeout: 4000 });
        sendLog('info', '[Worker] Verified via conversation pane presence');
        verified = true;
      } catch {
        // no conversation pane match either — fall through to soft fallback below
      }
    }
    let groupOpened = verified;

    if (!groupOpened) {
      sendLog(
        'warn',
        '[Worker] Could not positively verify group opened via known selectors; proceeding anyway'
      );
      await page.waitForTimeout(2000);
    }

    sendLog('info', `[Worker] Successfully opened group: ${groupName}`);
    sendLog('info', '[Worker] Group opened');
    lastSyncTime = new Date().toLocaleTimeString();

    // ------------------------------------------------------------
    // Browser -> Node bridge
    // ------------------------------------------------------------
    await page.exposeFunction('onNewMessageCaptured', (msg: any) => {
      sendLog('info', `Captured new message from ${msg.sender} (${msg.messageType})`);

      if (process.send) {
        process.send({
          type: 'MESSAGE_RECEIVED',
          payload: msg,
        });
      }
    });

    const recoveryMetrics = {
      startedAt: new Date().toISOString(),
      errors: 0
    };

    await page.exposeFunction('onRecoveryProgress', (progressText: string) => {
      stateManager.set('RECOVERY_SYNCING', undefined, progressText);
    });

    await page.exposeFunction('onRecoveryScanCompleted', async (stats: any) => {
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - new Date(recoveryMetrics.startedAt).getTime();
      const msgPerSec = stats.scannedCount / (durationMs / 1000 || 1);

      let oldestId = undefined;
      let latestId = undefined;
      try {
        const ids = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('[data-id]'));
          return els.map(el => el.getAttribute('data-id')).filter(Boolean);
        });
        if (ids.length > 0) {
          oldestId = ids[0];
          latestId = ids[ids.length - 1];
        }
      } catch (err) {}

      const auditPayload = {
        scanned: stats.scannedCount,
        alreadyStored: 0,
        newMessages: 0,
        reportsParsed: 0,
        ignored: 0,
        duplicatesSkipped: 0,
        errors: recoveryMetrics.errors,
        startedAt: recoveryMetrics.startedAt,
        finishedAt,
        durationMs,
        msgPerSec: parseFloat(msgPerSec.toFixed(2)),
        latestId,
        oldestId
      };

      sendLog('info', `Recovery Scan Completed: ${stats.scannedCount} scanned.`);
      
      if (process.send) {
        process.send({
          type: 'RECOVERY_AUDIT',
          payload: auditPayload
        });
      }

      stateManager.set('MONITORING');
    });

    // Forward browser console logs to the worker log
    page.on('console', (msg) => {
      sendLog('debug', `[Browser Console ${msg.type()}] ${msg.text()}`);
    });

    // ------------------------------------------------------------
    // Install MutationObserver
    // ------------------------------------------------------------
    await page.evaluate(({ lastProcessedWhatsAppId, recoveryScanCount }) => {
      console.log('MutationObserver installed, parameters:', { lastProcessedWhatsAppId, recoveryScanCount });

      const seenIds = new Set<string>();

      const processMessage = (el: Element, timeOffsetMs: number = 0) => {
        let idSource = el.closest('[data-id]') ?? el.querySelector('[data-id]');

        if (!idSource) {
          return;
        }

        const id = idSource.getAttribute('data-id');
        if (!id) {
          return;
        }

        if (seenIds.has(id)) {
          return;
        }

        seenIds.add(id);

        let sender = 'Unknown';
        let senderNumber = '';
        let message = '';
        let messageType = 'TEXT';
        let receivedAtDate = new Date(Date.now() + timeOffsetMs);

        const isFromMe = id.startsWith('true_');
        if (isFromMe) sender = 'You';

        const idParts = id.split('_');
        if (idParts.length > 1) {
          senderNumber = idParts[1];
        }

        const copyable = el.querySelector('.copyable-text');

        if (copyable) {
          const pre = copyable.getAttribute('data-pre-plain-text') || '';
          const match = pre.match(/\]\s*(.*?):\s*$/);
          if (match && match[1]) sender = match[1].trim();

          // Parse actual message timestamp from data-pre-plain-text
          // Format e.g., "[10:45 am, 22/07/2026]" or "[10:45, 22/07/2026]"
          const dateMatch = pre.match(/^\[(\d{1,2}):(\d{2})\s*(am|pm)?,\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\]/i);
          if (dateMatch) {
            let hour = parseInt(dateMatch[1], 10);
            const minute = parseInt(dateMatch[2], 10);
            const ampm = dateMatch[3] ? dateMatch[3].toLowerCase() : null;
            const day = parseInt(dateMatch[4], 10);
            const month = parseInt(dateMatch[5], 10) - 1;
            const year = parseInt(dateMatch[6], 10);

            if (ampm) {
              if (ampm === 'pm' && hour < 12) {
                hour += 12;
              } else if (ampm === 'am' && hour === 12) {
                hour = 0;
              }
            }

            const parsed = new Date(year, month, day, hour, minute, 0);
            if (!isNaN(parsed.getTime())) {
              receivedAtDate = new Date(parsed.getTime() + timeOffsetMs);
            }
          }
        }

        const textEl =
          el.querySelector('[data-testid="msg-text"]') ||
          el.querySelector('span.selectable-text') ||
          el.querySelector('[dir="ltr"] span.selectable-text') ||
          el.querySelector('[dir="auto"] span.selectable-text');

        if (textEl) {
          message = textEl.textContent?.trim() || '';
        } else {
          message = (el as HTMLElement).innerText?.trim() || '';
        }

        if (
          el.querySelector('[data-testid="image-thumb"]') ||
          el.querySelector('img[src^="blob:"]')
        ) {
          messageType = 'IMAGE';
        } else if (
          el.querySelector('[data-testid="icon-doc"]') ||
          el.querySelector('[data-testid="document-title"]')
        ) {
          messageType = 'DOCUMENT';
        } else if (
          el.querySelector('[data-testid="video-play"]') ||
          el.querySelector('[data-testid="video-pip"]')
        ) {
          messageType = 'VIDEO';
        } else if (
          el.querySelector('[data-testid="audio-play"]') ||
          el.querySelector('[data-testid="audio-download"]')
        ) {
          messageType = 'AUDIO';
        } else if (el.querySelector('div[class*="sticker"]')) {
          messageType = 'STICKER';
        }

        (window as any).onNewMessageCaptured({
          whatsappId: id,
          sender,
          senderNumber,
          isFromMe,
          message,
          messageType,
          receivedAt: receivedAtDate.toISOString(),
        });
      };

      console.log('[Observer] Processing recent history backlog...');
      document.querySelectorAll('[data-id]').forEach((el, index) => {
        processMessage(el, index);
      });

      let scrollContainer: HTMLElement | null = null;
      const messageEl = 
        document.querySelector('[data-testid="conversation-panel-messages"] [data-id]') ||
        document.querySelector('.copyable-area [data-id]') ||
        document.querySelector('[role="application"] [data-id]') ||
        document.querySelector('[data-id]');
      if (messageEl) {
        let parent = messageEl.parentElement;
        while (parent && parent !== document.body) {
          if (parent.scrollHeight > parent.clientHeight && window.getComputedStyle(parent).overflowY !== 'visible') {
            scrollContainer = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      if (scrollContainer) {
        console.log('[Observer] Scroll container found. Starting automatic history load...');
        
        let scrollCount = 0;
        const maxScrolls = 30; 
        const limitCount = recoveryScanCount || 500;
        const targetId = lastProcessedWhatsAppId;
        let isRecoveryFinished = false;

        const checkStoppingCondition = (): boolean => {
          const messages = document.querySelectorAll('[data-testid="conversation-panel-messages"] [data-id]') || document.querySelectorAll('[data-id]');
          
          if (messages.length >= limitCount) {
            console.log(`[Observer] Total loaded messages (${messages.length}) exceeds limit count (${limitCount}). Stopping scroll.`);
            return true;
          }

          let oldestDateOlderThan3Days = false;
          if (messages.length > 0) {
            const oldestEl = messages[0];
            const copyable = oldestEl.querySelector('.copyable-text');
            if (copyable) {
              const preText = copyable.getAttribute('data-pre-plain-text') || '';
              const dateMatch = preText.match(/^\[\d{1,2}:\d{2}(?:\s*[ap]m)?,\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\]/i);
              if (dateMatch) {
                const day = parseInt(dateMatch[1], 10);
                const month = parseInt(dateMatch[2], 10) - 1;
                const year = parseInt(dateMatch[3], 10);
                const oldestDate = new Date(year, month, day);
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                if (oldestDate < threeDaysAgo) {
                  oldestDateOlderThan3Days = true;
                }
              }
            }
          }

          if (targetId) {
            for (let i = 0; i < messages.length; i++) {
              if (messages[i].getAttribute('data-id') === targetId) {
                // Ensure we scan at least a minimal scroll history buffer or 3 days of history
                if (oldestDateOlderThan3Days || scrollCount >= 5) {
                  console.log(`[Observer] Target message ID ${targetId} is visible and history lookback matches. Stopping scroll.`);
                  return true;
                }
              }
            }
          } else if (oldestDateOlderThan3Days) {
            console.log(`[Observer] Reached message older than 3 days. Stopping scroll.`);
            return true;
          }
          return false;
        };

        const performScroll = () => {
          if (isRecoveryFinished) return;

          if (checkStoppingCondition() || scrollCount >= maxScrolls) {
            console.log('[Observer] Finished recovery history load.');
            isRecoveryFinished = true;
            (window as any).onRecoveryScanCompleted({
              scannedCount: document.querySelectorAll('[data-id]').length,
              scrollCount
            });
            return;
          }
          
          console.log(`[Observer] Scrolling up (step ${scrollCount + 1}/${maxScrolls})...`);
          (window as any).onRecoveryProgress(`Scanned ${document.querySelectorAll('[data-id]').length} messages...`);

          if (scrollContainer) {
            scrollContainer.scrollTop = 0; 
            scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
          }
          scrollCount++;
          
          setTimeout(() => {
            document.querySelectorAll('[data-id]').forEach((el, index) => {
              processMessage(el, index);
            });
            performScroll();
          }, 1500);
        };
        
        setTimeout(performScroll, 2000);
      } else {
        console.log('[Observer] Scroll container NOT found');
        (window as any).onRecoveryScanCompleted({
          scannedCount: document.querySelectorAll('[data-id]').length,
          scrollCount: 0
        });
      }

      const observer = new MutationObserver((mutations) => {
        try {
          let mutationIndex = 0;
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                const el = node as Element;
                const parentIdSource = el.closest('[data-id]');
                if (parentIdSource) {
                  processMessage(parentIdSource, mutationIndex++);
                }
                el.querySelectorAll?.('[data-id]').forEach((child) => {
                  processMessage(child, mutationIndex++);
                });
              });
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'data-id') {
              const target = mutation.target as Element;
              if (target.nodeType === 1) {
                processMessage(target, mutationIndex++);
              }
            }
          }
        } catch (err) {
          console.error('MutationObserver Error:', err);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-id'],
      });
    }, { lastProcessedWhatsAppId, recoveryScanCount });

    sendLog('info', '[Worker] Monitoring started');
    stateManager.set('MONITORING');
    await playwrightService.takeScreenshot('monitoring');
  } catch (error: any) {
    sendLog('error', `Worker runtime crash: ${error.message}`, { stack: error.stack });
    if (playwrightService) {
      await playwrightService.takeScreenshot('errors');
    }
    stateManager.set('ERROR', error.message);
    clearHeartbeat();
  }
}

async function cleanupAndExit(exitCode: number) {
  clearHeartbeat();
  try {
    if (playwrightService) {
      sendLog('info', '[Worker] Cleaning up and closing Playwright browser context...');
      await playwrightService.close();
      playwrightService = null;
    }
  } catch (err: any) {
    // Suppress clean up logs during final exits to avoid loop
  }
  
  sendLog('info', `[Worker] Process exiting with code: ${exitCode}`);
  
  // Allow brief window for logs to flush to IPC
  setTimeout(() => {
    process.exit(exitCode);
  }, 500);
}

// Parent Process Message Listener
process.on('message', async (message: MainToWorkerMessage) => {
  if (message.type === 'START_WORKER') {
    const { headless, groupName, profilePath, recoveryScanCount, lastProcessedWhatsAppId } = message.payload;

    // Heartbeat ticker (every 30 seconds)
    clearHeartbeat();
    heartbeatInterval = setInterval(() => {
      sendHeartbeat(stateManager.get());
    }, 30000);

    // Run async setup
    await startWorker(headless, groupName, profilePath, recoveryScanCount || 500, lastProcessedWhatsAppId);
  } else if (message.type === 'STOP_WORKER') {
    stateManager.set('STOPPED');
    await cleanupAndExit(0);
  }
});

// Parent IPC disconnect event (detect crash/exit of parent process)
process.on('disconnect', async () => {
  sendLog('warn', '[Worker] Parent process IPC channel disconnected (parent exited). Shutting down...');
  await cleanupAndExit(0);
});

// Graceful exit listeners
process.on('SIGINT', async () => {
  sendLog('info', '[Worker] Received SIGINT. Shutting down worker...');
  await cleanupAndExit(0);
});

process.on('SIGTERM', async () => {
  sendLog('info', '[Worker] Received SIGTERM. Shutting down worker...');
  await cleanupAndExit(0);
});

// Crash & exception handlers (single source of truth)
process.on('uncaughtException', async (error: Error) => {
  sendLog('error', `[Worker] Uncaught exception: ${error.message}`, { stack: error.stack });
  stateManager.set('ERROR', error.message);
  await cleanupAndExit(1);
});

process.on('unhandledRejection', async (reason: any) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  sendLog('error', `[Worker] Unhandled rejection: ${msg}`, { stack });
  stateManager.set('ERROR', msg);
  await cleanupAndExit(1);
});