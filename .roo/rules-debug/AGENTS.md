# Project Debug Rules (Non-Obvious Only)

- Extension logs accessible via Logger.getInstance().logs (stored in memory, not console)
- Backend uses Pino logger with pretty printing in development
- Custom extension audit script at bizcloser-extension/output/playwright/extension-audit/audit_extension.js
- Vercel deployment requires specific environment variables (DATABASE_URL with Prisma Accelerate)
- Test single backend controller with npm test (runs test/generate.controller.test.ts directly)