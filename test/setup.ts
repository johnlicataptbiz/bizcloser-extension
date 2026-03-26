// Test setup for BizCloser extension
import { beforeAll, vi } from 'vitest';

// Mock Chrome API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    sendMessage: vi.fn(),
    lastError: null
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn()
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  sidePanel: {
    setPanelBehavior: vi.fn()
  }
};

// Global Chrome API mock
Object.assign(global, { chrome: mockChrome });

// Mock fetch for API tests
global.fetch = vi.fn();

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn()
  }
});