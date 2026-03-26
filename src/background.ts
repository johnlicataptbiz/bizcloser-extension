/**
 * BizCloser Background Service Worker (Manifest V3)
 * Handles API requests and side panel behavior
 */

import { GenerateReplyMessage, GenerateReplyResponse, BackendResponse, ExtensionError } from '../types/index';
import { logger } from './logger';
import { handleGenerateReply } from './api';

// Initialize side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    logger.error('Failed to set panel behavior', { error: error.message });
  });

// Message listener for communication with side panel
chrome.runtime.onMessage.addListener((
  request: GenerateReplyMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: GenerateReplyResponse) => void
): boolean => {
  logger.debug('Background received message', { action: request.action });

  if (request.action === 'generateReply') {
    handleGenerateReply(request.thread)
      .then((data: BackendResponse) => {
        logger.info('Reply generation successful');
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.error('Reply generation failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    // Return true to indicate asynchronous response
    return true;
  }

  return false;
});

logger.info('BizCloser background service worker initialized');
