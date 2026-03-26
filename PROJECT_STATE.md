# BizCloser Project State

BizCloser currently consists of two active parts:

- `bizcloser-backend/`: Express API with Prisma and PostgreSQL
- `bizcloser-extension/`: Chrome extension that extracts conversations and requests reply generation from the backend

The Electron desktop app has been removed from the workspace.

## Current Flow

1. The extension extracts a conversation from Slack or Twilio.
2. The side panel sends the thread to the background service worker.
3. The background worker forwards the thread to the backend generate endpoint.
4. The backend owns the system prompt and reply generation logic.

## Notes

- The backend is the single source of truth for reply generation behavior.
- The extension should stay thin and UI-focused.
- Any future prompt changes should happen in the backend prompt module, not in the client.
