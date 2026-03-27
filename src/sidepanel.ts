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
  LocalHistorySnapshot,
  LocalMeasurementSnapshot,
  RefineReplyResponse,
  SubmitFeedbackResponse,
  SyncLocalDataResponse,
  UIState
} from '../types/index';
import { logger } from './logger';

// DOM element references
interface DOMElements {
  threadForm: HTMLFormElement;
  threadInput: HTMLTextAreaElement;
  threadStatus: HTMLElement;
  analysisPanel: HTMLElement;
  analysisLoading: HTMLElement;
  analysisSummary: HTMLElement;
  analysisIntent: HTMLElement;
  analysisAngle: HTMLElement;
  analysisPreview: HTMLElement;
  analysisToggleBtn: HTMLButtonElement;
  analysisBody: HTMLElement;
  analysisObjectionGroup: HTMLElement;
  analysisObjections: HTMLElement;
  analysisConfidence: HTMLElement;
  analysisUpBtn: HTMLButtonElement;
  analysisDownBtn: HTMLButtonElement;
  copyAnalysisBtn: HTMLButtonElement;
  openHubspotNoteBtn: HTMLButtonElement;
  loading: HTMLElement;
  loadingMessage: HTMLElement;
  loadingSubtext: HTMLElement;
  progressSteps: NodeListOf<HTMLElement>;
  errorState: HTMLElement;
  errorMessage: HTMLElement;
  retryBtn: HTMLButtonElement;
  replyOutput: HTMLElement;
  replyContent: HTMLElement;
  refinementSummary: HTMLElement;
  metricsPanel: HTMLElement;
  metricsPanelToggleBtn: HTMLButtonElement;
  qualityBadge: HTMLElement;
  metricSessions: HTMLElement;
  metricCopyRate: HTMLElement;
  metricEditRate: HTMLElement;
  metricBookedRate: HTMLElement;
  metricRefineLift: HTMLElement;
  metricLatestOutcome: HTMLElement;
  metricsToggleBtn: HTMLButtonElement;
  metricsDetails: HTMLElement;
  manualEditPanel: HTMLElement;
  openRevisionBtn: HTMLButtonElement;
  manualEditInput: HTMLTextAreaElement;
  quickEditButtons: NodeListOf<HTMLButtonElement>;
  applyEditBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  replySaveNextBtn: HTMLButtonElement;
  replyUpBtn: HTMLButtonElement;
  replyDownBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  toast: HTMLElement;
  emptyState: HTMLElement;
  primaryActionBtn: HTMLButtonElement;
  flowCard: HTMLElement;
  flowStateBadge: HTMLElement;
  flowStateTitle: HTMLElement;
  flowStateHint: HTMLElement;
}

// State management
interface AppState {
  sessionId: string;
  currentReply: string;
  firstDraft: string;
  analysis: ConversationAnalysis | null;
  isRunningPipeline: boolean;
  uiState: UIState;
  wasCopied: boolean;
  wasManuallyEdited: boolean;
  alignmentCorrectionUsed: boolean;
  latestSignal: string | null;
  replyFeedback: 'up' | 'down' | null;
  replyFeedbackStage: 'reply' | 'refine' | 'manual' | null;
  metricsExpanded: boolean;
  analysisExpanded: boolean;
  metricsPanelVisible: boolean;
}

interface MeasurementEntry {
  id: string;
  sessionId: string;
  createdAt: string;
  threadLength: number;
  hadAnalysis: boolean;
  firstDraftGenerated: boolean;
  refineApplied: boolean;
  alignmentCorrectionUsed: boolean;
  copied: boolean;
  manuallyEdited: boolean;
  latestSignal: string | null;
  replyFeedback: 'up' | 'down' | null;
  replyFeedbackStage?: 'reply' | 'refine' | 'manual' | null;
}

const MAX_EDIT_INSTRUCTION_LENGTH = 700;
const MIN_MANUAL_EDIT_CHANGE_RATIO = 0.08;
const HISTORY_SYNC_IDS_KEY = 'bizcloser_sync_history_ids_v1';
const MEASUREMENT_SYNC_IDS_KEY = 'bizcloser_sync_measurement_ids_v1';

/**
 * Main application class
 */
class BizCloserSidePanel {
  private elements: DOMElements;
  private state: AppState;
  private autoRunTimer: number | null = null;
  private autoRunId = 0;
  private localSyncTimer: number | null = null;
  private syncInFlight = false;

