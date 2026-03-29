# Project Architecture Rules (Non-Obvious Only)

- Backend uses Prisma ORM with PostgreSQL and automatic migration generation
- Extension communicates with backend via specific CORS configuration
- Backend implements dependency injection with service/repository pattern
- Extension uses Webpack for bundling with TypeScript compilation
- Backend has structured logging with Pino for observability