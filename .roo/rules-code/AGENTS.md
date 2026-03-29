# Project Coding Rules (Non-Obvious Only)

- Use Logger.getInstance() for all logging in extension code (singleton that stores logs in memory)
- Use AppError class for operational errors in backend (custom error class with status codes)
- Resource links automatically inserted based on keywords in bizcloser-backend/src/services/bizcloser.service.ts
- Run npm run build:knowledge before deployment to build PT business knowledge pack
- CORS must allow chrome-extension:// origins for extension-backend communication
- Test extension with npm run test:extension-audit (custom Playwright audit script)