  constructor() {
    this.state = {
      sessionId: '',
      currentReply: '',
      firstDraft: '',
      analysis: null,
      isRunningPipeline: false,
      uiState: 'empty',
      wasCopied: false,
      wasManuallyEdited: false,
      alignmentCorrectionUsed: false,
      latestSignal: null,
      replyFeedback: null,
      replyFeedbackStage: null,
      metricsExpanded: false,
      analysisExpanded: false,
      metricsPanelVisible: false
    };

    this.elements = this.initializeElements();
    this.elements.flowCard.setAttribute('data-revision-open', 'false');
    this.elements.flowCard.setAttribute('data-ml-open', 'false');
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
      threadStatus: getElement('threadStatus'),
      analysisPanel: getElement('analysisPanel'),
      analysisLoading: getElement('analysisLoading'),
      analysisSummary: getElement('analysisSummary'),
      analysisIntent: getElement('analysisIntent'),
      analysisAngle: getElement('analysisAngle'),
      analysisPreview: getElement('analysisPreview'),
      analysisToggleBtn: getElement<HTMLButtonElement>('analysisToggleBtn'),
      analysisBody: getElement('analysisBody'),
      analysisObjectionGroup: getElement('analysisObjectionGroup'),
      analysisObjections: getElement('analysisObjections'),
      analysisConfidence: getElement('analysisConfidence'),
      analysisUpBtn: getElement<HTMLButtonElement>('analysisUpBtn'),
      analysisDownBtn: getElement<HTMLButtonElement>('analysisDownBtn'),
      copyAnalysisBtn: getElement<HTMLButtonElement>('copyAnalysisBtn'),
      openHubspotNoteBtn: getElement<HTMLButtonElement>('openHubspotNoteBtn'),
      loading: getElement('loading'),
      loadingMessage: getElement('loadingMessage'),
      loadingSubtext: getElement('loadingSubtext'),
      progressSteps: document.querySelectorAll<HTMLElement>('[data-stage-step]'),
      errorState: getElement('errorState'),
      errorMessage: getElement('errorMessage'),
      retryBtn: getElement('retryBtn'),
      replyOutput: getElement('replyOutput'),
      replyContent: getElement('replyContent'),
      refinementSummary: getElement('refinementSummary'),
      metricsPanel: getElement('metricsPanel'),
      metricsPanelToggleBtn: getElement<HTMLButtonElement>('metricsPanelToggleBtn'),
      qualityBadge: getElement('qualityBadge'),
      metricSessions: getElement('metricSessions'),
      metricCopyRate: getElement('metricCopyRate'),
      metricEditRate: getElement('metricEditRate'),
      metricBookedRate: getElement('metricBookedRate'),
      metricRefineLift: getElement('metricRefineLift'),
      metricLatestOutcome: getElement('metricLatestOutcome'),
      metricsToggleBtn: getElement<HTMLButtonElement>('metricsToggleBtn'),
      metricsDetails: getElement('metricsDetails'),
      manualEditPanel: getElement('manualEditPanel'),
      openRevisionBtn: getElement<HTMLButtonElement>('openRevisionBtn'),
      manualEditInput: getElement<HTMLTextAreaElement>('manualEditInput'),
      quickEditButtons: document.querySelectorAll<HTMLButtonElement>('[data-quick-edit]'),
      applyEditBtn: getElement<HTMLButtonElement>('applyEditBtn'),
      copyBtn: getElement('copyBtn'),
      replySaveNextBtn: getElement<HTMLButtonElement>('replySaveNextBtn'),
      replyUpBtn: getElement<HTMLButtonElement>('replyUpBtn'),
      replyDownBtn: getElement<HTMLButtonElement>('replyDownBtn'),
      clearBtn: getElement('clearBtn'),
      toast: getElement('toast'),
      emptyState: getElement('emptyState'),
      primaryActionBtn: getElement<HTMLButtonElement>('primaryActionBtn'),
      flowCard: getElement('flowCard'),
      flowStateBadge: getElement('flowStateBadge'),
      flowStateTitle: getElement('flowStateTitle'),
      flowStateHint: getElement('flowStateHint')
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Form submission
    this.elements.threadForm.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Button clicks
    this.elements.copyBtn.addEventListener('click', () => this.handleCopyClick());
    this.elements.applyEditBtn.addEventListener('click', () => this.handleManualEditClick());
    this.elements.analysisToggleBtn.addEventListener('click', () => this.toggleAnalysisDetails());
    this.elements.metricsPanelToggleBtn.addEventListener('click', () => this.toggleMetricsPanelVisibility());
    this.elements.metricsToggleBtn.addEventListener('click', () => this.toggleMetricsDetails());
    this.elements.analysisUpBtn.addEventListener('click', () => this.handleFeedbackClick('analysis', 'up'));
    this.elements.analysisDownBtn.addEventListener('click', () => this.handleFeedbackClick('analysis', 'down'));
    this.elements.copyAnalysisBtn.addEventListener('click', () => this.handleCopyAnalysisNotes());
    this.elements.openHubspotNoteBtn.addEventListener('click', () => this.handleOpenHubSpotNote());
    this.elements.replyUpBtn.addEventListener('click', () => this.handleFeedbackClick('reply', 'up'));
    this.elements.replyDownBtn.addEventListener('click', () => this.handleFeedbackClick('reply', 'down'));
    this.elements.clearBtn.addEventListener('click', () => this.clearAll());
    this.elements.replySaveNextBtn.addEventListener('click', () => this.handleSaveNext());
    this.elements.openRevisionBtn.addEventListener('click', () => this.handleOpenRevisionClick());
    this.elements.retryBtn.addEventListener('click', () => this.retryGeneration());
    this.elements.quickEditButtons.forEach((button) => {
      button.addEventListener('click', () => this.handleQuickEditSelection(button.dataset.quickEdit || ''));
    });

    // Input changes
    this.elements.threadInput.addEventListener('input', () => this.handleInputChange());
    this.setMetricsExpanded(false);
    this.setAnalysisExpanded(false);
    this.setMetricsPanelVisible(false);
    this.updateThreadStatus();
    this.updateSaveNextAvailability();
    this.updateUIState('empty');
    this.renderMeasurementStats();
    void this.syncLocalStorageDataToBackend();
  }

  private cancelAutoRun(): void {
    if (this.autoRunTimer !== null) {
      window.clearTimeout(this.autoRunTimer);
      this.autoRunTimer = null;
    }
  }

