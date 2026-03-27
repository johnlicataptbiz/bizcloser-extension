/**
 * BizCloser Background Service Worker (Manifest V3)
 * Handles API requests and side panel behavior
 */

import {
  AnalyzeConversationMessage,
  AnalyzeConversationResponse,
  BackendResponse,
  ConversationResponse,
  ExtractConversationMessage,
  ExtractConversationResponse,
  ExtensionError,
  GenerateReplyMessage,
  GenerateReplyResponse,
  SyncLocalDataMessage,
  SyncLocalDataResponse,
  RefineReplyMessage,
  RefineReplyResponse,
  SaveHistoryMessage,
  OpenHubSpotNoteMessage,
  OpenHubSpotNoteResponse,
  SubmitFeedbackMessage,
  SubmitFeedbackResponse
} from '../types/index';
import { logger } from './logger';
import {
  handleAnalyzeConversation,
  handleGenerateReply,
  handleRefineReply,
  handleSaveHistory,
  handleSyncLocalData,
  handleSubmitFeedback
} from './api';

// Initialize side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    logger.error('Failed to set panel behavior', { error: error.message });
  });

async function extractConversationFromActiveTab(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab?.id) {
    throw new ExtensionError('No active tab found');
  }

  const selectedText = await extractSelectionFromTab(tab.id);
  if (selectedText) {
    return selectedText;
  }

  const contentScriptResponse = await tryExtractViaContentScript(tab.id);
  if (contentScriptResponse?.conversation) {
    return contentScriptResponse.conversation;
  }

  const visibleThread = await extractVisibleThreadFromTab(tab.id);
  if (visibleThread) {
    return visibleThread;
  }

  throw new ExtensionError(
    'No conversation found. In Aloware, highlight the thread first, then click Import Conversation.'
  );
}

async function extractSelectionFromTab(tabId: number): Promise<string | null> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selection = window.getSelection()?.toString() || '';
      return selection.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
    }
  });

  return typeof result === 'string' && result.length > 20 ? result : null;
}

function readNodeText(node: HTMLElement): string {
  return (node.textContent || node.innerText || '').trim();
}

async function tryExtractViaContentScript(tabId: number): Promise<ConversationResponse | null> {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: 'extractConversation' as ExtractConversationMessage['action'] });
  } catch (error) {
    logger.debug('Content script extraction unavailable, using executeScript fallback', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

async function extractVisibleThreadFromTab(tabId: number): Promise<string | null> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const normalize = (text: string): string => text
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      const isAlowareNoise = (line: string): boolean => (
        /^(Text|Fax|Email|Note|Send Text)$/i.test(line) ||
        /^Type your message$/i.test(line) ||
        /^Sent from /i.test(line) ||
        /^used .* personal line/i.test(line) ||
        /^to \+?\d+/i.test(line) ||
        /^from:/i.test(line) ||
        /^to:/i.test(line) ||
        /^primary$/i.test(line) ||
        /^sequence$/i.test(line) ||
        /^(Yesterday|Today), \d{1,2}:\d{2}\s?(AM|PM)/i.test(line) ||
        /\bEDT\b/i.test(line) ||
        /^\+?\d{10,}$/.test(line)
      );

      const cleanAlowareText = (text: string): string => {
        const lines = text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => !isAlowareNoise(line));

        return normalize(lines.join('\n'));
      };

      const findAlowareRoot = (): HTMLElement | null => {
        const composerCandidates = Array.from(
          document.querySelectorAll('textarea, input, [contenteditable="true"]')
        ) as HTMLElement[];
        const composer = composerCandidates.find((element) =>
          /type your message/i.test(element.getAttribute('placeholder') || '') ||
          /type your message/i.test(element.getAttribute('aria-label') || '')
        );

        if (!composer) return null;

        let current: HTMLElement | null = composer.parentElement;
        while (current) {
          const text = normalize(readNodeText(current));
          if (text.includes('Type your message') && /Sent from|Sequence|Yesterday|Today/.test(text)) {
            return current;
          }
          current = current.parentElement;
        }

        return null;
      };

      const hostname = window.location.hostname.toLowerCase();
      const isAloware = hostname.includes('aloware.com') || hostname.includes('aloware.io');
      const root = isAloware ? (findAlowareRoot() || document.body) : document.body;
      const selectors = isAloware
        ? [
            '[class*="bubble"]',
            '[class*="Bubble"]',
            '[data-testid*="message"]',
            '[data-test-id*="message"]',
            '[class*="message"]',
            '[class*="Message"]',
            '[class*="thread"]',
            '[class*="conversation"]',
            'article',
            '[role="article"]',
            'li'
          ]
        : ['[role="listitem"]', '.message', '.chat-message', '.conversation-item', '[data-message]', 'article'];

      const seen = new Set<string>();
      const messages: string[] = [];

      selectors.forEach((selector) => {
        root.querySelectorAll(selector).forEach((element) => {
          const raw = element instanceof HTMLElement ? readNodeText(element) : '';
          const text = isAloware ? cleanAlowareText(raw) : normalize(raw);

          if (text.length > 5 && text.length < 3000 && !seen.has(text)) {
            seen.add(text);
            messages.push(text);
          }
        });
      });

      if (messages.length > 0) {
        return messages.join('\n\n');
      }

      const rawPageText = root instanceof HTMLElement ? root.innerText || '' : document.body.innerText || '';
      const pageText = isAloware ? cleanAlowareText(rawPageText) : normalize(rawPageText);
      return pageText.length > 50 ? pageText : null;
    }
  });

  return typeof result === 'string' && result.length > 20 ? result : null;
}

