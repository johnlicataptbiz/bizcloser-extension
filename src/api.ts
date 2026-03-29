/**
 * API client for BizCloser backend communication
 */

import {
  BackendResponse,
  ConversationAnalysis,
  ExtensionError,
  LocalHistorySnapshot,
  LocalMeasurementSnapshot,
  RefineReplyResult
} from '../types/index';
import { logger } from './logger';

const API_BASE_URLS = [
  'https://bizcloser-backend.vercel.app/api/bizcloser',
  'https://bizcloser-backend-bdm6kz35v-jack-licatas-projects.vercel.app/api/bizcloser',
  'http://localhost:3000/api/bizcloser'
] as const;

let preferredApiBaseUrl: string | null = null;

type ApiRoute = 'analyze' | 'generate' | 'refine' | 'feedback' | 'history' | 'history-sync';

async function getConfiguredApiBaseUrls(): Promise<string[]> {
  try {
    const stored = await chrome.storage.local.get(['backendUrl']);
    const configuredUrl = typeof stored.backendUrl === 'string' ? stored.backendUrl.trim() : '';
    const configuredBase = normalizeApiBaseUrl(configuredUrl);

    if (preferredApiBaseUrl) {
      return [preferredApiBaseUrl, configuredBase, ...API_BASE_URLS]
        .filter((url): url is string => Boolean(url))
        .filter((url, index, urls) => urls.indexOf(url) === index);
    }

    return [configuredBase, ...API_BASE_URLS]
      .filter((url): url is string => Boolean(url))
      .filter((url, index, urls) => urls.indexOf(url) === index);
  } catch (error) {
    logger.warn('Failed to read backend URL from storage, using defaults', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return [...API_BASE_URLS];
  }
}

function normalizeApiBaseUrl(value: string): string | null {
  if (!value) return null;

  const resolvedUrl = toAbsoluteHttpUrl(value);
  if (!resolvedUrl) {
    logger.warn('Ignoring invalid backend URL from storage', { value });
    return null;
  }

  const trimmed = resolvedUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/bizcloser')) {
    return trimmed;
  }

  if (trimmed.endsWith('/api/bizcloser/')) {
    return trimmed.slice(0, -1);
  }

  if (trimmed.endsWith('/api')) {
    return `${trimmed}/bizcloser`;
  }

  return `${trimmed}/api/bizcloser`;
}

function toAbsoluteHttpUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function callBackend<T>(route: ApiRoute, payload: unknown, responseValidator: (data: T) => void): Promise<T> {
  const baseUrls = await getConfiguredApiBaseUrls();
  let lastError: ExtensionError | null = null;

  for (const baseUrl of baseUrls) {
    const endpoint = `${baseUrl}/${route}`;

    try {
      logger.debug('Calling backend endpoint', { route, endpoint });

      const response = await fetch(endpoint, {
        method: route === 'history' ? 'POST' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'BizCloser-Extension/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const details = await response.text().catch(() => '');
        throw new ExtensionError(
          details || `Backend request failed: ${response.status} ${response.statusText}`,
          'API_ERROR',
          response.status
        );
      }

      const data = await response.json() as T;
      responseValidator(data);

      if (preferredApiBaseUrl !== baseUrl) {
        preferredApiBaseUrl = baseUrl;
      }

      return data;
    } catch (error) {
      const extensionError = error instanceof ExtensionError
        ? error
        : new ExtensionError(
            error instanceof Error ? error.message : 'Unknown request error',
            'REQUEST_ERROR'
          );

      lastError = extensionError;
      logger.warn('Backend endpoint failed', {
        route,
        endpoint,
        error: extensionError.message,
        code: extensionError.code,
        statusCode: extensionError.statusCode
      });
    }
  }

  if (lastError?.code === 'API_ERROR') {
    throw new ExtensionError(lastError.message, lastError.code, lastError.statusCode);
  }

  throw new ExtensionError(
    `Unable to reach the BizCloser backend. Tried ${baseUrls.length} endpoint${baseUrls.length === 1 ? '' : 's'}.`,
    'NETWORK_ERROR'
  );
}

export async function handleAnalyzeConversation(thread: string): Promise<ConversationAnalysis> {
  try {
    logger.debug('Making API request to analyze conversation', {
      threadLength: thread.length
    });

    const data = await callBackend<ConversationAnalysis>(
      'analyze',
      { thread: thread.trim() },
      (responseData) => {
        if (!responseData.intent || !Array.isArray(responseData.objections) || !responseData.recommendedAngle) {
          throw new ExtensionError('Invalid analysis response format', 'INVALID_RESPONSE');
        }
      }
    );

    return data;
  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Analysis request failed', { error: message });

    if (error instanceof TypeError && message.includes('fetch')) {
      throw new ExtensionError('Network error: Unable to connect to backend', 'NETWORK_ERROR');
    }

    throw new ExtensionError(`Request failed: ${message}`, 'REQUEST_ERROR');
  }
}

/**
 * Generates a reply using the BizCloser backend
 * @param thread - The conversation thread
 * @returns Promise resolving to the backend response
 * @throws ExtensionError on failure
 */
export async function handleGenerateReply(thread: string): Promise<BackendResponse> {
  try {
    logger.debug('Making API request to generate reply', {
      threadLength: thread.length
    });

    const data = await callBackend<BackendResponse>(
      'generate',
      { thread: thread.trim() },
      (responseData) => {
        if (!responseData.reply || typeof responseData.reply !== 'string') {
          throw new ExtensionError('Invalid response format: missing or invalid reply', 'INVALID_RESPONSE');
        }

        if (responseData.reply.trim().length === 0) {
          throw new ExtensionError('Generated reply is empty', 'EMPTY_REPLY');
        }
      }
    );

    logger.info('Reply generated successfully', {
      replyLength: data.reply.length
    });

    return data;

  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }

    // Network or other errors
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('API request failed', { error: message });

    if (error instanceof TypeError && message.includes('fetch')) {
      throw new ExtensionError('Network error: Unable to connect to backend', 'NETWORK_ERROR');
    }

    throw new ExtensionError(`Request failed: ${message}`, 'REQUEST_ERROR');
  }
}

export async function handleRefineReply(
  thread: string,
  draftReply: string,
  analysis?: ConversationAnalysis,
  editInstruction?: string
): Promise<RefineReplyResult> {
  try {
    logger.debug('Making API request to refine reply', {
      threadLength: thread.length,
      draftLength: draftReply.length
    });

    const data = await callBackend<RefineReplyResult>(
      'refine',
      {
        thread: thread.trim(),
        draftReply: draftReply.trim(),
        analysis,
        editInstruction
      },
      (responseData) => {
        if (!responseData.reply || typeof responseData.reply !== 'string') {
          throw new ExtensionError('Invalid refine response format', 'INVALID_RESPONSE');
        }
      }
    );

    return {
      reply: data.reply.trim(),
      changes: Array.isArray(data.changes) ? data.changes : [],
      verdict: typeof data.verdict === 'string' ? data.verdict : 'Reply refined.'
    };
  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Refine request failed', { error: message });

    if (error instanceof TypeError && message.includes('fetch')) {
      throw new ExtensionError('Network error: Unable to connect to backend', 'NETWORK_ERROR');
    }

    throw new ExtensionError(`Request failed: ${message}`, 'REQUEST_ERROR');
  }
}

