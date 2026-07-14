export const messagesSelectors = {
  // Message containers
  messageRow:
    '[data-testid="msg-container"], [data-id]',

  // Message text (try the newest selector first)
  messageText:
    '[data-testid="msg-text"], span.selectable-text',

  // Message metadata
  copyableText: '.copyable-text',

  // Media
  image: '[data-testid="image-thumb"]',
  video: '[data-testid="video-play"]',
  document: '[data-testid="icon-doc"]',
  audio: '[data-testid="audio-play"]',
};