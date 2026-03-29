# Project Architecture Rules (Non-Obvious Only)

- Monorepo with Express backend and Chrome extension communicating via HTTP
- Extension side panel opens on action click, extracts conversations from active tab
- Custom knowledge pack system for PT business domain knowledge
- Resource link injection system in service layer
- CORS configured specifically for Chrome extension origins
- Single controller test file (not comprehensive test suite)