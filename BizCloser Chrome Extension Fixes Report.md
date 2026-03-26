# BizCloser Chrome Extension Current State

This note summarizes the current extension architecture after the cleanup pass.

## Current Flow

- The side panel collects or receives a conversation thread.
- The background service worker forwards the thread to the backend.
- The backend owns the system prompt and generates the reply.
- The extension renders the reply and supports copy-to-clipboard.

## Current API Contract

- Endpoint: `https://bizcloser-backend-bdm6kz35v-jack-licatas-projects.vercel.app/api/bizcloser/generate`
- Method: `POST`
- Payload: `{ thread: string }`
- Response: `{ reply: string, ... }`

## Important Notes

- There is no Electron desktop app in the workspace anymore.
- Prompt logic is centralized in the backend.
- The extension should stay thin and avoid duplicating generation policy.

## Active Files

- [/Users/jl/Desktop/apps/bizcloser-extension/src/sidepanel.ts](file:///Users/jl/Desktop/apps/bizcloser-extension/src/sidepanel.ts)
- [/Users/jl/Desktop/apps/bizcloser-extension/src/background.ts](file:///Users/jl/Desktop/apps/bizcloser-extension/src/background.ts)
- [/Users/jl/Desktop/apps/bizcloser-extension/src/api.ts](file:///Users/jl/Desktop/apps/bizcloser-extension/src/api.ts)
- [/Users/jl/Desktop/apps/bizcloser-backend/src/prompts/bizcloser.prompt.ts](file:///Users/jl/Desktop/apps/bizcloser-backend/src/prompts/bizcloser.prompt.ts)