export async function handleSaveHistory(payload: {
  thread: string;
  reply: string;
  analysis?: ConversationAnalysis;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true }> {
  try {
    await callBackend<{ ok?: boolean }>('history', payload, (data) => {
      if (data.ok !== true) {
        throw new ExtensionError('History save was not accepted', 'INVALID_RESPONSE');
      }
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ExtensionError) {
      logger.warn('History endpoint failed; attempting feedback fallback', {
        error: error.message,
        statusCode: error.statusCode
      });

      await callBackend<{ ok?: boolean }>('feedback', {
        stage: 'refine',
        sentiment: 'up',
        thread: payload.thread,
        analysisSummary: payload.analysis?.summary,
        generatedReply: payload.reply,
        refinedReply: payload.reply,
        note: 'history-fallback-write',
        meta: {
          source: 'history-fallback',
          ...(payload.metadata || {}),
          analysis: payload.analysis || null
        }
      }, (data) => {
        if (data.ok !== true) {
          throw new ExtensionError('Fallback feedback write was not accepted', 'INVALID_RESPONSE');
        }
      });

      return { ok: true };
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('History save request failed', { error: message });
    throw new ExtensionError(`Request failed: ${message}`, 'REQUEST_ERROR');
  }
}

export async function handleSyncLocalData(payload: {
  history: LocalHistorySnapshot[];
  measurements: LocalMeasurementSnapshot[];
}): Promise<{ ok: true; historySaved: number; measurementsSaved: number }> {
  const syncViaLegacyHistoryEndpoint = async () => {
    let historySaved = 0;
    let measurementsSaved = 0;

    for (const entry of payload.history) {
      await handleSaveHistory({
        thread: entry.thread,
        reply: entry.reply,
        analysis: entry.analysis,
        metadata: {
          source: 'local-history-sync',
          localSyncId: entry.id,
          ...(entry.metadata || {})
        }
      });
      historySaved += 1;
    }

    for (const entry of payload.measurements) {
      await handleSaveHistory({
        thread: `[local-measurement:${entry.sessionId}]`,
        reply: entry.latestSignal || 'Local measurement snapshot',
        metadata: {
          source: 'local-measurements-sync',
          localSyncId: entry.id,
          sessionId: entry.sessionId,
          threadLength: entry.threadLength,
          hadAnalysis: entry.hadAnalysis,
          firstDraftGenerated: entry.firstDraftGenerated,
          refineApplied: entry.refineApplied,
          alignmentCorrectionUsed: entry.alignmentCorrectionUsed,
          copied: entry.copied,
          manuallyEdited: entry.manuallyEdited,
          latestSignal: entry.latestSignal || null,
          replyFeedback: entry.replyFeedback || null,
          replyFeedbackStage: entry.replyFeedbackStage || null
        }
      });
      measurementsSaved += 1;
    }

    return { ok: true as const, historySaved, measurementsSaved };
  };

  try {
    const data = await callBackend<{ ok?: boolean; historySaved?: number; measurementsSaved?: number }>(
      'history-sync',
      payload,
      (responseData) => {
        if (responseData.ok !== true) {
          throw new ExtensionError('Local data sync was not accepted', 'INVALID_RESPONSE');
        }
      }
    );

    return {
      ok: true,
      historySaved: Number(data.historySaved || 0),
      measurementsSaved: Number(data.measurementsSaved || 0)
    };
  } catch (error) {
    if (error instanceof ExtensionError) {
      const isMissingRoute = error.statusCode === 404 || /404|not found/i.test(error.message);
      if (isMissingRoute) {
        logger.warn('history-sync route unavailable; using legacy /history fallback');
        return syncViaLegacyHistoryEndpoint();
      }
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Local data sync request failed', { error: message });
    throw new ExtensionError(`Request failed: ${message}`, 'REQUEST_ERROR');
  }
}

export async function handleSubmitFeedback(payload: {
  stage: 'analysis' | 'reply' | 'refine';
  sentiment: 'up' | 'down';
  thread: string;
  analysisSummary?: string;
  generatedReply?: string;
  refinedReply?: string;
  note?: string;
  meta?: Record<string, unknown>;
}): Promise<{ ok: true }> {
  try {
    await callBackend<{ ok?: boolean }>('feedback', payload, (data) => {
      if (data.ok !== true) {
        throw new ExtensionError('Feedback was not accepted by backend', 'INVALID_RESPONSE');
      }
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('Feedback request failed', { error: message });
    throw new ExtensionError(`Request failed: ${message}`, 'REQUEST_ERROR');
  }
}

/**
 * Checks if the backend is reachable
 * @returns Promise resolving to true if reachable
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const baseUrls = await getConfiguredApiBaseUrls();

    for (const baseUrl of baseUrls) {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: 'GET',
          headers: {
            'User-Agent': 'BizCloser-Extension/1.0'
          }
        });

        if (response.ok) {
          return true;
        }
      } catch (error) {
        logger.debug('Backend health check failed for endpoint', {
          baseUrl,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return false;
  } catch {
    return false;
  }
}
