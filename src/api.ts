/**
 * API client for BizCloser backend communication
 */

import { BackendResponse, ConversationAnalysis, ExtensionError, RefineReplyResult } from '../types/index';
import { logger } from './logger';

const API_BASE_URL = 'https://bizcloser-backend.vercel.app/api/bizcloser';
const API_ENDPOINTS = {
  analyze: `${API_BASE_URL}/analyze`,
  generate: `${API_BASE_URL}/generate`,
  refine: `${API_BASE_URL}/refine`,
  feedback: `${API_BASE_URL}/feedback`
} as const;
const HISTORY_ENDPOINT = `${API_BASE_URL}/history`;

export async function handleAnalyzeConversation(thread: string): Promise<ConversationAnalysis> {
  try {
    logger.debug('Making API request to analyze conversation', {
      threadLength: thread.length
    });

    const response = await fetch(API_ENDPOINTS.analyze, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BizCloser-Extension/1.0'
      },
      body: JSON.stringify({
        thread: thread.trim()
      })
    });

    if (!response.ok) {
      throw new ExtensionError(
        `Backend request failed: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status
      );
    }

    const data: ConversationAnalysis = await response.json();

    if (!data.intent || !Array.isArray(data.objections) || !data.recommendedAngle) {
      throw new ExtensionError('Invalid analysis response format', 'INVALID_RESPONSE');
    }

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

    const response = await fetch(API_ENDPOINTS.generate, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BizCloser-Extension/1.0'
      },
      body: JSON.stringify({
        thread: thread.trim()
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new ExtensionError(
        `Backend request failed: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status
      );
    }

    const data: BackendResponse = await response.json();

    if (!data.reply || typeof data.reply !== 'string') {
      throw new ExtensionError('Invalid response format: missing or invalid reply', 'INVALID_RESPONSE');
    }

    if (data.reply.trim().length === 0) {
      throw new ExtensionError('Generated reply is empty', 'EMPTY_REPLY');
    }

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

    const response = await fetch(API_ENDPOINTS.refine, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BizCloser-Extension/1.0'
      },
      body: JSON.stringify({
        thread: thread.trim(),
        draftReply: draftReply.trim(),
        analysis,
        editInstruction
      })
    });

    if (!response.ok) {
      throw new ExtensionError(
        `Backend request failed: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status
      );
    }

    const data: RefineReplyResult = await response.json();
    if (!data.reply || typeof data.reply !== 'string') {
      throw new ExtensionError('Invalid refine response format', 'INVALID_RESPONSE');
    }

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
    const response = await fetch(HISTORY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BizCloser-Extension/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new ExtensionError(
        `Backend request failed: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status
      );
    }

    const data = await response.json() as { ok?: boolean };
    if (data.ok !== true) {
      throw new ExtensionError('History save was not accepted', 'INVALID_RESPONSE');
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('History save request failed', { error: message });
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
    const response = await fetch(API_ENDPOINTS.feedback, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BizCloser-Extension/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new ExtensionError(
        `Backend request failed: ${response.status} ${response.statusText}`,
        'API_ERROR',
        response.status
      );
    }

    const data = await response.json() as { ok?: boolean };
    if (data.ok !== true) {
      throw new ExtensionError('Feedback was not accepted by backend', 'INVALID_RESPONSE');
    }
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
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'BizCloser-Extension/1.0'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}
