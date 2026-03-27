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
  GetPageContextMessage,
  GetPageContextResponse,
  GenerateReplyMessage,
  GenerateReplyResponse,
  InsertReplyMessage,
  InsertReplyResponse,
  PageContext,
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

let lastKnownPageTabId: number | null = null;

function isSupportedPageUrl(url?: string): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

function isPreferredConversationHost(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes('aloware.com') ||
      host.includes('aloware.io') ||
      host.includes('hubspot.com') ||
      host.includes('slack.com') ||
      host.includes('twilio.com') ||
      host.includes('instagram.com') ||
      host.includes('facebook.com')
    );
  } catch {
    return false;
  }
}

async function getPreferredPageTab(): Promise<chrome.tabs.Tab> {
  if (lastKnownPageTabId !== null) {
    try {
      const rememberedTab = await chrome.tabs.get(lastKnownPageTabId);
      if (rememberedTab?.id && isSupportedPageUrl(rememberedTab.url)) {
        return rememberedTab;
      }
    } catch {
      lastKnownPageTabId = null;
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id && isSupportedPageUrl(activeTab.url)) {
    lastKnownPageTabId = activeTab.id;
    return activeTab;
  }

  const fallbackTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const preferredTab = fallbackTabs.find((tab) => tab.id && isSupportedPageUrl(tab.url) && isPreferredConversationHost(tab.url));
  const fallbackTab = preferredTab || fallbackTabs.find((tab) => tab.id && isSupportedPageUrl(tab.url));
  if (fallbackTab?.id) {
    lastKnownPageTabId = fallbackTab.id;
    return fallbackTab;
  }

  throw new ExtensionError('Open the CRM conversation tab first, then try again.');
}

// Initialize side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    logger.error('Failed to set panel behavior', { error: error.message });
  });

async function extractConversationFromActiveTab(): Promise<string> {
  const tab = await getPreferredPageTab();
  if (!tab.id) throw new ExtensionError('No active tab found');

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
    logger.debug('Content script extraction unavailable, attempting reinjection', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['dist/content.js']
      });

      return await chrome.tabs.sendMessage(tabId, {
        action: 'extractConversation' as ExtractConversationMessage['action']
      });
    } catch (retryError) {
      logger.debug('Content script reinjection failed, using executeScript fallback', {
        error: retryError instanceof Error ? retryError.message : 'Unknown error'
      });
      return null;
    }
  }
}

async function extractVisibleThreadFromTab(tabId: number): Promise<string | null> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const readNodeText = (node: HTMLElement): string => (node.textContent || node.innerText || '').trim();
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
        /^sequence\s*[:\-]?\s*(active|inactive|paused|stopped)$/i.test(line) ||
        /^(view|edit|add|remove)\s+sequence$/i.test(line) ||
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

function formatDomainLabel(hostname: string): string {
  const normalized = hostname.replace(/^www\./i, '').toLowerCase();
  const knownDomains: Array<{ suffix: string; label: string }> = [
    { suffix: 'aloware.com', label: 'Aloware' },
    { suffix: 'aloware.io', label: 'Aloware' },
    { suffix: 'instagram.com', label: 'Instagram' },
    { suffix: 'facebook.com', label: 'Facebook' },
    { suffix: 'hubspot.com', label: 'HubSpot' },
    { suffix: 'slack.com', label: 'Slack' },
    { suffix: 'twilio.com', label: 'Twilio' }
  ];

  const knownMatch = knownDomains.find(({ suffix }) => normalized === suffix || normalized.endsWith(`.${suffix}`));
  if (knownMatch) return knownMatch.label;

  const parts = normalized.split('.').filter(Boolean);
  const base = parts.length > 0 ? parts[0] : normalized;
  return base ? `${base.charAt(0).toUpperCase()}${base.slice(1)}` : 'Current Site';
}

async function getPageContextFromActiveTab(): Promise<PageContext> {
  const tab = await getPreferredPageTab();
  if (!tab?.id || !tab.url) {
    throw new ExtensionError('Open a website tab first, then try again.');
  }
  lastKnownPageTabId = tab.id;

  const parsedUrl = new URL(tab.url);
  const host = parsedUrl.hostname || 'unknown';

  return {
    host,
    domainLabel: formatDomainLabel(host),
    url: tab.url,
    faviconUrl: tab.favIconUrl || null
  };
}

