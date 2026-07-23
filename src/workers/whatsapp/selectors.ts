export const SELECTORS = {
  // Login / Auth
  qrCanvas: 'canvas[data-ref]',
  qrContainer: 'div[data-ref]',

  // Chat list and Search
  chatList: '[aria-label="Chat list"]',
  searchInput: 'input[aria-label="Search or start a new chat"]',
  listItem: '[data-testid="list-item"]',
  cellFrameTitle: '[data-testid="cell-frame-title"] span[title]',

  // Composer / Input Verification
  composer: [
    'footer [contenteditable="true"]',
    'div[data-testid="conversation-compose-box-input"]',
    'div[aria-label="Type a message"]',
    'div[title="Type a message"]',
  ].join(', '),

  // Conversation panel
  conversationPanel: [
    '[data-testid="conversation-panel-body"]',
    '[data-testid="conversation-panel-messages"]',
    'div[role="application"]',
  ].join(', '),

  // Message selectors
  messageRow: '[data-testid="msg-container"], [data-id]',
  messageText: '[data-testid="msg-text"], span.selectable-text',
  copyableText: '.copyable-text',
  image: '[data-testid="image-thumb"]',
  video: '[data-testid="video-play"]',
  document: '[data-testid="icon-doc"]',
  audio: '[data-testid="audio-play"]',
};
