/**
 * BizCloser Side Panel Script
 * Handles UI interactions and reply generation
 */

import {
  AnalyzeConversationResponse,
  ConversationAnalysis,
  ExtensionError,
  ExtractConversationResponse,
  GenerateReplyResponse,
  UIState
} from '../types/index';
import { logger } from './logger';

// DOM element references
interface DOMElements {
  threadForm: HTMLFormElement;
  threadInput: HTMLTextAreaElement;
  grabConvoBtn: HTMLButtonElement;
  analyzeBtn: HTMLButtonElement;
  generateBtn: HTMLButtonElement;
  analysisPanel: HTMLElement;
  analysisLoading: HTMLElement;
  analysisSummary: HTMLElement;
  analysisIntent: HTMLElement;
  analysisAngle: HTMLElement;
  analysisObjections: HTMLElement;
  analysisConfidence: HTMLElement;
  loading: HTMLElement;
  errorState: HTMLElement;
  errorMessage: HTMLElement;
  retryBtn: HTMLButtonElement;
  replyOutput: HTMLElement;
  replyContent: HTMLElement;
  copyBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  toast: HTMLElement;
  emptyState: HTMLElement;
}

// State management
interface AppState {
  currentReply: string;
  analysis: ConversationAnalysis | null;
  isGenerating: boolean;
  isAnalyzing: boolean;
  uiState: UIState;
}

/**
 * Main application class
 */
class BizCloserSidePanel {
  private elements: DOMElements;
  private state: AppState;
  private analysisTimer: number | null = null;