async function findHubSpotProfileUrlFromTab(tabId: number): Promise<string | null> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const candidates = anchors
        .map((a) => a.href)
        .filter(Boolean)
        .filter((href) => /hubspot\.com/i.test(href));

      const profileCandidate = candidates.find((href) =>
        /app\.hubspot\.com\/contacts\/|\/record\/0-1\/|\/contact\//i.test(href)
      );

      if (profileCandidate) return profileCandidate;
      return candidates[0] || null;
    }
  });

  return typeof result === 'string' && result.length > 0 ? result : null;
}

async function openHubSpotNoteComposer(tabId: number): Promise<boolean> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const clickFirst = (selectors: string[]): boolean => {
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (node instanceof HTMLElement) {
            node.click();
            return true;
          }
        }
        return false;
      };

      const clickByText = (texts: string[]): boolean => {
        const elements = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [data-testid], [data-test-id]')) as HTMLElement[];
        for (const element of elements) {
          const text = (element.textContent || element.innerText || '').trim().toLowerCase();
          if (!text) continue;
          if (texts.some((needle) => text === needle || text.startsWith(needle))) {
            element.click();
            return true;
          }
        }
        return false;
      };

      for (let attempt = 0; attempt < 8; attempt++) {
        const selectorClicked = clickFirst([
          '[data-selenium-test="activity-compose"]',
          '[data-test-id="record-activity-tab"]',
          '[data-test-id="record-tab-activity"]',
          '[data-test-id="activity-tab"]',
          '[data-test-id="record-comment-button"]',
          '[data-test-id="record-note-button"]',
          '[aria-label*="Note"]',
          '[aria-label*="Log activity"]'
        ]);

        const textClicked = clickByText([
          'activity',
          'log activity',
          'note',
          'create note'
        ]);

        if (selectorClicked || textClicked) {
          await sleep(350);
          const noteClicked = clickByText(['note', 'create note']);
          if (noteClicked || selectorClicked) {
            return true;
          }
        }

        await sleep(700);
      }

      return false;
    }
  });

  return result === true;
}

