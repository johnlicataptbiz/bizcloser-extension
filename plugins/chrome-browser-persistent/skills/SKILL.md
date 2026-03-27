---
name: chrome-browser-persistent
description: Launch and attach to persistent Chrome via CDP for end-to-end browser automation in Codex.
---

# Chrome Browser Persistent

Use this skill when you want Codex/Playwright to automate your regular Chrome workflow with a persistent browser session.

## What It Provides

- Standard launcher script for Chrome with remote debugging enabled
- CDP health check script
- Playwright attach script

## Quick Start

Preferred one-command flow from repo root:

```bash
npm run chrome:attach
```

Manual flow:

1. Start persistent Chrome:

```bash
./scripts/start_chrome_persistent.sh
```

2. Verify CDP is reachable:

```bash
node ./scripts/check_cdp_status.mjs
```

3. Attach Playwright to the running browser:

```bash
node ./scripts/attach_playwright_cdp.mjs
```

## Defaults

- CDP endpoint: `http://127.0.0.1:9222`
- Persistent profile dir: `~/.codex/chrome-persistent-profile`

Override with env vars:

- `CHROME_DEBUG_PORT`
- `CHROME_PERSISTENT_PROFILE`
- `CDP_ENDPOINT`
