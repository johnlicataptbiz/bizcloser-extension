/**
 * BizCloser Side Panel Script
 * Handles UI interactions and reply generation
 */

import { UIState, ExtensionError, GenerateReplyResponse } from '../types/index';
import { logger } from './logger';

// DOM element references
interface DOMElements {
  threadForm: HTMLFormElement;
  threadInput: HTMLTextAreaElement;
  grabConvoBtn: HTMLButtonElement;
  generateBtn: HTMLButtonElement;
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
  isGenerating: boolean;
  uiState: UIState;
}

/**
 * Main application class
 */
class BizCloserSidePanel {
  private elements: DOMElements;
  private state: AppState;

  constructor() {
    this.state = {
      currentReply: '',
      isGenerating: false,
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
      generateBtn: getElement<HTMLButtonElement>('generateBtn'),
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

  /**
   * Handle grab conversation button click
   */
  private async handleGrabConvoClick(): Promise<void> {
    if (this.state.isGenerating) return;

    try {
      logger.debug('Attempting to grab conversation from active tab');
      this.showToast('Importing thread...');

      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

      if (!tab) {
        throw new ExtensionError('No active tab found');
      }

      if (!tab.id) {
        throw new ExtensionError('Tab has no ID');
      }

      // Send message to content script to extract conversation
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractConversation' });

      if (response && response.conversation) {
        // Paste conversation into textarea
        this.elements.threadInput.value = response.conversation;
        this.elements.threadInput.dispatchEvent(new Event('input')); // Trigger input validation

        // Show success message
        this.showToast('Thread imported successfully!');

        // Automatically submit the form
        setTimeout(() => {
          this.elements.threadForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }, 500);

        logger.info('Conversation extracted and form submitted');
      } else {
        throw new ExtensionError('No conversation found on this page. Make sure you\'re on a supported messaging platform.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract conversation. Please check that you\'re on a supported messaging platform.';
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
    this.elements.generateBtn.disabled = !hasContent || this.state.isGenerating;

    if (!hasContent && !this.state.currentReply) {
      this.updateUIState('empty');
    }
  }

  /**
   * Clear all data
   */
  private clearAll(): void {
    this.elements.threadInput.value = '';
    this.state.currentReply = '';
    this.updateUIState('empty');
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
        break;
      case 'error':
        this.elements.errorState.classList.remove('hidden');
        this.elements.generateBtn.disabled = false;
        break;
      case 'success':
        this.elements.replyOutput.classList.remove('hidden');
        this.elements.generateBtn.disabled = false;
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