async function handleOpenHubSpotNoteFromActiveTab(): Promise<{ profileUrl: string; noteComposerOpened: boolean }> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.id) {
    throw new ExtensionError('No active tab found.');
  }

  const profileUrl = await findHubSpotProfileUrlFromTab(activeTab.id);
  if (!profileUrl) {
    throw new ExtensionError('No HubSpot profile link found on this page.');
  }

  const createdTab = await chrome.tabs.create({ url: profileUrl, active: true });
  if (!createdTab.id) {
    throw new ExtensionError('Unable to open HubSpot profile tab.');
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12000);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === createdTab.id && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });

  let noteComposerOpened = false;
  try {
    noteComposerOpened = await openHubSpotNoteComposer(createdTab.id);
  } catch (error) {
    logger.warn('Could not auto-open HubSpot note composer', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return { profileUrl, noteComposerOpened };
}

// Message listener for communication with side panel
chrome.runtime.onMessage.addListener((
  request: GenerateReplyMessage | AnalyzeConversationMessage | ExtractConversationMessage | RefineReplyMessage | SubmitFeedbackMessage | SaveHistoryMessage | OpenHubSpotNoteMessage | SyncLocalDataMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: GenerateReplyResponse | AnalyzeConversationResponse | ExtractConversationResponse | RefineReplyResponse | SubmitFeedbackResponse | OpenHubSpotNoteResponse | SyncLocalDataResponse) => void
): boolean => {
  logger.debug('Background received message', { action: request.action });

  if (request.action === 'extractConversation') {
    extractConversationFromActiveTab()
      .then((conversation) => {
        logger.info('Conversation extraction successful', { length: conversation.length });
        sendResponse({ conversation });
      })
      .catch((error: ExtensionError) => {
        logger.error('Conversation extraction failed', { error: error.message });
        sendResponse({ conversation: null, error: error.message });
      });

    return true;
  }

  if (request.action === 'analyzeConversation') {
    handleAnalyzeConversation(request.thread)
      .then((data) => {
        logger.info('Conversation analysis successful');
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.error('Conversation analysis failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

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

  if (request.action === 'refineReply') {
    handleRefineReply(request.thread, request.draftReply, request.analysis, request.editInstruction)
      .then((data) => {
        logger.info('Reply refinement successful');
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.error('Reply refinement failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (request.action === 'submitFeedback') {
    handleSubmitFeedback({
      stage: request.stage,
      sentiment: request.sentiment,
      thread: request.thread,
      analysisSummary: request.analysisSummary,
      generatedReply: request.generatedReply,
      refinedReply: request.refinedReply,
      note: request.note,
      meta: request.meta
    })
      .then((data) => {
        logger.info('Feedback submission successful');
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.error('Feedback submission failed', { error: error.message });
      sendResponse({ error: error.message });
    });

    return true;
  }

  if (request.action === 'saveHistory') {
    handleSaveHistory({
      thread: request.thread,
      reply: request.reply,
      analysis: request.analysis,
      metadata: request.metadata
    })
      .then((data) => {
        logger.info('History saved successfully');
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.error('History save failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (request.action === 'openHubSpotNote') {
    handleOpenHubSpotNoteFromActiveTab()
      .then((data) => {
        logger.info('Opened HubSpot profile tab', { profileUrl: data.profileUrl, noteComposerOpened: data.noteComposerOpened });
        sendResponse({ data: { ok: true, profileUrl: data.profileUrl, noteComposerOpened: data.noteComposerOpened } });
      })
      .catch((error: ExtensionError) => {
        logger.error('Open HubSpot note flow failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (request.action === 'syncLocalData') {
    handleSyncLocalData({
      history: request.history,
      measurements: request.measurements
    })
      .then((data) => {
        logger.info('Local data sync successful', {
          historySaved: data.historySaved,
          measurementsSaved: data.measurementsSaved
        });
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.error('Local data sync failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

  return false;
});

logger.info('BizCloser background service worker initialized');
