# Project Documentation Rules (Non-Obvious Only)

- Extension extracts conversations from Slack, Aloware, Twilio DOM structures (not generic scraping)
- Backend uses OpenAI API with custom PT business prompts in src/prompts/
- Knowledge pack built from external text file via scripts/build-knowledge-pack.js
- Prisma Accelerate used for database (not standard PostgreSQL connection)
- Side panel extension with content scripts for conversation extraction