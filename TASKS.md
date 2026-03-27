# Tasks

## Active
- [ ] **Decide long-term domain permission scope** - for product/security review, since 2026-03-26
  - Current implementation uses `<all_urls>` for reliability during testing

## Waiting On
- [ ] **Broaden browser audit into assertion-heavy E2E coverage** - the new Playwright audit is useful, but it still behaves more like a guided smoke test than a full regression suite

## Someday
- [ ] **Add richer UI regression checks** - protect the branded side panel against future visual/layout drift

## Done
- [x] ~~Run real browser extension audit~~ (2026-03-26)
  - Installed local `playwright` support and added a repeatable audit harness at `output/playwright/extension-audit/audit_extension.js`
  - Captured real screenshots for empty, generated, edited, and post-save states while exercising the live extension shell
- [x] ~~Enhance side panel onboarding and action hierarchy~~ (2026-03-26)
  - Added live thread-readiness guidance, stronger empty-state onboarding, quick revision shortcuts, and a better save/next flow
  - Reduced ML panel clutter with a summary-first layout and optional details toggle
- [x] ~~Trim build asset weight~~ (2026-03-26)
  - Replaced `assets/logo1sms.webp` with a smaller 160x160 WebP sized for the actual header usage
  - Build warning is gone and the optimized asset still ships into `dist/assets/`
- [x] ~~Validate direct dist load after packaging fix~~ (2026-03-26)
  - Verified the built `dist/sidepanel.html` now resolves `sidepanel.js`
  - Verified `dist/assets/logo1sms.webp` is present for the branded header
- [x] ~~Fix dist sidepanel script path~~ (2026-03-26)
  - Webpack now rewrites the copied `dist/sidepanel.html` script tag to `sidepanel.js`
  - Build now copies `assets/logo1sms.webp` so the branded header also renders when loading `dist/` directly
- [x] ~~Fix Save & Next triggering form submit~~ (2026-03-26)
  - Added `type="button"` so save no longer submits the form
- [x] ~~Stop duplicate pipeline runs from auto-run + manual generate~~ (2026-03-26)
  - Manual submit/save now cancel pending auto-run timers before pipeline actions
