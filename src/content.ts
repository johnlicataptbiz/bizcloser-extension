/**
 * BizCloser Content Script
 * Extracts conversation threads from supported platforms
 */

import { ExtractConversationMessage, ConversationResponse, MessageSelector, ExtensionError } from '../types/index';
import { logger } from './logger';

logger.info('BizCloser content script loaded', {
  url: window.location.href,
  chromeAvailable: typeof chrome !== 'undefined',
  chromeTabsAvailable: typeof chrome !== 'undefined' && !!chrome.tabs,
  chromeRuntimeAvailable: typeof chrome !== 'undefined' && !!chrome.runtime
});

/**
 * Extracts conversation threads from the current page based on hostname
 * @returns The extracted conversation thread or null if not found
 */
function extractConversationFromPage(): string | null {
  logger.debug('Extracting conversation from page');

  const hostname = window.location.hostname.toLowerCase();

  if (hostname.includes('slack.com')) {
    return extractFromSlack();
  } else if (hostname.includes('twilio.com')) {
    return extractFromTwilio();
  } else {
    logger.debug('Using generic extraction path for unsupported host', { hostname });
    return extractGenericConversation();
  }
}

/**
 * Extracts messages from Slack's DOM
 * @returns Joined messages or null
 */
function extractFromSlack(): string | null {
  logger.debug('Attempting Slack extraction');

  const messageSelectors: MessageSelector[] = [
    // Modern Slack message containers
    { selector: '[data-qa="virtual-list-item"]' },
    { selector: '[data-qa="message_content"]' },
    { selector: '[data-qa="message-text"]' },
    { selector: '.c-message_kit__message' },
    { selector: '.c-message__body' },
    { selector: '.p-message_pane__message' },
    { selector: '.c-message_kit__text' },
    { selector: '.c-message__content' },
    // Fallback selectors
    { selector: '[role="article"]' },
    { selector: '.c-virtual_list__item' },
    { selector: '.c-message_kit__blocks_for_browser' }
  ];

  const messages = extractMessages(messageSelectors, 'slack');
  logger.debug(`Slack extraction found ${messages.length} messages`);

  return messages.length > 0 ? messages.join('\n\n') : null;
}

/**
 * Extracts messages from Twilio's DOM
 * @returns Joined messages or null
 */
function extractFromTwilio(): string | null {
  logger.debug('Attempting Twilio extraction');

  const messageSelectors: MessageSelector[] = [
    // Modern Twilio selectors
    { selector: '[data-test-id="message-item"]' },
    { selector: '[data-testid="message-item"]' },
    { selector: '.message-bubble' },
    { selector: '.message-body' },
    { selector: '.Twilio-Message-Bubble-Body' },
    { selector: '.MuiListItem-root' },
    // Generic message containers
    { selector: '[role="listitem"]' },
    { selector: '.sms-message' },
    { selector: '.chat-message__body' },
    { selector: '.message-content' },
    { selector: '.message-item' },
    // Fallback
    { selector: '[role="article"]' }
  ];

  const messages = extractMessages(messageSelectors, 'twilio');
  logger.debug(`Twilio extraction found ${messages.length} messages`);

  return messages.length > 0 ? messages.join('\n\n') : null;
}

/**
 * Generic conversation extraction for unsupported platforms
 * @returns Joined messages or null
 */
function extractGenericConversation(): string | null {
  logger.debug('Attempting generic conversation extraction');

  const genericSelectors: MessageSelector[] = [
    { selector: '[role="listitem"]' },
    { selector: '.message' },
    { selector: '.chat-message' },
    { selector: '.conversation-item' },
    { selector: '[data-message]' },
    { selector: '.post' },
    { selector: '.comment' }
  ];

  const messages = extractMessages(genericSelectors, 'generic');
  logger.debug(`Generic extraction found ${messages.length} messages`);

  return messages.length > 0 ? messages.join('\n\n') : null;
}

/**
 * Generic message extraction utility
 * @param selectors - Array of selectors to try
 * @returns Array of extracted message texts
 */
function extractMessages(selectors: MessageSelector[], source: 'slack' | 'twilio' | 'generic'): string[] {
  const messages: string[] = [];
  const seenTexts = new Set<string>();

  for (const { selector, textExtractor } of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      logger.debug(`Selector "${selector}" found ${elements.length} elements`);

      elements.forEach((element) => {
        let text: string;

        if (textExtractor) {
          text = textExtractor(element);
        } else {
          text = extractNodeText(element as HTMLElement, source);
        }

        text = normalizeMessageText(text);

        // Filter out very short or very long text
        if (text && text.length > 5 && text.length < 3000) {
          // Avoid duplicates
          if (!seenTexts.has(text)) {
            messages.push(text);
            seenTexts.add(text);
          }
        }
      });
    } catch (error) {
      logger.warn(`Error with selector "${selector}"`, { error: (error as Error).message });
    }
  }

  return messages;
}

/**
 * Extracts the most useful text from a node, with platform-specific cleanup.
 */
function extractNodeText(element: HTMLElement, source: 'slack' | 'twilio' | 'generic'): string {
  const candidates: string[] = [];

  switch (source) {
    case 'slack':
      candidates.push(
        element.querySelector('[data-qa="message-text"]')?.textContent || '',
        element.querySelector('.c-message_kit__text')?.textContent || '',
        element.querySelector('.c-message__content')?.textContent || '',
        element.innerText || '',
      );
      break;
    case 'twilio':
      candidates.push(
        element.querySelector('.message-body')?.textContent || '',
        element.querySelector('.Twilio-Message-Bubble-Body')?.textContent || '',
        element.querySelector('.message-content')?.textContent || '',
        element.innerText || '',
      );
      break;
    default:
      candidates.push(element.innerText || element.textContent || '');
      break;
  }

  return normalizeMessageText(candidates.find(Boolean) || '');
}

/**
 * Normalizes extracted message text so the thread reads cleanly.
 * Collapses repeated whitespace and strips obvious empty lines.
 */
function normalizeMessageText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Message listener for communication with side panel
chrome.runtime.onMessage.addListener((
  request: ExtractConversationMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ConversationResponse) => void
): boolean => {
  logger.debug('Content script received message', { action: request.action, chromeTabsAvailable: !!chrome.tabs });

  if (request.action === 'extractConversation') {
    try {
      const conversation = extractConversationFromPage();

      if (conversation) {
        logger.info('Successfully extracted conversation', { length: conversation.length });
        sendResponse({
          conversation,
          success: true
        });
      } else {
        logger.warn('No conversation extracted');
        sendResponse({
          conversation: null,
          success: false,
          error: 'No conversation found on this page. Try a supported thread view.'
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error extracting conversation', { error: message });
      sendResponse({
        conversation: null,
        success: false,
        error: message
      });
    }
  }

  // Return true to indicate asynchronous response
  return true;
});

logger.info('BizCloser content script initialized and listening for messages');
