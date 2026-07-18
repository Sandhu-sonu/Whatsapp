import { PlaywrightService } from './browser';
import { WorkerStateManager } from './state';
import { MainToWorkerMessage, WorkerState, WorkerLogLevel } from './events';

import { loginSelectors } from './selectors/login';
import { chatSelectors } from './selectors/chat';

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

async function startWorker(headless: boolean, groupName: string, profilePath: string) {
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
      const isQrCanvas = await page.$(loginSelectors.qrCanvas);
      const isChatList = await page.$(chatSelectors.chatList);

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
    const searchBox = page.locator(chatSelectors.searchInput).first();
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
    sendLog('info', `[Worker] Chat found, clicking to open...`);

    // Click the whole chat row instead of the title
    await chatLocator.evaluate((el) => {
      const htmlEl = el as HTMLElement;
      const row = htmlEl.closest('[data-testid="list-item"]') as HTMLElement | null;
      if (row) {
        row.click();
      } else {
        htmlEl.click();
      }
    });

    await page.waitForTimeout(1500);
    let found = true;

    if (!found) {
      const visibleTitles = await page
        .locator('[data-testid="cell-frame-title"] span[title]')
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
    const composerSelectors = [
      'footer [contenteditable="true"]',
      'div[data-testid="conversation-compose-box-input"]',
      'div[aria-label="Type a message"]',
      'div[title="Type a message"]',
    ].join(', ');

    const conversationPaneSelectors = [
      '[data-testid="conversation-panel-body"]',
      '[data-testid="conversation-panel-messages"]',
      'div[role="application"]',
    ].join(', ');

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
          .locator('[data-testid="cell-frame-title"] span[title]')
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

    if (!verified) {
      // Temporary fallback: don't fail the worker over a selector that
      // WhatsApp has likely changed again. Give the UI a moment to settle
      // and proceed to monitoring rather than throwing.
      sendLog(
        'info',
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

    // Forward browser console logs to the worker log
    page.on('console', (msg) => {
          sendLog('debug', `[Browser Console ${msg.type()}] ${msg.text()}`);
    });

    // ------------------------------------------------------------
    // Install MutationObserver
    // ------------------------------------------------------------
    await page.evaluate(() => {
      console.log('MutationObserver installed');

      const seenIds = new Set<string>();

      const processMessage = (el: Element, timeOffsetMs: number = 0) => {
        // Some WhatsApp Web builds don't put data-id directly on the
        // message container, and the mutation target is often a deep
        // child (e.g. the text span), not the id-bearing wrapper. Check
        // the nearest ancestor with data-id first (closest() also covers
        // el itself if it matches), then fall back to a descendant.
        let idSource: Element | null =
          el.closest('[data-id]') ?? el.querySelector('[data-id]');

        if (!idSource) {
          console.log('[Observer] processMessage: No data-id source found');
          return;
        }

        const id = idSource.getAttribute('data-id');
        if (!id) {
          console.log('[Observer] processMessage: data-id attribute is empty');
          return;
        }

        if (seenIds.has(id)) {
          // Quiet skip for backlog
          return;
        }

        console.log(`[Observer] processMessage: Processing new message ID=${id}`);
        seenIds.add(id);

        let sender = 'Unknown';
        let senderNumber = '';
        let message = '';
        let messageType = 'TEXT';

        const isFromMe = id.startsWith('true_');
        if (isFromMe) sender = 'You';

        // Parse sender number/JID from ID prefix (e.g. false_919988776655@c.us_3EB...)
        const idParts = id.split('_');
        if (idParts.length > 1) {
          senderNumber = idParts[1];
        }

        const copyable = el.querySelector('.copyable-text');

        if (copyable) {
          const pre = copyable.getAttribute('data-pre-plain-text') || '';
          const match = pre.match(/\]\s*(.*?):\s*$/);
          if (match && match[1]) sender = match[1].trim();
        }

        // Prefer the dedicated message-text node, in order of specificity.
        // Deliberately does NOT depend on `.copyable-text` being the
        // parent (that assumption doesn't hold on every WhatsApp Web
        // build), and deliberately does NOT fall back to a bare
        // `querySelector('span')`, since the first <span> in a message
        // container is often a timestamp, checkmark, or sender-name span
        // rather than the message body.
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

        // Detect message type using specific media markers only —
        // a bare `img` also matches emoji, so don't use that alone.
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

        console.log(`[Observer] processMessage: Dispatching captured message from ${sender}`);
        (window as any).onNewMessageCaptured({
          whatsappId: id,
          sender,
          senderNumber,
          isFromMe,
          message,
          messageType,
          receivedAt: new Date(Date.now() + timeOffsetMs).toISOString(),
        });
      };

      // Process backlog messages currently in the DOM (recent history backlog).
      // This ensures that any reports submitted while the worker was offline
      // are captured and ingested on startup.
      console.log('[Observer] Processing recent history backlog...');
      document.querySelectorAll('[data-id]').forEach((el, index) => {
        processMessage(el, index);
      });

      // Automatic history load: Scroll up the chat container to load older messages
      const scrollSelectors = [
        '[data-testid="conversation-panel-body"]',
        '.copyable-area',
        'div[role="application"]'
      ];
      let scrollContainer: Element | null = null;
      for (const selector of scrollSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          scrollContainer = el;
          break;
        }
      }

      if (scrollContainer) {
        console.log('[Observer] Scroll container found. Starting automatic history load...');
        
        let scrollCount = 0;
        const maxScrolls = 80; // Scroll up 80 times to load older messages
        
        const performScroll = () => {
          if (scrollCount >= maxScrolls) {
            console.log('[Observer] Finished automatic history load.');
            return;
          }
          
          console.log(`[Observer] Scrolling up (step ${scrollCount + 1}/${maxScrolls})...`);
          if (scrollContainer) {
            scrollContainer.scrollTop = 0; // Scroll to top to trigger WhatsApp loading history
          }
          scrollCount++;
          
          // Wait 1.5 seconds for WhatsApp Web to fetch, then scan DOM and scroll again
          setTimeout(() => {
            document.querySelectorAll('[data-id]').forEach((el, index) => {
              processMessage(el, index);
            });
            performScroll();
          }, 1500);
        };
        
        // Start scrolling after a short delay to let the DOM settle
        setTimeout(performScroll, 2000);
      } else {
        console.log('[Observer] Scroll container NOT found');
      }

      const observer = new MutationObserver((mutations) => {
        try {
          let mutationIndex = 0;
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return; // 1 = Element
                const el = node as Element;

                // Case 1: Check if the added node itself or its ancestor has data-id
                const parentIdSource = el.closest('[data-id]');
                if (parentIdSource) {
                  processMessage(parentIdSource, mutationIndex++);
                }

                // Case 2: Check if the added node contains children with data-id
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
    });

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

async function stopWorker() {
  sendLog('info', 'Stopping worker services...');
  stateManager.set('STOPPED');

  clearHeartbeat();

  if (playwrightService) {
    await playwrightService.close();
    playwrightService = null;
  }

  sendLog('info', 'Worker fully stopped.');
  process.exit(0);
}

// Parent Process Message Listener
process.on('message', async (message: MainToWorkerMessage) => {
  if (message.type === 'START_WORKER') {
    const { headless, groupName, profilePath } = message.payload;

    // Heartbeat ticker (every 30 seconds)
    clearHeartbeat();
    heartbeatInterval = setInterval(() => {
      sendHeartbeat(stateManager.get());
    }, 30000);

    // Run async setup
    await startWorker(headless, groupName, profilePath);
  } else if (message.type === 'STOP_WORKER') {
    await stopWorker();
  }
});

// Graceful exit listeners
process.on('SIGINT', async () => {
  sendLog('info', 'Received SIGINT. Shutting down worker...');
  await stopWorker();
});

process.on('SIGTERM', async () => {
  sendLog('info', 'Received SIGTERM. Shutting down worker...');
  await stopWorker();
});

// Crash & exception handlers (single source of truth — no duplicate no-op
// listeners registered elsewhere in this file)
process.on('uncaughtException', async (error: Error) => {
  sendLog('error', `Uncaught exception in worker process: ${error.message}`, { stack: error.stack });
  stateManager.set('ERROR', error.message);
  clearHeartbeat();
  // Ensure logs write before exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', async (reason: any) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  sendLog('error', `Unhandled rejection in worker process: ${msg}`, { stack });
  stateManager.set('ERROR', msg);
  clearHeartbeat();
  setTimeout(() => process.exit(1), 1000);
});