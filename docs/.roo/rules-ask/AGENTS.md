# Project Documentation Rules (Non-Obvious Only)

- Backend uses OpenAI API with detailed system prompts for SMS generation
- Extension targets specific domains (Slack, Twilio) with content scripts
- Backend implements CORS for chrome-extension:// origins specifically
- Extension uses Manifest V3 with side panel and background service worker
- Backend has 10MB body limit configuration for large requests