  private async handleSaveNext(): Promise<void> {
    this.cancelAutoRun();
    this.persistMeasurementSnapshot();

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
    this.scheduleLocalSync();

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

  private handleQuickEditSelection(instruction: string): void {
    if (!instruction) return;

    this.revealRevisionEditor();
    this.elements.manualEditInput.value = instruction;
    this.elements.manualEditInput.focus();
    this.showToast('Quick edit loaded. Apply it when ready.');
  }

  private handleOpenRevisionClick(): void {
    this.revealRevisionEditor();
    this.elements.manualEditInput.focus();
  }

  private revealRevisionEditor(): void {
    this.elements.openRevisionBtn.classList.add('hidden');
    this.elements.manualEditPanel.classList.remove('hidden');
    this.elements.flowCard.setAttribute('data-revision-open', 'true');
  }

  private resetRevisionEditor(): void {
    this.elements.manualEditPanel.classList.add('hidden');
    this.elements.openRevisionBtn.classList.remove('hidden');
    this.elements.manualEditInput.value = '';
    this.elements.flowCard.setAttribute('data-revision-open', 'false');
  }

  private setAnalysisExpanded(expanded: boolean): void {
    this.state.analysisExpanded = expanded;
    this.elements.analysisBody.classList.toggle('hidden', !expanded);
    this.elements.analysisToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    this.elements.analysisToggleBtn.textContent = expanded ? 'Hide details' : 'Show details';
  }

  private toggleAnalysisDetails(): void {
    this.setAnalysisExpanded(!this.state.analysisExpanded);
  }

  private setMetricsPanelVisible(visible: boolean): void {
    this.state.metricsPanelVisible = visible;
    this.elements.metricsPanel.classList.toggle('hidden', !visible);
    this.elements.metricsPanelToggleBtn.setAttribute('aria-expanded', visible ? 'true' : 'false');
    this.elements.metricsPanelToggleBtn.textContent = visible ? 'Hide ML Impact' : 'Show ML Impact';
    this.elements.flowCard.setAttribute('data-ml-open', visible ? 'true' : 'false');
  }

  private toggleMetricsPanelVisibility(): void {
    this.setMetricsPanelVisible(!this.state.metricsPanelVisible);
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
    this.cancelAutoRun();
    const thread = this.elements.threadInput.value.trim();

    if (!thread) {
      await this.importThreadAndRun();
      return;
    }

    if (this.state.isRunningPipeline) return;

    await this.runAutoPipeline(thread);
  }

  /**
   * Analyze -> Generate -> Evaluate -> Refine in one visible pipeline
   */
  private async runAutoPipeline(thread: string): Promise<void> {
    if (this.state.isRunningPipeline) {
      logger.debug('Ignoring pipeline start request while another run is active');
      return;
    }

    const runId = ++this.autoRunId;
    this.state.isRunningPipeline = true;
    this.state.firstDraft = '';
    this.state.currentReply = '';
    this.state.wasCopied = false;
    this.state.wasManuallyEdited = false;
    this.state.alignmentCorrectionUsed = false;
    this.state.latestSignal = null;
    this.state.replyFeedback = null;
    this.state.replyFeedbackStage = null;
    this.state.sessionId = this.buildSessionId();
    this.updateUIState('loading');
    this.hideErrorState();
    this.setPipelineStage('analysis');
    this.setLoadingMessage('Analyzing conversation...');
    this.setLoadingSubtext('Reading the thread, extracting intent, and surfacing the most useful angle.');

    try {
      const analysis = await this.analyzeConversation(thread, runId);
      if (!analysis) return;

      this.setPipelineStage('draft');
      this.setLoadingMessage('Generating first draft...');
      this.setLoadingSubtext('Drafting the first pass so we can tighten tone and structure next.');
      const firstDraft = await this.requestGenerateReply(thread, runId);
      if (!firstDraft) return;

      this.state.firstDraft = firstDraft.reply;
      this.elements.replyOutput.classList.add('hidden');
      this.elements.refinementSummary.classList.add('hidden');

      this.setPipelineStage('refine');
      this.setLoadingMessage('Evaluating and refining draft...');
      this.setLoadingSubtext('Checking the reply against the recommendation, then applying the final pass.');
      const autoEditInstruction = this.buildAutoRefineInstruction(analysis, firstDraft.reply);
      const refined = await this.requestRefineReply(
        thread,
        firstDraft.reply,
        analysis,
        runId,
        autoEditInstruction
      );

      let finalReply = refined?.reply || firstDraft.reply;
      let refinementChanges = refined?.changes || [];
      let refinementVerdict = refined?.verdict || 'Auto-edit pass skipped. Using first draft.';

      if (this.requiresReplyRealignment(analysis, thread, finalReply)) {
        this.setLoadingMessage('Tightening final reply to match the recommended angle...');

        const alignmentPass = await this.requestRefineReply(
          thread,
          finalReply,
          analysis,
          runId,
          this.buildAlignmentCorrectionInstruction(analysis)
        );

        if (alignmentPass?.reply) {
          finalReply = alignmentPass.reply;
          this.state.alignmentCorrectionUsed = true;
          this.state.latestSignal = 'Alignment rescue applied';
          refinementChanges = alignmentPass.changes.length
            ? [...refinementChanges, ...alignmentPass.changes]
            : [...refinementChanges, 'Aligned final reply with recommended angle'];
          refinementVerdict = alignmentPass.verdict || 'Final reply realigned with the recommended angle.';
        }
      }

      if (this.requiresReplyRealignment(analysis, thread, finalReply)) {
        finalReply = this.buildGuaranteedStrategyCallReply(analysis, thread);
        this.state.alignmentCorrectionUsed = true;
        this.state.latestSignal = 'Fallback strategy-call rewrite applied';
        refinementChanges = [...refinementChanges, 'Applied guaranteed strategy-call fallback'];
        refinementVerdict = 'Fallback rewrite applied to enforce strategy-call invitation structure.';
      }

      this.setPipelineStage('done');
      this.state.currentReply = finalReply;
      if (!this.state.latestSignal) {
        this.state.latestSignal = this.state.firstDraft !== finalReply ? 'Refine changed the reply' : 'First draft held';
      }
      this.renderAnalysis(analysis);
      this.displayReply(finalReply);
      this.persistMeasurementSnapshot();
      this.renderMeasurementStats();

      if (this.requiresReplyRealignment(analysis, thread, finalReply)) {
        logger.warn('Final reply still appears misaligned with analysis', {
          recommendedAngle: analysis.recommendedAngle,
          replyPreview: finalReply.slice(0, 160)
        });
      }

      if (refined?.reply) {
        const changesText = refinementChanges.length
          ? `Auto-edits: ${refinementChanges.join(' | ')}`
          : 'Auto-edit pass: no major changes needed.';
        this.showRefinementSummary(`${changesText} ${refinementVerdict}`.trim());
      } else {
        this.showRefinementSummary(refinementVerdict);
      }
      this.resetRevisionEditor();
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
        this.updateThreadStatus();
        this.updateSaveNextAvailability();
      }
    }
  }

