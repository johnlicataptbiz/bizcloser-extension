# Manual Design-to-Code Mapping (Code Connect Fallback)

This file is the fallback source of truth when Figma Code Connect is unavailable due to seat permissions.

Figma file:
- https://www.figma.com/design/wQJTP68zlUKCwJWUjH2PVs
- https://www.figma.com/design/gdsKv196l5LT02alRs1Akm/BizCloser-Side-Panel-Color-Refresh?node-id=4-3&t=lljrM8QmN6tcJq8I-1

Machine-readable bridge:
- [FIGMA_BRIDGE.json](/Users/jl/Developer/bizcloser/extension/FIGMA_BRIDGE.json)

Use this table for every mapped item:

| Figma Node ID | Layer / Intent | Code Path | Component / Token | Status | Owner / Notes |
|---|---|---|---|---|---|
| 7:2 | Side panel state gallery | /sidepanel.html + /sidepanel.css + /src/sidepanel.ts | Workflow shell | Mapped | Source of truth for empty/loading/success/error states |
| 6:11 | State badge | /sidepanel.html + /sidepanel.css + /src/sidepanel.ts | State Badge | Mapped | Ready / Working / Error variants |
| 6:19 | Action buttons | /sidepanel.html + /sidepanel.css | Action Button | Mapped | Primary / Secondary / Ghost |
| 6:20 | Insight card | /sidepanel.html + /sidepanel.css + /src/sidepanel.ts | Insight Card | Mapped | Analysis summary and reply rationale |
| 6:24 | Toast | /sidepanel.html + /sidepanel.css + /src/sidepanel.ts | Toast | Mapped | Transient feedback banner |
| 8:41 | Manual mapping block | /DESIGN_MAPPING_MANUAL.md + /FIGMA_BRIDGE.json | Manual bridge | In progress | Fallback source of truth while Code Connect is blocked |

## Workflow

1. Capture the Figma node ID and intended behavior.
2. Map it to the exact implementation file and component/token.
3. Set status (`Pending`, `In progress`, `Mapped`, `Shipped`).
4. Add the commit or PR reference in notes when complete.

## Status Legend

- `Pending`: Not started
- `In progress`: Active implementation
- `Mapped`: Structure is implemented, waiting on polish/QA
- `Shipped`: Implemented, tested, and deployed
