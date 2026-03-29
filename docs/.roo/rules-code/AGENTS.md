# Project Coding Rules (Non-Obvious Only)

- Backend uses dependency injection pattern with constructor-based service injection
- Extension implements singleton logger pattern (Logger.getInstance())
- Backend validates requests using Zod schemas in controllers
- Extension mocks Chrome APIs in test setup for Vitest compatibility
- Backend uses Pino logger with structured logging and custom prefixes
- Extension uses detailed system prompts embedded in code for OpenAI SMS generation
- Backend implements graceful shutdown with database connection cleanup
- Extension content scripts target specific domains (Slack, Twilio) with run_at document_idle