  private async analyzeConversation(thread: string, runId?: number): Promise<ConversationAnalysis | null> {
    // Keep a single visible loading state (pipeline card) to avoid duplicate-spinner UX.
    this.elements.analysisLoading.classList.add('hidden');
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

  private async importThreadAndRun(): Promise<void> {
    if (this.state.isRunningPipeline) return;

    const previousValue = this.elements.threadInput.value;

    try {
      logger.debug('Attempting to import conversation from active tab');
      this.showToast('Importing highlighted or visible thread...');

      const response: ExtractConversationResponse = await chrome.runtime.sendMessage({
        action: 'extractConversation'
      });

      if (response?.conversation) {
        const parsedConversation = this.parseImportedConversation(response.conversation);

        if (!parsedConversation.trim()) {
          throw new ExtensionError('No usable conversation text was found. Highlight the thread first, then try import again.');
        }

        this.elements.threadInput.value = parsedConversation;
        this.elements.threadInput.dispatchEvent(new Event('input'));
        this.cancelAutoRun();
        this.showToast('Thread imported successfully!');
        await this.runAutoPipeline(parsedConversation);
        logger.info('Conversation extracted and analyzed');
        return;
      }

      throw new ExtensionError(response?.error || 'No conversation found on this page. Highlight the thread first and try again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract conversation. Highlight the thread first and try again.';
      logger.error('Import conversation error', { error: message });
      this.elements.threadInput.value = previousValue;
      this.showError(message);
      this.showToast('Thread import failed. Your current draft was kept.');
      this.elements.threadInput.focus();
    }
  }

  /**
   * Handle copy to clipboard
   */
  private async handleCopyClick(): Promise<void> {
    if (!this.state.currentReply) return;

    try {
      await navigator.clipboard.writeText(this.state.currentReply);
      this.state.wasCopied = true;
      this.state.latestSignal = 'Reply copied';
      this.persistMeasurementSnapshot();
      this.renderMeasurementStats();
      this.showToast('Copied to clipboard!');
      logger.debug('Reply copied to clipboard');
    } catch (error) {
      logger.error('Clipboard error', { error: (error as Error).message });
      // Fallback for older browsers
      this.fallbackCopyToClipboard(this.state.currentReply);
    }
  }

  private async handleCopyAnalysisNotes(): Promise<void> {
    if (!this.state.analysis) {
      this.showToast('Run analysis first.');
      return;
    }

    const notes = this.buildAnalysisNotes(this.state.analysis);
    try {
      await navigator.clipboard.writeText(notes);
      this.showToast('Analysis notes copied.');
    } catch (error) {
      logger.error('Failed to copy analysis notes', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.fallbackCopyToClipboard(notes);
    }
  }

  private async handleOpenHubSpotNote(): Promise<void> {
    this.elements.openHubspotNoteBtn.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'openHubSpotNote'
      }) as { data?: { noteComposerOpened: boolean }; error?: string };

      if (response?.error) {
        throw new ExtensionError(response.error);
      }

      if (!response?.data) {
        throw new ExtensionError('No HubSpot result returned.');
      }

      this.showToast(
        response.data.noteComposerOpened
          ? 'Opened HubSpot profile and launched note composer.'
          : 'Opened HubSpot profile. If needed, click Note manually.'
      );
    } catch (error) {
      logger.error('Failed to open HubSpot note', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.showToast('Could not find/open HubSpot profile from this tab.');
    } finally {
      this.elements.openHubspotNoteBtn.disabled = false;
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

      if (stage === 'reply') {
        const feedbackStage: 'reply' | 'refine' | 'manual' = this.state.wasManuallyEdited
          ? 'manual'
          : (replyStage === 'refine' ? 'refine' : 'reply');
        this.state.replyFeedback = sentiment;
        this.state.replyFeedbackStage = feedbackStage;
        this.state.latestSignal = sentiment === 'up' ? 'Reply marked helpful' : 'Reply marked needs work';
        this.persistMeasurementSnapshot();
        this.renderMeasurementStats();
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

    const sanitizedInstruction = this.sanitizeEditInstruction(editInstruction);
    this.elements.applyEditBtn.disabled = true;
    this.setPipelineStage('refine');
    this.setLoadingMessage('Applying your edit request...');
    this.setLoadingSubtext('Using your instructions to rewrite the current reply without losing the good parts.');
    this.elements.loading.classList.remove('hidden');

    try {
      const refined = await this.requestRefineReply(
        thread,
        draftReply,
        this.state.analysis || undefined,
        undefined,
        sanitizedInstruction
      );

      if (!refined?.reply) {
        throw new ExtensionError('No refined reply returned.');
      }

      let finalReply = refined.reply;
      let finalChanges = refined.changes;
      let finalVerdict = refined.verdict;

      if (!this.isMeaningfullyDifferentReply(draftReply, finalReply)) {
        const forcedInstruction = this.buildForcedManualEditInstruction(sanitizedInstruction);
        const forcedRefine = await this.requestRefineReply(
          thread,
          draftReply,
          this.state.analysis || undefined,
          undefined,
          forcedInstruction
        );

        if (forcedRefine?.reply && this.isMeaningfullyDifferentReply(draftReply, forcedRefine.reply)) {
          finalReply = forcedRefine.reply;
          finalChanges = forcedRefine.changes.length
            ? [...finalChanges, ...forcedRefine.changes]
            : [...finalChanges, 'Applied stronger rewrite pass'];
          finalVerdict = forcedRefine.verdict || 'Applied stronger rewrite pass.';
          this.showToast('Applied stronger rewrite pass.');
        } else {
          const localFallback = this.applyLocalManualEditFallback(draftReply, sanitizedInstruction);
          if (localFallback && this.isMeaningfullyDifferentReply(draftReply, localFallback)) {
            finalReply = localFallback;
            finalChanges = [...finalChanges, 'Applied local fallback edit'];
            finalVerdict = 'Applied local edit fallback.';
            this.showToast('Applied local fallback edit.');
          } else {
            throw new ExtensionError('Edit did not produce a visible change. Try a more specific request.');
          }
        }
      }

      this.state.currentReply = finalReply;
      this.state.wasManuallyEdited = true;
      this.state.latestSignal = 'Manual edit applied';
      this.displayReply(finalReply);
      const changesText = finalChanges.length
        ? `Manual edit: ${finalChanges.join(' | ')}`
        : 'Manual edit applied.';
      this.showRefinementSummary(`${changesText} ${finalVerdict}`.trim());
      this.elements.manualEditInput.value = '';
      this.persistMeasurementSnapshot();
      this.renderMeasurementStats();
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
      if (!this.state.sessionId) {
        this.state.sessionId = this.buildSessionId();
      }
      this.state.currentReply = '';
      this.state.firstDraft = '';
      this.state.analysis = null;
      this.state.wasCopied = false;
      this.state.wasManuallyEdited = false;
      this.state.alignmentCorrectionUsed = false;
      this.state.latestSignal = null;
      this.state.replyFeedback = null;
      this.state.replyFeedbackStage = null;
      this.state.metricsExpanded = false;
      this.state.analysisExpanded = false;
      this.state.metricsPanelVisible = false;
      this.elements.replyOutput.classList.add('hidden');
      this.elements.analysisPanel.classList.add('hidden');
      this.elements.refinementSummary.classList.add('hidden');
      this.resetRevisionEditor();
      this.setMetricsExpanded(false);
      this.setMetricsPanelVisible(false);
      this.renderMeasurementStats();
      this.scheduleAutoRun(this.elements.threadInput.value.trim());
    }

    if (!hasContent && !this.state.currentReply) {
      if (this.autoRunTimer !== null) {
        window.clearTimeout(this.autoRunTimer);
        this.autoRunTimer = null;
      }
      this.updateUIState('empty');
    }

    this.updateThreadStatus();
    this.updateSaveNextAvailability();
  }

  private scheduleAutoRun(thread: string): void {
    this.cancelAutoRun();

    if (thread.length < 25 || this.state.isRunningPipeline) return;

    this.autoRunTimer = window.setTimeout(() => {
      this.autoRunTimer = null;
      void this.runAutoPipeline(thread);
    }, 1200);
  }

  /**
   * Clear all data
   */
  private clearAll(): void {
    this.cancelAutoRun();
    this.elements.threadInput.value = '';
    this.state.currentReply = '';
    this.state.firstDraft = '';
    this.state.analysis = null;
    this.state.wasCopied = false;
    this.state.wasManuallyEdited = false;
    this.state.alignmentCorrectionUsed = false;
    this.state.latestSignal = null;
    this.state.replyFeedback = null;
    this.state.replyFeedbackStage = null;
    this.state.metricsExpanded = false;
    this.state.analysisExpanded = false;
    this.state.metricsPanelVisible = false;
    this.state.sessionId = '';
    this.updateUIState('empty');
    this.elements.analysisPanel.classList.add('hidden');
    this.elements.analysisLoading.classList.add('hidden');
    this.elements.refinementSummary.classList.add('hidden');
    this.resetRevisionEditor();
    this.setMetricsExpanded(false);
    this.setMetricsPanelVisible(false);
    this.updateThreadStatus();
    this.updateSaveNextAvailability();
    this.renderMeasurementStats();
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
    this.elements.flowCard.setAttribute('data-ui-state', state);

    // Hide all states
    this.elements.loading.classList.add('hidden');
    this.elements.errorState.classList.add('hidden');
    this.elements.replyOutput.classList.add('hidden');
    this.elements.emptyState.classList.add('hidden');
    this.elements.openRevisionBtn.classList.add('hidden');
    this.elements.analysisPanel.classList.add('hidden');
    this.elements.metricsPanelToggleBtn.classList.add('hidden');
    this.elements.replySaveNextBtn.disabled = state === 'loading' || !this.state.currentReply;
    this.elements.primaryActionBtn.disabled = state === 'loading';
    if (state !== 'success') {
      this.setAnalysisExpanded(false);
      this.setMetricsPanelVisible(false);
    }

    // Show relevant state
    switch (state) {
      case 'loading':
        this.elements.loading.classList.remove('hidden');
        this.setFlowCardMeta('Working', 'Processing thread', 'Analyzing, drafting, and refining your reply now.');
        break;
      case 'error':
        this.elements.errorState.classList.remove('hidden');
        this.setFlowCardMeta('Action needed', 'Could not finish run', 'Try again after checking thread content.');
        break;
      case 'success':
        this.elements.analysisPanel.classList.remove('hidden');
        this.elements.replyOutput.classList.remove('hidden');
        this.elements.openRevisionBtn.classList.remove('hidden');
        this.elements.metricsPanelToggleBtn.classList.remove('hidden');
        this.setFlowCardMeta('Ready', 'Reply generated', 'Review, optionally edit, then copy or save for the next lead.');
        break;
      case 'empty':
      default:
        this.elements.emptyState.classList.remove('hidden');
        this.setFlowCardMeta('Ready', 'Waiting for thread', 'Paste context or click Draft Reply to import and run.');
        break;
    }

    this.updateThreadStatus();
    this.updateSaveNextAvailability();
  }

  /**
   * Display generated reply
   */
  private displayReply(reply: string): void {
    this.elements.replyContent.textContent = reply;
    this.elements.replyOutput.classList.remove('hidden');
    this.setMetricsPanelVisible(false);
    this.updateThreadStatus();
    this.updateSaveNextAvailability();
    this.elements.copyBtn.focus();
  }

  private showRefinementSummary(message: string): void {
    this.elements.refinementSummary.textContent = message;
    this.elements.refinementSummary.classList.remove('hidden');
  }

  private setLoadingMessage(message: string): void {
    this.elements.loadingMessage.textContent = message;
    this.updateThreadStatus();
  }

  private setLoadingSubtext(message: string): void {
    this.elements.loadingSubtext.textContent = message;
  }

  private updateThreadStatus(): void {
    const thread = this.elements.threadInput.value.trim();

    if (!thread) {
      this.elements.threadStatus.textContent = 'Ready when you are.';
      return;
    }

    if (this.state.isRunningPipeline) {
      this.elements.threadStatus.textContent = 'Running pipeline...';
      return;
    }

    if (thread.length < 25) {
      this.elements.threadStatus.textContent = 'Add a bit more context for better quality.';
      return;
    }

    this.elements.threadStatus.textContent = this.state.currentReply
      ? 'Reply ready. Copy or Save & Next.'
      : 'Thread ready. Click Draft Reply.';
  }

  private updateSaveNextAvailability(): void {
    const canSave = Boolean(this.elements.threadInput.value.trim() && this.state.currentReply);
    this.elements.replySaveNextBtn.disabled = !canSave || this.state.isRunningPipeline;
  }

  private setMetricsExpanded(expanded: boolean): void {
    this.state.metricsExpanded = expanded;
    this.elements.metricsDetails.classList.toggle('hidden', !expanded);
    this.elements.metricsToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    this.elements.metricsToggleBtn.textContent = expanded ? 'Hide details' : 'Show details';
  }

  private toggleMetricsDetails(): void {
    this.setMetricsExpanded(!this.state.metricsExpanded);
  }

  private setPipelineStage(stage: 'analysis' | 'draft' | 'refine' | 'done'): void {
    this.elements.loading.setAttribute('data-stage', stage);

    const stepOrder: Array<'analysis' | 'draft' | 'refine'> = ['analysis', 'draft', 'refine'];
    this.elements.progressSteps.forEach((step) => {
      const stepStage = step.getAttribute('data-stage-step') as typeof stepOrder[number] | null;
      if (!stepStage) return;

      step.classList.remove('is-active', 'is-complete', 'is-pending');
      const currentIndex = stepOrder.indexOf(stage === 'done' ? 'refine' : stage);
      const stepIndex = stepOrder.indexOf(stepStage);

      if (stage === 'done' || stepIndex < currentIndex) {
        step.classList.add('is-complete');
      } else if (stepIndex === currentIndex) {
        step.classList.add('is-active');
      } else {
        step.classList.add('is-pending');
      }
    });

    if (stage === 'analysis') {
      this.setFlowCardMeta('Working', 'Analyzing thread', 'Extracting intent, friction, and the best angle.');
    } else if (stage === 'draft') {
      this.setFlowCardMeta('Working', 'Drafting reply', 'Generating a first pass from the analysis.');
    } else if (stage === 'refine') {
      this.setFlowCardMeta('Working', 'Refining message', 'Tightening tone and alignment before final output.');
    } else {
      this.setFlowCardMeta('Ready', 'Reply generated', 'Review, optionally edit, then copy or save.');
    }
  }

  private setFlowCardMeta(badge: string, title: string, hint: string): void {
    this.elements.flowStateBadge.textContent = badge;
    this.elements.flowStateTitle.textContent = title;
    this.elements.flowStateHint.textContent = hint;
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
    const safeInstruction = typeof editInstruction === 'string'
      ? this.sanitizeEditInstruction(editInstruction)
      : undefined;

    const response: RefineReplyResponse = await chrome.runtime.sendMessage({
      action: 'refineReply',
      thread,
      draftReply,
      analysis,
      editInstruction: safeInstruction
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

  private buildAutoRefineInstruction(analysis: ConversationAnalysis, draftReply: string): string | undefined {
    if (this.shouldPitchStrategyCall(analysis, this.elements.threadInput.value) && !this.replyContainsCallInvite(draftReply)) {
      return this.buildAlignmentCorrectionInstruction(analysis);
    }

    return undefined;
  }

  private requiresReplyRealignment(analysis: ConversationAnalysis, thread: string, reply: string): boolean {
    if (this.shouldPitchStrategyCall(analysis, thread)) {
      return !this.replyContainsCallInvite(reply);
    }

    return false;
  }

  private shouldPitchStrategyCall(analysis: ConversationAnalysis, thread: string): boolean {
    if (this.shouldAvoidHardPitch(analysis, thread)) {
      return false;
    }

    const combinedAnalysis = [
      analysis.intent,
      analysis.summary,
      analysis.recommendedAngle
    ].join(' ').toLowerCase();

    return (
      combinedAnalysis.includes('strategy call') ||
      combinedAnalysis.includes('pitch strategy call') ||
      combinedAnalysis.includes('booked call') ||
      combinedAnalysis.includes('call block') ||
      combinedAnalysis.includes('scheduling preference') ||
      combinedAnalysis.includes('weekdays and am or pm')
    );
  }

  private shouldAvoidHardPitch(analysis: ConversationAnalysis, thread: string): boolean {
    const combined = [
      analysis.summary,
      analysis.intent,
      analysis.recommendedAngle,
      analysis.objections.join(' '),
      thread
    ].join(' ').toLowerCase();

    const softGatingSignals = [
      'if ownership intent aligns',
      'else qualify',
      'qualify ownership preference first',
      'not fully core fit',
      'briefly explain',
      'what do you do'
    ];

    const lowReadinessSignals = [
      "can't legally work",
      'cannot legally work',
      'student',
      'school',
      'low availability',
      'not sure',
      "don't know yet",
      'dont know yet',
      'no idea where to start',
      'low responsibility',
      "don't want too much responsibility",
      'work in someone else',
      'may or may not'
    ];

    const hasSoftGatingSignal = softGatingSignals.some((signal) => combined.includes(signal));
    const lowReadinessHits = lowReadinessSignals.filter((signal) => combined.includes(signal)).length;
    return hasSoftGatingSignal || lowReadinessHits >= 2;
  }

  private replyContainsCallInvite(reply: string): boolean {
    const normalizedReply = reply.toLowerCase();

    return (
      /\bstrategy call\b/.test(normalizedReply) ||
      /\bbook (a |that )?call\b/.test(normalizedReply) ||
      /\bhop on a call\b/.test(normalizedReply) ||
      /\bjump on a call\b/.test(normalizedReply) ||
      /\bschedule\b/.test(normalizedReply) ||
      /\bweekdays?\b/.test(normalizedReply) ||
      /\bam or pm\b/.test(normalizedReply) ||
      /\bthis is exactly what .* call\b/.test(normalizedReply)
    );
  }

  private buildAlignmentCorrectionInstruction(analysis: ConversationAnalysis): string {
    return [
      'The current draft does not match the recommended angle.',
      `Recommended angle: ${analysis.recommendedAngle}`,
      'Rewrite it so the message clearly pitches the strategy call instead of asking more qualifying questions.',
      'Use a rigid PT Biz booking structure in this exact order:',
      '1) energetic acknowledgment tied to their exact setup,',
      '2) validation + this is exactly what we map out on a strategy call,',
      '3) 3 concrete areas we would map on the call customized to this lead,',
      '4) positioned fit statement (not for everyone / niched and specialized),',
      '5) value frame (even if they do not move forward, this clarity helps),',
      '6) exact CTA asking weekdays and AM or PM.',
      'Do not abbreviate. Do not collapse this into 1-2 short lines. Keep it conversational Jack voice with full structure.'
    ].join(' ');
  }

  private sanitizeEditInstruction(editInstruction: string): string {
    const normalized = editInstruction.replace(/\s+/g, ' ').trim();
    if (normalized.length <= MAX_EDIT_INSTRUCTION_LENGTH) {
      return normalized;
    }

    this.showToast('Long edit shortened for reliability. Keep key intent up front.');
    return `${normalized.slice(0, MAX_EDIT_INSTRUCTION_LENGTH)}...`;
  }

  private buildForcedManualEditInstruction(userInstruction: string): string {
    return [
      `User request: ${userInstruction}`,
      'Rewrite the reply so it is meaningfully different from the original.',
      'Do not keep the same sentence structure.',
      'Change wording and cadence while preserving intent.',
      'Return only the final rewritten reply.'
    ].join(' ');
  }

  private isMeaningfullyDifferentReply(original: string, revised: string): boolean {
    const normalize = (value: string) => value
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const a = normalize(original);
    const b = normalize(revised);
    if (!a || !b) return false;
    if (a === b) return false;

    const tokenSet = (value: string): Set<string> => new Set(value.split(' ').filter(Boolean));
    const aTokens = tokenSet(a);
    const bTokens = tokenSet(b);
    const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
    const union = new Set([...aTokens, ...bTokens]).size || 1;
    const jaccard = intersection / union;
    const relativeLengthDelta = Math.abs(a.length - b.length) / Math.max(a.length, 1);

    return jaccard < 0.92 || relativeLengthDelta >= MIN_MANUAL_EDIT_CHANGE_RATIO;
  }

  private applyLocalManualEditFallback(draftReply: string, instruction: string): string | null {
    const normalizedInstruction = instruction.toLowerCase();
    let result = draftReply.trim();
    let changed = false;

    if (/\bshort|shorter|condense|concise\b/.test(normalizedInstruction)) {
      const sentences = result.split(/(?<=[.!?])\s+/).filter(Boolean);
      if (sentences.length > 2) {
        const first = sentences[0];
        const lastQuestion = [...sentences].reverse().find((sentence) => sentence.includes('?')) || sentences[1];
        result = `${first} ${lastQuestion}`.trim();
        changed = true;
      }
    }

    if (/\bdirect|confident|stronger\b/.test(normalizedInstruction)) {
      const before = result;
      result = result
        .replace(/\b(maybe|kind of|sort of|probably|i think|might)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      changed = changed || before !== result;
    }

    if (/\bwarm|warmer|friendly\b/.test(normalizedInstruction)) {
      const warmPrefix = 'Appreciate you sharing this.';
      if (!result.toLowerCase().startsWith('appreciate you sharing this')) {
        result = `${warmPrefix} ${result}`;
        changed = true;
      }
    }

    if (/\bnatural|human|less robotic\b/.test(normalizedInstruction)) {
      const before = result;
      result = result
        .replace(/This is exactly what we map out on a strategy call/gi, "This is exactly what we'd map out on a quick strategy call")
        .replace(/so you know what to do next either way/gi, 'so you leave with a clear next step either way');
      changed = changed || before !== result;
    }

    return changed ? result : null;
  }

  private buildGuaranteedStrategyCallReply(analysis: ConversationAnalysis, thread: string): string {
    const normalizedThread = thread.toLowerCase();
    const mentionCashBased = /cash|cash pay|cash-based/.test(normalizedThread)
      || /cash|cash pay|cash-based/.test(analysis.intent.toLowerCase())
      || /cash|cash pay|cash-based/.test(analysis.recommendedAngle.toLowerCase());
    const mentionsHybrid = /hybrid/.test(normalizedThread) || /hybrid/.test(analysis.recommendedAngle.toLowerCase());
    const mentionsNeuro = /neuro/.test(normalizedThread);
    const mentionsOrtho = /ortho|sports/.test(normalizedThread);

    const setupLine = mentionsHybrid
      ? 'Love this, and your hybrid-now with cash-transition thinking is exactly the kind of setup we help with all the time.'
      : 'Love this, and your setup is exactly the kind of fit we help with all the time.';
    const validation = mentionCashBased
      ? 'Everything you shared is exactly what we map out on a strategy call for cash based and hybrid practices.'
      : 'Everything you shared is exactly what we map out on a strategy call.';

    const areaOne = mentionsHybrid
      ? 'how to structure the hybrid model now so it supports a clean cash transition later'
      : 'how to structure your offer and model for your stage right now';
    const areaTwo = mentionsNeuro || mentionsOrtho
      ? `how to position your ${(mentionsNeuro ? 'neuro ' : '')}${(mentionsNeuro && mentionsOrtho) ? 'and ' : ''}${(mentionsOrtho ? 'ortho/sports ' : '')}focus so the right patients clearly see the value`
      : 'how to position your niche so the right patients clearly see the value';
    const areaThree = 'what your launch sequence should look like so you are not stuck in trial and error';

    const fitLine = 'This is not something we offer to everyone off the bat since our work is pretty niched and specialized, but based on what you shared you seem like a strong fit for this conversation.';
    const valueLine = 'And even if you decided not to move forward with anything, getting this clarity would likely save you a lot of time and mistakes early on.';
    const close = 'If you are open to it, what weekdays tend to work best for you, and do you prefer AM or PM?';

    return [
      setupLine,
      validation,
      `On that call, we would map 3 things: ${areaOne}, ${areaTwo}, and ${areaThree}.`,
      fitLine,
      valueLine,
      close
    ].join(' ');
  }

  private buildAnalysisNotes(analysis: ConversationAnalysis): string {
    const objections = analysis.objections.length ? analysis.objections.join('; ') : 'None';
    return [
      `Summary: ${analysis.summary}`,
      `Intent: ${analysis.intent}`,
      `Recommended Angle: ${analysis.recommendedAngle}`,
      `Main Friction: ${objections}`,
      `Confidence: ${analysis.confidence}`
    ].join('\n');
  }

  private renderAnalysis(analysis: ConversationAnalysis): void {
    const previewParts = [analysis.intent, analysis.recommendedAngle]
      .map((part) => part.trim())
      .filter(Boolean);

    this.elements.analysisPreview.textContent = previewParts.join(' ');
    this.elements.analysisSummary.textContent = analysis.summary;
    this.elements.analysisIntent.textContent = analysis.intent;
    this.elements.analysisAngle.textContent = analysis.recommendedAngle;
    this.elements.analysisConfidence.textContent = analysis.confidence;
    this.elements.analysisObjections.innerHTML = '';

    const objections = analysis.objections.filter((objection) => objection.trim().length > 0);
    this.elements.analysisObjectionGroup.classList.toggle('hidden', objections.length === 0);

    objections.forEach((objection) => {
      const item = document.createElement('li');
      item.className = 'analysis-list__item';
      item.textContent = objection;
      this.elements.analysisObjections.appendChild(item);
    });

    this.setAnalysisExpanded(false);
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

  private getMeasurementEntries(): MeasurementEntry[] {
    try {
      const raw = localStorage.getItem('bizcloser_measurements_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed as MeasurementEntry[] : [];
    } catch {
      return [];
    }
  }

  private persistMeasurementSnapshot(): void {
    const thread = this.elements.threadInput.value.trim();
    if (!thread) return;

    const entries = this.getMeasurementEntries();
    const id = this.buildMeasurementId(thread);
    const snapshot: MeasurementEntry = {
      id,
      sessionId: this.state.sessionId || id,
      createdAt: new Date().toISOString(),
      threadLength: thread.length,
      hadAnalysis: Boolean(this.state.analysis),
      firstDraftGenerated: Boolean(this.state.firstDraft),
      refineApplied: Boolean(this.state.firstDraft && this.state.currentReply && this.state.firstDraft !== this.state.currentReply),
      alignmentCorrectionUsed: this.state.alignmentCorrectionUsed,
      copied: this.state.wasCopied,
      manuallyEdited: this.state.wasManuallyEdited,
      latestSignal: this.state.latestSignal,
      replyFeedback: this.state.replyFeedback,
      replyFeedbackStage: this.state.replyFeedbackStage
    };

    const existingIndex = entries.findIndex((entry) => entry.id === id);
    if (existingIndex >= 0) {
      entries[existingIndex] = snapshot;
    } else {
      entries.unshift(snapshot);
    }

    localStorage.setItem('bizcloser_measurements_v1', JSON.stringify(entries.slice(0, 200)));
    this.scheduleLocalSync();
  }

  private buildMeasurementId(thread: string): string {
    const basis = `${this.state.sessionId || this.buildSessionId()}|${thread.slice(0, 80)}|${this.state.firstDraft.slice(0, 80)}`;
    return btoa(unescape(encodeURIComponent(basis))).slice(0, 32);
  }

  private buildSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private renderMeasurementStats(): void {
    const entries = this.getMeasurementEntries();
    const total = entries.length;
    const feedbackEntries = entries.filter((entry) => entry.replyFeedback === 'up' || entry.replyFeedback === 'down');

    const initialDraftFeedback = feedbackEntries.filter(
      (entry) => (entry.replyFeedbackStage || 'reply') === 'reply'
    );
    const initialDraftAccepted = initialDraftFeedback.filter((entry) => entry.replyFeedback === 'up').length;

    const postRefineFeedback = feedbackEntries.filter(
      (entry) => (entry.replyFeedbackStage || 'reply') === 'refine'
    );
    const postRefineAccepted = postRefineFeedback.filter((entry) => entry.replyFeedback === 'up').length;

    const manualEditFeedback = feedbackEntries.filter(
      (entry) => (entry.replyFeedbackStage || null) === 'manual'
    );
    const manualEditAccepted = manualEditFeedback.filter((entry) => entry.replyFeedback === 'up').length;

    const replySessions = entries.filter((entry) => entry.firstDraftGenerated).length;
    const copiedReplies = entries.filter((entry) => entry.copied).length;

    const latestSignal = entries.find((entry) => entry.latestSignal)?.latestSignal || this.state.latestSignal;

    this.elements.metricSessions.textContent = total ? `${total} tracked replies` : 'No replies tracked yet';
    this.elements.metricCopyRate.textContent = initialDraftFeedback.length
      ? `${Math.round((initialDraftAccepted / initialDraftFeedback.length) * 100)}% (${initialDraftAccepted}/${initialDraftFeedback.length})`
      : 'No explicit draft feedback yet';
    this.elements.metricEditRate.textContent = postRefineFeedback.length
      ? `${Math.round((postRefineAccepted / postRefineFeedback.length) * 100)}% (${postRefineAccepted}/${postRefineFeedback.length})`
      : 'No explicit refine feedback yet';
    this.elements.metricBookedRate.textContent = manualEditFeedback.length
      ? `${Math.round((manualEditAccepted / manualEditFeedback.length) * 100)}% (${manualEditAccepted}/${manualEditFeedback.length})`
      : 'No explicit manual-edit feedback yet';
    this.elements.metricRefineLift.textContent = replySessions
      ? `${Math.round((copiedReplies / replySessions) * 100)}% (${copiedReplies}/${replySessions})`
      : 'No reply sessions yet';
    this.elements.metricLatestOutcome.textContent = latestSignal || 'No signal logged yet';

    const qualityLabel = this.state.currentReply
      ? this.state.wasManuallyEdited
        ? 'Edited'
        : this.state.alignmentCorrectionUsed
          ? 'Realigned'
          : this.state.firstDraft && this.state.firstDraft !== this.state.currentReply
            ? 'Refined'
            : 'Draft only'
      : 'Tracking live';

    this.elements.qualityBadge.textContent = qualityLabel;
    this.elements.metricsPanelToggleBtn.classList.toggle('hidden', !this.state.currentReply && total === 0);

    this.updateSaveNextAvailability();
  }

  private scheduleLocalSync(): void {
    if (this.localSyncTimer !== null) {
      window.clearTimeout(this.localSyncTimer);
    }

    this.localSyncTimer = window.setTimeout(() => {
      this.localSyncTimer = null;
      void this.syncLocalStorageDataToBackend();
    }, 1200);
  }

  private getSyncedIds(storageKey: string): Set<string> {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private setSyncedIds(storageKey: string, ids: Set<string>): void {
    localStorage.setItem(storageKey, JSON.stringify([...ids].slice(-1000)));
  }

  private getLocalHistoryEntriesForSync(): LocalHistorySnapshot[] {
    try {
      const raw = localStorage.getItem('bizcloser_history_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((entry) => entry && typeof entry.thread === 'string' && typeof entry.reply === 'string')
        .map((entry) => {
          const id = this.buildLocalHistorySyncId(entry);
          return {
            id,
            thread: entry.thread,
            reply: entry.reply,
            analysis: entry.analysis,
            timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
            metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : undefined
          } as LocalHistorySnapshot;
        });
    } catch {
      return [];
    }
  }

  private buildLocalHistorySyncId(entry: Record<string, unknown>): string {
    const thread = typeof entry.thread === 'string' ? entry.thread : '';
    const reply = typeof entry.reply === 'string' ? entry.reply : '';
    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : '';
    const basis = `history|${timestamp}|${thread.slice(0, 180)}|${reply.slice(0, 180)}`;
    return btoa(unescape(encodeURIComponent(basis))).replace(/=+$/g, '').slice(0, 48);
  }

  private getLocalMeasurementEntriesForSync(): LocalMeasurementSnapshot[] {
    return this.getMeasurementEntries().map((entry) => ({
      id: entry.id,
      sessionId: entry.sessionId,
      createdAt: entry.createdAt,
      threadLength: entry.threadLength,
      hadAnalysis: entry.hadAnalysis,
      firstDraftGenerated: entry.firstDraftGenerated,
      refineApplied: entry.refineApplied,
      alignmentCorrectionUsed: entry.alignmentCorrectionUsed,
      copied: entry.copied,
      manuallyEdited: entry.manuallyEdited,
      latestSignal: entry.latestSignal,
      replyFeedback: entry.replyFeedback,
      replyFeedbackStage: entry.replyFeedbackStage || null
    }));
  }

  private async syncLocalStorageDataToBackend(): Promise<void> {
    if (this.syncInFlight) return;

    const historyEntries = this.getLocalHistoryEntriesForSync();
    const measurementEntries = this.getLocalMeasurementEntriesForSync();
    if (!historyEntries.length && !measurementEntries.length) return;

    const syncedHistoryIds = this.getSyncedIds(HISTORY_SYNC_IDS_KEY);
    const syncedMeasurementIds = this.getSyncedIds(MEASUREMENT_SYNC_IDS_KEY);

    const unsyncedHistory = historyEntries.filter((entry) => !syncedHistoryIds.has(entry.id));
    const unsyncedMeasurements = measurementEntries.filter((entry) => !syncedMeasurementIds.has(entry.id));
    if (!unsyncedHistory.length && !unsyncedMeasurements.length) return;

    this.syncInFlight = true;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'syncLocalData',
        history: unsyncedHistory,
        measurements: unsyncedMeasurements
      }) as SyncLocalDataResponse;

      if (response.error) {
        throw new ExtensionError(response.error);
      }

      unsyncedHistory.forEach((entry) => syncedHistoryIds.add(entry.id));
      unsyncedMeasurements.forEach((entry) => syncedMeasurementIds.add(entry.id));
      this.setSyncedIds(HISTORY_SYNC_IDS_KEY, syncedHistoryIds);
      this.setSyncedIds(MEASUREMENT_SYNC_IDS_KEY, syncedMeasurementIds);

      logger.info('Local storage synced to backend', {
        historySubmitted: unsyncedHistory.length,
        measurementsSubmitted: unsyncedMeasurements.length,
        historySaved: response.data?.historySaved ?? 0,
        measurementsSaved: response.data?.measurementsSaved ?? 0
      });
    } catch (error) {
      logger.warn('Local sync failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.syncInFlight = false;
    }
  }

  /**
   * Second-pass parser for imported text.
   * Keeps conversational blocks and strips common UI/campaign metadata noise.
   */
  private parseImportedConversation(rawText: string): string {
    const lines = this.normalizeImportedLines(rawText)
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

  private normalizeImportedLines(rawText: string): string[] {
    return rawText
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .flatMap((line) => line.split(/\s{2,}/g))
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .map((line) => this.stripImportPrefix(line))
      .filter(Boolean)
      .filter((line) => !this.isImportNoiseLine(line));
  }

  private stripImportPrefix(line: string): string {
    const prefixes = [
      /^message\s*[:\-]\s*/i,
      /^sms\s*[:\-]\s*/i,
      /^text\s*[:\-]\s*/i,
      /^reply\s*[:\-]\s*/i,
      /^conversation\s*[:\-]\s*/i,
      /^thread\s*[:\-]\s*/i
    ];

    let output = line;
    for (const prefix of prefixes) {
      output = output.replace(prefix, '');
    }

    return output.trim();
  }

  private isImportNoiseLine(line: string): boolean {
    const normalized = line.toLowerCase();

    return (
      /^(expand_more|done_all|newest|oldest|mark all as read.*)$/i.test(line) ||
      /^(copy reply|save & next|generate|grab convo|import thread|reply copied to clipboard|copied to clipboard)$/i.test(line) ||
      /^(conversation|thread|details|activity|history|notes|reply|message|messages|loading|searching|search)$/i.test(line) ||
      /^-?\s*sequence$/i.test(line) ||
      /^jack'?s personal line$/i.test(line) ||
      /^to jack'?s personal line$/i.test(line) ||
      /^sent!$/i.test(line) ||
      /^sent from /i.test(line) ||
      /^sent to /i.test(line) ||
      /^received from /i.test(line) ||
      /^used .* personal line/i.test(line) ||
      /^to \+?\d+/i.test(line) ||
      /^from:/i.test(line) ||
      /^to:/i.test(line) ||
      /^primary$/i.test(line) ||
      /^wireless$/i.test(line) ||
      /^(today|yesterday),\s*\d{1,2}:\d{2}\s*(am|pm)/i.test(line) ||
      /^today$/i.test(line) ||
      /^yesterday$/i.test(line) ||
      /^about \d+ (hour|day|minute)s? ago$/i.test(line) ||
      /\b(?:am|pm)\s*(?:edt|est|cst|pst|mst)\b/i.test(line) ||
      /^\d{1,2}:\d{2}\s?(am|pm)$/i.test(line) ||
      /^\+?\d{10,}$/.test(line) ||
      /^(v\d+\.\d+\s+)?sequence(?:\s+(?:status|settings|history|details))?$/i.test(line) ||
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