  constructor() {
    this.state = {
      currentReply: '',
      analysis: null,
      isGenerating: false,
      isAnalyzing: false,
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
      analyzeBtn: getElement<HTMLButtonElement>('analyzeBtn'),
      generateBtn: getElement<HTMLButtonElement>('generateBtn'),
      analysisPanel: getElement('analysisPanel'),
      analysisLoading: getElement('analysisLoading'),
      analysisSummary: getElement('analysisSummary'),
      analysisIntent: getElement('analysisIntent'),
      analysisAngle: getElement('analysisAngle'),
      analysisObjections: getElement('analysisObjections'),
      analysisConfidence: getElement('analysisConfidence'),
      loading: getElement('loading'),
      errorState: getElement('errorState'),
      errorMessage: getElement('errorMessage'),
      retryBtn: getElement('retryBtn'),
      replyOutput: getElement('replyOutput'),
      replyContent: getElement('replyContent'),
      copyBtn: getElement('copyBtn'),
      clearBtn: getElement('clearBtn'),
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
    this.elements.analyzeBtn.addEventListener('click', () => this.handleAnalyzeClick());
    this.elements.copyBtn.addEventListener('click', () => this.handleCopyClick());
    this.elements.clearBtn.addEventListener('click', () => this.clearAll());
    this.elements.retryBtn.addEventListener('click', () => this.retryGeneration());

    // Input changes
    this.elements.threadInput.addEventListener('input', () => this.handleInputChange());
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

    if (this.state.isGenerating) return;

    await this.generateReply(thread);
  }

  /**
   * Generate reply using background script
   */
  private async generateReply(thread: string): Promise<void> {
    if (!this.state.analysis) {
      await this.analyzeConversation(thread);
    }

    this.state.isGenerating = true;
    this.updateUIState('loading');
    this.hideErrorState();

    try {
      logger.debug('Sending generate request to background', {
        threadLength: thread.length
      });

      const response: GenerateReplyResponse = await chrome.runtime.sendMessage({
        action: 'generateReply',
        thread
      });

      if (response.error) {
        throw new ExtensionError(response.error);
      }

      const data = response.data;
      if (!data?.reply) {
        throw new ExtensionError('No reply generated');
      }

      this.state.currentReply = data.reply;
      this.displayReply(data.reply);
      this.updateUIState('success');

      logger.info('Reply generated and displayed successfully');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate reply. Please try again.';
      logger.error('Generation error', { error: message });
      this.showError(message);
      this.updateUIState('error');
    } finally {
      this.state.isGenerating = false;
    }
  }

  private async handleAnalyzeClick(): Promise<void> {
    const thread = this.elements.threadInput.value.trim();
    if (!thread || this.state.isAnalyzing) return;
    await this.analyzeConversation(thread);
  }

  private async analyzeConversation(thread: string): Promise<void> {
    this.state.isAnalyzing = true;
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

      if (this.elements.threadInput.value.trim() !== thread) {
        logger.debug('Discarding stale analysis result after thread changed');
        return;
      }

      this.state.analysis = response.data;
      this.renderAnalysis(response.data);
      logger.info('Conversation analysis displayed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze conversation.';
      logger.error('Analysis error', { error: message });
      this.showError(message);
    } finally {
      this.state.isAnalyzing = false;
      this.elements.analysisLoading.classList.add('hidden');
    }
  }

  /**
   * Handle grab conversation button click
   */
  private async handleGrabConvoClick(): Promise<void> {
    if (this.state.isGenerating) return;

    try {
      logger.debug('Attempting to import conversation from active tab');
      this.showToast('Importing highlighted or visible thread...');

      const response: ExtractConversationResponse = await chrome.runtime.sendMessage({
        action: 'extractConversation'
      });

      if (response?.conversation) {
        // Paste conversation into textarea
        this.elements.threadInput.value = response.conversation;
        this.elements.threadInput.dispatchEvent(new Event('input')); // Trigger input validation

        // Show success message
        this.showToast('Thread imported successfully!');
        await this.analyzeConversation(response.conversation);

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
    this.elements.generateBtn.disabled = !hasContent || this.state.isGenerating || this.state.isAnalyzing;
    this.elements.analyzeBtn.disabled = !hasContent || this.state.isAnalyzing || this.state.isGenerating;

    if (hasContent) {
      this.state.currentReply = '';
      this.state.analysis = null;
      this.elements.replyOutput.classList.add('hidden');
      this.elements.analysisPanel.classList.add('hidden');
      this.scheduleAnalysis(this.elements.threadInput.value.trim());
    }

    if (!hasContent && !this.state.currentReply) {
      if (this.analysisTimer !== null) {
        window.clearTimeout(this.analysisTimer);
        this.analysisTimer = null;
      }
      this.updateUIState('empty');
    }
  }

  private scheduleAnalysis(thread: string): void {
    if (this.analysisTimer !== null) {
      window.clearTimeout(this.analysisTimer);
    }

    if (thread.length < 25) return;

    this.analysisTimer = window.setTimeout(() => {
      this.analysisTimer = null;
      void this.analyzeConversation(thread);
    }, 500);
  }

  /**
   * Clear all data
   */
  private clearAll(): void {
    if (this.analysisTimer !== null) {
      window.clearTimeout(this.analysisTimer);
      this.analysisTimer = null;
    }
    this.elements.threadInput.value = '';
    this.state.currentReply = '';
    this.state.analysis = null;
    this.updateUIState('empty');
    this.elements.analysisPanel.classList.add('hidden');
    this.elements.analysisLoading.classList.add('hidden');
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
      this.generateReply(thread);
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
        this.elements.generateBtn.disabled = true;
        this.elements.analyzeBtn.disabled = true;
        break;
      case 'error':
        this.elements.errorState.classList.remove('hidden');
        this.elements.generateBtn.disabled = false;
        this.elements.analyzeBtn.disabled = false;
        break;
      case 'success':
        this.elements.replyOutput.classList.remove('hidden');
        this.elements.generateBtn.disabled = false;
        this.elements.analyzeBtn.disabled = false;
        break;
      case 'empty':
      default:
        this.elements.emptyState.classList.remove('hidden');
        this.elements.analyzeBtn.disabled = true;
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

}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BizCloserSidePanel();
});