async function insertReplyIntoActiveTab(reply: string): Promise<{ inserted: boolean; reason?: string }> {
  const tab = await getPreferredPageTab();
  if (!tab?.id) throw new ExtensionError('No active tab found.');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [reply],
    func: (rawReply: string) => {
      const text = (rawReply || '').trim();
      if (!text) {
        return { inserted: false, reason: 'Reply text is empty.' };
      }

      const normalizeFieldHint = (value: string | null | undefined): string =>
        (value || '').toLowerCase().replace(/\s+/g, ' ').trim();

      const hasMessagingHint = (value: string | null | undefined): boolean => {
        const hint = normalizeFieldHint(value);
        if (!hint) return false;
        return /\b(message|reply|note|comment|sms|chat|compose|inbox|thread|text your message|type your message)\b/i.test(hint);
      };

      const isLikelyComposerField = (node: HTMLElement): boolean => {
        if (node instanceof HTMLTextAreaElement) {
          return true;
        }

        if (node instanceof HTMLInputElement) {
          const type = (node.type || 'text').toLowerCase();
          if (!/^(text|search|email|url|tel)$/i.test(type)) return false;
          if (type === 'email') return false;

          const hints = [
            node.placeholder,
            node.getAttribute('aria-label'),
            node.getAttribute('title'),
            node.getAttribute('name'),
            node.id,
            node.className
          ];

          return hints.some((value) => hasMessagingHint(String(value || '')));
        }

        if (node.isContentEditable) {
          const hints = [
            node.getAttribute('aria-label'),
            node.getAttribute('data-placeholder'),
            node.getAttribute('title'),
            node.getAttribute('data-selenium-test'),
            node.getAttribute('data-test-id'),
            node.id,
            node.className
          ];

          return hints.some((value) => hasMessagingHint(String(value || ''))) ||
            node.getAttribute('role') === 'textbox';
        }

        return false;
      };

      const isVisible = (node: HTMLElement): boolean => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };

      const dispatchInputEvents = (node: HTMLElement): void => {
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const insertIntoTextField = (node: HTMLTextAreaElement | HTMLInputElement): boolean => {
        if (node.readOnly || node.disabled) return false;
        node.focus();

        const supportsSelection =
          typeof node.selectionStart === 'number' &&
          typeof node.selectionEnd === 'number' &&
          typeof node.setRangeText === 'function';

        if (supportsSelection) {
          const start = node.selectionStart ?? node.value.length;
          const end = node.selectionEnd ?? node.value.length;
          node.setRangeText(text, start, end, 'end');
        } else {
          const prefix = node.value && !node.value.endsWith('\n') ? '\n' : '';
          node.value = `${node.value || ''}${prefix}${text}`;
        }

        dispatchInputEvents(node);
        return true;
      };

      const insertIntoEditable = (node: HTMLElement): boolean => {
        if (!node.isContentEditable) return false;
        node.focus();

        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, text);
        } catch {
          inserted = false;
        }

        if (!inserted) {
          const prefix = node.textContent && node.textContent.trim().length > 0 ? '\n' : '';
          node.textContent = `${node.textContent || ''}${prefix}${text}`;
        }

        dispatchInputEvents(node);
        return true;
      };

      const tryInsert = (node: Element | null): boolean => {
        if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
        if (!isLikelyComposerField(node)) return false;
        if (node instanceof HTMLTextAreaElement) return insertIntoTextField(node);
        if (node instanceof HTMLInputElement && /^(text|search|email|url|tel)$/i.test(node.type || 'text')) {
          return insertIntoTextField(node);
        }
        return insertIntoEditable(node);
      };

      const activeElement = document.activeElement;
      if (activeElement && tryInsert(activeElement)) {
        return { inserted: true };
      }

      const host = window.location.hostname.toLowerCase();
      const selectors: string[] = [
        'textarea[placeholder*="message" i]',
        'textarea[aria-label*="message" i]',
        'textarea[placeholder*="reply" i]',
        'textarea[aria-label*="reply" i]',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][aria-label*="message" i]',
        '[contenteditable="true"]',
        'textarea'
      ];

      if (host.includes('hubspot.com')) {
        selectors.unshift(
          '[data-selenium-test="notetaker-input"]',
          '[data-test-id*="note"] [contenteditable="true"]',
          '[data-test-id*="compose"] textarea'
        );
      }

      if (host.includes('aloware.com') || host.includes('aloware.io')) {
        selectors.unshift(
          'textarea[placeholder*="type your message" i]',
          '[contenteditable="true"][aria-label*="message" i]'
        );
      }

      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          if (tryInsert(node)) {
            return { inserted: true };
          }
        }
      }

      return {
        inserted: false,
        reason: 'No editable message field was found on this page.'
      };
    }
  });

  return result || { inserted: false, reason: 'Unable to insert on this page.' };
}

// Message listener for communication with side panel
chrome.runtime.onMessage.addListener((
  request: GenerateReplyMessage | AnalyzeConversationMessage | ExtractConversationMessage | RefineReplyMessage | SubmitFeedbackMessage | SaveHistoryMessage | OpenHubSpotNoteMessage | SyncLocalDataMessage | GetPageContextMessage | InsertReplyMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: GenerateReplyResponse | AnalyzeConversationResponse | ExtractConversationResponse | RefineReplyResponse | SubmitFeedbackResponse | OpenHubSpotNoteResponse | SyncLocalDataResponse | GetPageContextResponse | InsertReplyResponse) => void
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

  if (request.action === 'getPageContext') {
    getPageContextFromActiveTab()
      .then((data) => {
        sendResponse({ data });
      })
      .catch((error: ExtensionError) => {
        logger.warn('Failed to resolve page context', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

  if (request.action === 'insertReply') {
    insertReplyIntoActiveTab(request.reply)
      .then((result) => {
        sendResponse({ data: { ok: true, inserted: result.inserted, reason: result.reason } });
      })
      .catch((error: ExtensionError) => {
        logger.error('Insert reply failed', { error: error.message });
        sendResponse({ error: error.message });
      });

    return true;
  }

  return false;
});

logger.info('BizCloser background service worker initialized');
