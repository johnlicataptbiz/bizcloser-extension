# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Structure
- `bizcloser-backend/`: Node.js/Express API with Prisma ORM and PostgreSQL
- `bizcloser-extension/`: Chrome extension with TypeScript and Webpack

## Non-Obvious Patterns
- Backend CORS allows `chrome-extension://` origins for extension communication
- Backend accepts 10MB request bodies (configured in Express)
- Extension manifest permits localhost:3000 and vercel backend URLs
- Backend uses Pino logger with structured logging
- Extension mocks Chrome APIs in Vitest tests using jsdom
- Backend has postinstall script that runs `prisma generate`
- Extension uses detailed system prompts for OpenAI SMS generation
- Backend implements graceful shutdown handling SIGTERM/SIGINT
- Extension content scripts target Slack and Twilio domains specifically
