# Project Debug Rules (Non-Obvious Only)

- Extension uses Vitest with jsdom environment for DOM testing
- Backend implements graceful shutdown handling SIGTERM/SIGINT signals
- Extension mocks Chrome APIs in test setup using vi.fn() from Vitest
- Backend uses Pino logger with structured logging for debugging
- Extension content scripts run at document_idle for proper page loading