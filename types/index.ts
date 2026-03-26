// Chrome Extension API types
export interface ChromeMessage {
  action: string;
  [key: string]: any;
}

export interface GenerateReplyMessage extends ChromeMessage {
  action: 'generateReply';
  thread: string;
}

export interface AnalyzeConversationMessage extends ChromeMessage {
  action: 'analyzeConversation';
  thread: string;
}

export interface RefineReplyMessage extends ChromeMessage {
  action: 'refineReply';
  thread: string;
  draftReply: string;
  analysis?: ConversationAnalysis;
  editInstruction?: string;
}

export interface SubmitFeedbackMessage extends ChromeMessage {
  action: 'submitFeedback';
  stage: 'analysis' | 'reply' | 'refine';
  sentiment: 'up' | 'down';
  thread: string;
  analysisSummary?: string;
  generatedReply?: string;
  refinedReply?: string;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface ExtractConversationMessage extends ChromeMessage {
  action: 'extractConversation';
}

export interface ConversationResponse {
  conversation: string | null;
  success: boolean;
  error?: string;
}

export interface ExtractConversationResponse {
  conversation: string | null;
  error?: string;
}

export interface GenerateReplyResponse {
  data?: {
    reply: string;
    [key: string]: any;
  };
  error?: string;
}

export interface RefineReplyResult {
  reply: string;
  changes: string[];
  verdict: string;
}

export interface RefineReplyResponse {
  data?: RefineReplyResult;
  error?: string;
}

export interface SubmitFeedbackResponse {
  data?: { ok: true };
  error?: string;
}

export interface ConversationAnalysis {
  summary: string;
  intent: string;
  objections: string[];
  recommendedAngle: string;
  confidence: string;
}

export interface AnalyzeConversationResponse {
  data?: ConversationAnalysis;
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
