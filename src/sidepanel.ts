/**
 * BizCloser Side Panel Script
 * Handles UI interactions and reply generation
 */

import {
  AnalyzeConversationResponse,
  BackendResponse,
  ConversationAnalysis,
  ExtensionError,
  ExtractConversationResponse,
  GenerateReplyResponse,
  RefineReplyResponse,
  SubmitFeedbackResponse,
  UIState
} from '../types/index';
import { logger } from './logger';

// DOM element references
interface DOMElements {
  threadForm: HTMLFormElement;
  threadInput: HTMLTextAreaElement;
  grabConvoBtn: HTMLButtonElement;
  analysisPanel: HTMLElement;
  analysisLoading: HTMLElement;
  analysisSummary: HTMLElement;
  analysisIntent: HTMLElement;
  analysisAngle: HTMLElement;
  analysisObjections: HTMLElement;
  analysisConfidence: HTMLElement;
  analysisUpBtn: HTMLButtonElement;
  analysisDownBtn: HTMLButtonElement;
  loading: HTMLElement;
  loadingMessage: HTMLElement;
  errorState: HTMLElement;
  errorMessage: HTMLElement;
  retryBtn: HTMLButtonElement;
  replyOutput: HTMLElement;
  replyContent: HTMLElement;
  refinementSummary: HTMLElement;
  manualEditPanel: HTMLElement;
  manualEditInput: HTMLTextAreaElement;
  applyEditBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  replyUpBtn: HTMLButtonElement;
  replyDownBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  saveNextBtn: HTMLButtonElement;
  toast: HTMLElement;
  emptyState: HTMLElement;
}

// State management
interface AppState {
  currentReply: string;
  analysis: ConversationAnalysis | null;
  isRunningPipeline: boolean;
  uiState: UIState;
}

/**
 * Main application class
 */
class BizCloserSidePanel {
  private elements: DOMElements;
  private state: AppState;
  private autoRunTimer: number | null = null;
  private autoRunId = 0;

  constructor() {
    this.state = {
      currentReply: '',
      analysis: null,
      isRunningPipeline: false,
      uiState: 'empty'
    };

    this.elements = this.initializeElements();
    this.setupEventListeners();
    this.setupKeyboardNavigation();

    logger.info('BizCloser side panel initialized');
  }

