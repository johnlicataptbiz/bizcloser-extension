// Chrome Extension API types
export interface ChromeMessage {
  action: string;
  [key: string]: any;
}

export interface GenerateReplyMessage extends ChromeMessage {
  action: 'generateReply';
  thread: string;
  prompt: string;
}

export interface ExtractConversationMessage extends ChromeMessage {
  action: 'extractConversation';
}

export interface ConversationResponse {
  conversation: string | null;
  success: boolean;
  error?: string;
}

export interface GenerateReplyResponse {
  data?: {
    reply: string;
    [key: string]: any;
  };
  error?: string;
}

// UI State types
export type UIState = 'empty' | 'loading' | 'success' | 'error';

// Error types
export class ExtensionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

// API Response types
export interface BackendResponse {
  reply: string;
  [key: string]: any;
}

// Content extraction types
export interface MessageSelector {
  selector: string;
  textExtractor?: (element: Element) => string;
}

// Logging types
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
}