  /**
   * Initialize DOM element references
   */
  private initializeElements(): DOMElements {
    const getElement = <T extends HTMLElement>(id: string): T => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Element with id "${id}" not found`);
      }
      return element as T;
    };

    return {
      threadForm: getElement<HTMLFormElement>('threadForm'),
      threadInput: getElement<HTMLTextAreaElement>('threadInput'),
      grabConvoBtn: getElement<HTMLButtonElement>('grabConvoBtn'),
      analysisPanel: getElement('analysisPanel'),
      analysisLoading: getElement('analysisLoading'),
      analysisSummary: getElement('analysisSummary'),
      analysisIntent: getElement('analysisIntent'),
      analysisAngle: getElement('analysisAngle'),
      analysisObjections: getElement('analysisObjections'),
      analysisConfidence: getElement('analysisConfidence'),
      analysisUpBtn: getElement<HTMLButtonElement>('analysisUpBtn'),
      analysisDownBtn: getElement<HTMLButtonElement>('analysisDownBtn'),
      loading: getElement('loading'),
      loadingMessage: getElement('loadingMessage'),
      errorState: getElement('errorState'),
      errorMessage: getElement('errorMessage'),
      retryBtn: getElement('retryBtn'),
      replyOutput: getElement('replyOutput'),
      replyContent: getElement('replyContent'),
      refinementSummary: getElement('refinementSummary'),
      manualEditPanel: getElement('manualEditPanel'),
      manualEditInput: getElement<HTMLTextAreaElement>('manualEditInput'),
      applyEditBtn: getElement<HTMLButtonElement>('applyEditBtn'),
      copyBtn: getElement('copyBtn'),
      replyUpBtn: getElement<HTMLButtonElement>('replyUpBtn'),
      replyDownBtn: getElement<HTMLButtonElement>('replyDownBtn'),
      clearBtn: getElement('clearBtn'),
      saveNextBtn: getElement<HTMLButtonElement>('saveNextBtn'),
      toast: getElement('toast'),
      emptyState: getElement('emptyState')
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Form submission
    this.elements.threadForm.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Button clicks
    this.elements.grabConvoBtn.addEventListener('click', () => this.handleGrabConvoClick());
    this.elements.copyBtn.addEventListener('click', () => this.handleCopyClick());
    this.elements.applyEditBtn.addEventListener('click', () => this.handleManualEditClick());
    this.elements.analysisUpBtn.addEventListener('click', () => this.handleFeedbackClick('analysis', 'up'));
    this.elements.analysisDownBtn.addEventListener('click', () => this.handleFeedbackClick('analysis', 'down'));
    this.elements.replyUpBtn.addEventListener('click', () => this.handleFeedbackClick('reply', 'up'));
    this.elements.replyDownBtn.addEventListener('click', () => this.handleFeedbackClick('reply', 'down'));
    this.elements.clearBtn.addEventListener('click', () => this.clearAll());
    this.elements.saveNextBtn.addEventListener('click', () => this.handleSaveNext());
    this.elements.retryBtn.addEventListener('click', () => this.retryGeneration());

    // Input changes
    this.elements.threadInput.addEventListener('input', () => this.handleInputChange());
  }

  private async handleSaveNext(): Promise<void> {
    const thread = this.elements.threadInput.value.trim();
    if (!thread || !this.state.currentReply) {
      this.showToast('Generate a reply before saving.');
      return;
    }

    const payload = {
      thread,
      reply: this.state.currentReply,
      analysis: this.state.analysis,
      timestamp: new Date().toISOString()
    };

    const history = JSON.parse(localStorage.getItem('bizcloser_history_v1') || '[]') as any[];
    history.unshift(payload);
    localStorage.setItem('bizcloser_history_v1', JSON.stringify(history.slice(0, 50)));

    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'saveHistory',
          thread,
          reply: this.state.currentReply,
          analysis: this.state.analysis || undefined,
          metadata: { source: 'save-next' }
        }, (response: SubmitFeedbackResponse | undefined) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          if (response?.error) {
            reject(new Error(response.error));
            return;
          }
          resolve();
        });
      });
      this.showToast('Saved for training, clearing for next lead.');
    } catch (error) {
      logger.warn('History save request failed locally, still clearing view', {
        error: error instanceof Error ? error.message : 'unknown'
      });
      this.showToast('Saved locally; backend save failed.');
    }

    this.clearAll();
  }

  /**
   * Setup keyboard navigation
   */
  private setupKeyboardNavigation(): void {
    document.addEventListener('keydown', (e) => {
      // Close error state with Escape
      if (e.key === 'Escape' && !this.elements.errorState.classList.contains('hidden')) {
        this.hideErrorState();
      }
    });
  }

  /**
   * Handle form submission
   */
  private async handleFormSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const thread = this.elements.threadInput.value.trim();

    if (!thread) {
      this.showError('Please enter a conversation thread');
      this.elements.threadInput.focus();
      return;
    }

    if (this.state.isRunningPipeline) return;

    await this.runAutoPipeline(thread);
  }

  /**
   * Analyze -> Generate -> Evaluate -> Refine in one visible pipeline
   */
  private async runAutoPipeline(thread: string): Promise<void> {
    const runId = ++this.autoRunId;
    this.state.isRunningPipeline = true;
    this.updateUIState('loading');
    this.hideErrorState();
    this.setLoadingMessage('Analyzing conversation...');

    try {
      const analysis = await this.analyzeConversation(thread, runId);
      if (!analysis) return;

      this.setLoadingMessage('Generating first draft...');
      const firstDraft = await this.requestGenerateReply(thread, runId);
      if (!firstDraft) return;

      this.displayReply(firstDraft.reply);
      this.showRefinementSummary('Draft generated. Evaluating quality and improving...');

      this.setLoadingMessage('Evaluating and refining draft...');
      const refined = await this.requestRefineReply(thread, firstDraft.reply, analysis, runId);

      if (refined?.reply) {
        this.state.currentReply = refined.reply;
        this.displayReply(refined.reply);
        const changesText = refined.changes.length
          ? `Auto-edits: ${refined.changes.join(' | ')}`
          : 'Auto-edit pass: no major changes needed.';
        this.showRefinementSummary(`${changesText} ${refined.verdict}`.trim());
      } else {
        this.state.currentReply = firstDraft.reply;
        this.showRefinementSummary('Auto-edit pass skipped. Using first draft.');
      }
      this.elements.manualEditPanel.classList.remove('hidden');
      this.updateUIState('success');
      logger.info('Auto pipeline completed successfully');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate reply. Please try again.';
      logger.error('Auto pipeline error', { error: message });
      this.showError(message);
      this.updateUIState('error');
    } finally {
      if (runId === this.autoRunId) {
        this.state.isRunningPipeline = false;
      }
    }
  }

  private async analyzeConversation(thread: string, runId?: number): Promise<ConversationAnalysis | null> {
    this.elements.analysisLoading.classList.remove('hidden');
    this.elements.analysisPanel.classList.add('hidden');

    try {
      logger.debug('Sending analysis request to background', {
        threadLength: thread.length
      });

      const response: AnalyzeConversationResponse = await chrome.runtime.sendMessage({
        action: 'analyzeConversation',
        thread
      });

      if (response.error) {
        throw new ExtensionError(response.error);
      }

      if (!response.data) {
        throw new ExtensionError('No analysis returned');
      }

      if (runId && runId !== this.autoRunId) {
        logger.debug('Discarding stale analysis result');
        return null;
      }

      if (this.elements.threadInput.value.trim() !== thread) {
        logger.debug('Discarding stale analysis result after thread changed');
        return null;
      }

      this.state.analysis = response.data;
      this.renderAnalysis(response.data);
      logger.info('Conversation analysis displayed successfully');
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze conversation.';
      logger.error('Analysis error', { error: message });
      this.showError(message);
      return null;
    } finally {
      this.elements.analysisLoading.classList.add('hidden');
    }
  }

  /**
   * Handle grab conversation button click
   */
  private async handleGrabConvoClick(): Promise<void> {
    if (this.state.isRunningPipeline) return;

    try {
      logger.debug('Attempting to import conversation from active tab');
      this.showToast('Importing highlighted or visible thread...');

      const response: ExtractConversationResponse = await chrome.runtime.sendMessage({
        action: 'extractConversation'
      });

      if (response?.conversation) {
        const parsedConversation = this.parseImportedConversation(response.conversation);

        // Paste conversation into textarea
        this.elements.threadInput.value = parsedConversation;
        this.elements.threadInput.dispatchEvent(new Event('input')); // Trigger input validation

        // Show success message
        this.showToast('Thread imported successfully!');
        await this.runAutoPipeline(parsedConversation);

        logger.info('Conversation extracted and analyzed');
      } else {
        throw new ExtensionError(response?.error || 'No conversation found on this page. Highlight the thread first and try again.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract conversation. Highlight the thread first and try again.';
      logger.error('Grab conversation error', { error: message });
      this.showError(message);
      this.showToast('Thread import failed');
    }
  }

  /**
   * Handle copy to clipboard
   */
  private async handleCopyClick(): Promise<void> {
    if (!this.state.currentReply) return;

    try {
      await navigator.clipboard.writeText(this.state.currentReply);
      this.showToast('Copied to clipboard!');
      logger.debug('Reply copied to clipboard');
    } catch (error) {
      logger.error('Clipboard error', { error: (error as Error).message });
      // Fallback for older browsers
      this.fallbackCopyToClipboard(this.state.currentReply);
    }
  }

  private async handleFeedbackClick(
    stage: 'analysis' | 'reply',
    sentiment: 'up' | 'down'
  ): Promise<void> {
    const thread = this.elements.threadInput.value.trim();
    if (!thread) {
      this.showToast('Add a thread first, then submit feedback.');
      return;
    }

    const replyStage: 'reply' | 'refine' =
      stage === 'reply' && !this.elements.refinementSummary.classList.contains('hidden')
        ? 'refine'
        : 'reply';

    try {
      const response: SubmitFeedbackResponse = await chrome.runtime.sendMessage({
        action: 'submitFeedback',
        stage: stage === 'analysis' ? 'analysis' : replyStage,
        sentiment,
        thread,
        analysisSummary: this.state.analysis?.summary,
        generatedReply: this.state.currentReply || undefined,
        refinedReply: replyStage === 'refine' ? this.state.currentReply || undefined : undefined,
        meta: {
          source: 'chrome-extension',
          uiState: this.state.uiState
        }
      });

      if (response.error) {
        throw new ExtensionError(response.error);
      }

      this.showToast(sentiment === 'up' ? 'Feedback saved: helpful' : 'Feedback saved: needs improvement');
    } catch (error) {
      logger.error('Feedback submission failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.showToast('Could not save feedback right now.');
    }
  }

  private async handleManualEditClick(): Promise<void> {
    const thread = this.elements.threadInput.value.trim();
    const editInstruction = this.elements.manualEditInput.value.trim();
    const draftReply = this.state.currentReply.trim();

    if (!thread || !draftReply) {
      this.showToast('Generate a reply first.');
      return;
    }

    if (!editInstruction) {
      this.showToast('Enter what you want changed.');
      this.elements.manualEditInput.focus();
      return;
    }

    this.elements.applyEditBtn.disabled = true;
    this.setLoadingMessage('Applying your edit request...');
    this.elements.loading.classList.remove('hidden');

    try {
      const refined = await this.requestRefineReply(
        thread,
        draftReply,
        this.state.analysis || undefined,
        undefined,
        editInstruction
      );

      if (!refined?.reply) {
        throw new ExtensionError('No refined reply returned.');
      }

      this.state.currentReply = refined.reply;
      this.displayReply(refined.reply);
      const changesText = refined.changes.length
        ? `Manual edit: ${refined.changes.join(' | ')}`
        : 'Manual edit applied.';
      this.showRefinementSummary(`${changesText} ${refined.verdict}`.trim());
      this.elements.manualEditInput.value = '';
      this.showToast('Edit applied');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not apply edit.';
      logger.error('Manual edit error', { error: message });
      this.showToast('Could not apply edit right now.');
    } finally {
      this.elements.applyEditBtn.disabled = false;
      this.elements.loading.classList.add('hidden');
    }
  }

  /**
   * Fallback copy to clipboard for older browsers
   */
  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      this.showToast('Copied to clipboard!');
      logger.debug('Reply copied using fallback method');
    } catch (error) {
      logger.error('Fallback copy failed', { error: (error as Error).message });
      this.showToast('Copy failed. Please select and copy manually.');
    } finally {
      document.body.removeChild(textArea);
    }
  }

  /**
   * Handle input changes
   */
  private handleInputChange(): void {
    const hasContent = this.elements.threadInput.value.trim().length > 0;

    if (hasContent) {
      this.state.currentReply = '';
      this.state.analysis = null;
      this.elements.replyOutput.classList.add('hidden');
      this.elements.analysisPanel.classList.add('hidden');
      this.elements.refinementSummary.classList.add('hidden');
      this.elements.manualEditPanel.classList.add('hidden');
      this.elements.manualEditInput.value = '';
      this.scheduleAutoRun(this.elements.threadInput.value.trim());
    }

    if (!hasContent && !this.state.currentReply) {
      if (this.autoRunTimer !== null) {
        window.clearTimeout(this.autoRunTimer);
        this.autoRunTimer = null;
      }
      this.updateUIState('empty');
    }
  }

  private scheduleAutoRun(thread: string): void {
    if (this.autoRunTimer !== null) {
      window.clearTimeout(this.autoRunTimer);
    }

    if (thread.length < 25) return;

    this.autoRunTimer = window.setTimeout(() => {
      this.autoRunTimer = null;
      void this.runAutoPipeline(thread);
    }, 1200);
  }

  /**
   * Clear all data
   */
  private clearAll(): void {
    if (this.autoRunTimer !== null) {
      window.clearTimeout(this.autoRunTimer);
      this.autoRunTimer = null;
    }
    this.elements.threadInput.value = '';
    this.state.currentReply = '';
    this.state.analysis = null;
    this.updateUIState('empty');
    this.elements.analysisPanel.classList.add('hidden');
    this.elements.analysisLoading.classList.add('hidden');
    this.elements.refinementSummary.classList.add('hidden');
    this.elements.manualEditPanel.classList.add('hidden');
    this.elements.manualEditInput.value = '';
    this.elements.threadInput.focus();
    logger.debug('All data cleared');
  }

  /**
   * Retry generation
   */
  private retryGeneration(): void {
    this.hideErrorState();
    const thread = this.elements.threadInput.value.trim();
    if (thread) {
      this.showToast('Retrying generation...');
      this.runAutoPipeline(thread);
    }
  }

  /**
   * Update UI state
   */
  private updateUIState(state: UIState): void {
    this.state.uiState = state;

    // Hide all states
    this.elements.loading.classList.add('hidden');
    this.elements.errorState.classList.add('hidden');
    this.elements.replyOutput.classList.add('hidden');
    this.elements.emptyState.classList.add('hidden');

    // Show relevant state
    switch (state) {
      case 'loading':
        this.elements.loading.classList.remove('hidden');
        break;
      case 'error':
        this.elements.errorState.classList.remove('hidden');
        break;
      case 'success':
        this.elements.replyOutput.classList.remove('hidden');
        break;
      case 'empty':
      default:
        this.elements.emptyState.classList.remove('hidden');
        break;
    }
  }

  /**
   * Display generated reply
   */
  private displayReply(reply: string): void {
    this.elements.replyContent.textContent = reply;
    this.elements.replyOutput.classList.remove('hidden');
    this.elements.copyBtn.focus();
  }

  private showRefinementSummary(message: string): void {
    this.elements.refinementSummary.textContent = message;
    this.elements.refinementSummary.classList.remove('hidden');
  }

  private setLoadingMessage(message: string): void {
    this.elements.loadingMessage.textContent = message;
  }

  private async requestGenerateReply(thread: string, runId: number): Promise<BackendResponse | null> {
    logger.debug('Sending generate request to background', {
      threadLength: thread.length
    });

    const response: GenerateReplyResponse = await chrome.runtime.sendMessage({
      action: 'generateReply',
      thread
    });

    if (runId !== this.autoRunId) {
      logger.debug('Discarding stale generate result');
      return null;
    }

    if (response.error) {
      throw new ExtensionError(response.error);
    }

    if (!response.data?.reply) {
      throw new ExtensionError('No reply generated');
    }

    return response.data as BackendResponse;
  }

  private async requestRefineReply(
    thread: string,
    draftReply: string,
    analysis?: ConversationAnalysis,
    runId?: number,
    editInstruction?: string
  ): Promise<{ reply: string; changes: string[]; verdict: string } | null> {
    const response: RefineReplyResponse = await chrome.runtime.sendMessage({
      action: 'refineReply',
      thread,
      draftReply,
      analysis,
      editInstruction
    });

    if (typeof runId === 'number' && runId !== this.autoRunId) {
      logger.debug('Discarding stale refine result');
      return null;
    }

    if (response.error) {
      throw new ExtensionError(response.error);
    }

    if (!response.data?.reply) {
      return null;
    }

    return {
      reply: response.data.reply,
      changes: Array.isArray(response.data.changes) ? response.data.changes : [],
      verdict: response.data.verdict || 'Reply refined.'
    };
  }

  private renderAnalysis(analysis: ConversationAnalysis): void {
    this.elements.analysisSummary.textContent = analysis.summary;
    this.elements.analysisIntent.textContent = analysis.intent;
    this.elements.analysisAngle.textContent = analysis.recommendedAngle;
    this.elements.analysisConfidence.textContent = analysis.confidence;
    this.elements.analysisObjections.innerHTML = '';

    const objections = analysis.objections.length > 0
      ? analysis.objections
      : ['No explicit objection stated yet.'];

    objections.forEach((objection) => {
      const item = document.createElement('li');
      item.className = 'analysis-list__item';
      item.textContent = objection;
      this.elements.analysisObjections.appendChild(item);
    });

    this.elements.analysisPanel.classList.remove('hidden');
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    this.elements.errorMessage.textContent = message;
    this.updateUIState('error');
  }

  /**
   * Hide error state
   */
  private hideErrorState(): void {
    this.elements.errorState.classList.add('hidden');
  }

  /**
   * Show toast notification
   */
  private showToast(message: string): void {
    this.elements.toast.textContent = message;
    this.elements.toast.setAttribute('data-toast-state', 'visible');
    this.elements.toast.classList.remove('translate-y-full');
    this.elements.toast.classList.add('translate-y-0');

    setTimeout(() => {
      this.elements.toast.classList.remove('translate-y-0');
      this.elements.toast.classList.add('translate-y-full');
      this.elements.toast.setAttribute('data-toast-state', 'hidden');
    }, 3000);
  }

  /**
   * Second-pass parser for imported text.
   * Keeps conversational blocks and strips common UI/campaign metadata noise.
   */
  private parseImportedConversation(rawText: string): string {
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !this.isImportNoiseLine(line));

    const blocks: string[] = [];
    let currentBlock: string[] = [];
    let pendingRole: 'Lead' | 'Jack' | null = null;

    const flushBlock = () => {
      if (!currentBlock.length) return;
      const text = currentBlock.join(' ').replace(/\s+/g, ' ').trim();
      if (text.length > 3) {
        blocks.push(text);
      }
      currentBlock = [];
    };

    for (const line of lines) {
      const markerRole = this.getSpeakerRoleFromMarker(line);
      if (markerRole) {
        flushBlock();
        pendingRole = markerRole;
        continue;
      }

      const textLine = pendingRole ? `${pendingRole}: ${line}` : line;
      pendingRole = null;

      if (this.isStrongMessageBoundary(textLine, currentBlock)) {
        flushBlock();
      }

      currentBlock.push(textLine);
    }

    flushBlock();
    return blocks.join('\n\n');
  }

  private isImportNoiseLine(line: string): boolean {
    const normalized = line.toLowerCase();

    return (
      /^(expand_more|done_all|newest|oldest|mark all as read.*)$/i.test(line) ||
      /^-?\s*sequence$/i.test(line) ||
      /^jack'?s personal line$/i.test(line) ||
      /^to jack'?s personal line$/i.test(line) ||
      /^sent!$/i.test(line) ||
      /^sent from /i.test(line) ||
      /^used .* personal line/i.test(line) ||
      /^to \+?\d+/i.test(line) ||
      /^from:/i.test(line) ||
      /^to:/i.test(line) ||
      /^primary$/i.test(line) ||
      /^(today|yesterday),\s*\d{1,2}:\d{2}\s*(am|pm)/i.test(line) ||
      /\b(?:am|pm)\s*(?:edt|est|cst|pst|mst)\b/i.test(line) ||
      /^\+?\d{10,}$/.test(line) ||
      /v\d+\.\d+\s+sequence/i.test(line) ||
      /\bworkshop playbook\b.*\bsequence\b/i.test(normalized) ||
      /\bcash practice\b.*\bsequence\b/i.test(normalized)
    );
  }

  private getSpeakerRoleFromMarker(line: string): 'Lead' | 'Jack' | null {
    if (/^jl$/i.test(line) || /^jack$/i.test(line) || /^jack licata$/i.test(line)) {
      return 'Jack';
    }

    if (/^[a-z]$/i.test(line) || /^[a-z]{2,3}$/i.test(line)) {
      return 'Lead';
    }

    if (/^(lead|prospect|client)$/i.test(line)) {
      return 'Lead';
    }

    return null;
  }

  private isStrongMessageBoundary(nextLine: string, currentBlock: string[]): boolean {
    if (!currentBlock.length) return false;
    if (/^(Lead|Jack):/i.test(nextLine)) return true;

    const currentText = currentBlock.join(' ').toLowerCase();
    const hasSentenceEnding = /[.!?]["')\]]?\s*$/.test(currentText);
    const looksLikeFreshStart = /^(hey|hi|got you|gotcha|love|makes sense|perfect|yes|no|i'm|im|i am|thanks|awesome)\b/i.test(nextLine);

    return hasSentenceEnding && looksLikeFreshStart;
  }

}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BizCloserSidePanel();
});
