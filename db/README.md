# BizCloser Prisma / Postgres Guide

This directory captures the pieces necessary to declare, validate, and operate the `history_entries` table that powers the BizCloser ML pipeline and analytics.

## 1. Table schema

Run `db/history_entries.sql` against the target Postgres database (or embed the snippet inside a Prisma migration) to guarantee the table is present before the extension backend persists replies.

If you manage your schema with Prisma, the equivalent model looks like:

```prisma
model HistoryEntry {
  id        String   @id
  thread    String
  reply     String
  analysis  Json?
  metadata  Json?
  timestamp DateTime
  createdAt DateTime @map("created_at") @default(now())

  @@map("history_entries")
}
```

Confirm that the `schema.prisma` file references the same Postgres datasource and that `prisma generate` / `prisma migrate deploy` are part of your CI or deployment pipeline.

## 2. Verification checklist

1. ***Schema existance*** – connect to the Postgres instance (`psql $DATABASE_URL` or via your client) and run `\d history_entries`. The columns should match `thread`, `reply`, `analysis`, `metadata`, `timestamp`, and `created_at`.
2. ***Fresh slug*** – look for rows with `created_at` within the last few minutes after you generate a reply. Running `SELECT id, created_at, timestamp FROM history_entries ORDER BY created_at DESC LIMIT 5;` helps prove the table is used.
3. ***JSON payloads*** – if you store ML analysis/metadata, run `SELECT jsonb_pretty(analysis), jsonb_pretty(metadata) FROM history_entries ORDER BY created_at DESC LIMIT 1;` to ensure the schema accepts the two JSONB fields without errors.

Document any migration in your version control so the next deployment team understands the schema change.

## 3. Backfill considerations

If you expect historical Slack/SMS conversations to seed `history_entries`, follow these steps:

1. Export the existing `slack-sms-insights` data (for example, the `sms_events` table) into a temporary staging table or CSV.
2. Write a script (Python/Node/SQL) that:
   * Normalizes each row into `history_entries` format (`thread`, `reply`, optional `analysis`, `metadata`, `timestamp`).
   * Generates stable `id` values (UUID or hash of the thread/reply pair).
   * Inserts rows with `ON CONFLICT (id) DO NOTHING` to avoid duplicates.
3. Run the script against the production database, verify row counts (`SELECT COUNT(*) FROM history_entries;`), and keep the staging data for audit.

## 4. Slack-SMS insights sync

Maintain a tight coupling between `history_entries` and `slack-sms-insights` by:

* Including provenance metadata (e.g., `metadata->>'source' = 'slack-sms-insights'`) so you can trace which replies originated from that dataset.
* Periodically reconciling counts (`select count(*) from history_entries where metadata->>'source' = 'slack-sms-insights';`).
* Ensuring any downstream ML models or analytics reference `timestamp` and `analysis` so they can filter by fresh context.

## 5. Next steps

* Add `DATABASE_URL` (and any Prisma service token) to your environment/Secrets and verify the backend can reach it.
* If you do not already have Prisma migrations, create `prisma/migrations/<timestamp>_history_entries` with the SQL above.
* Consider adding a monitoring alert when the insert rate drops or when `history_entries` is missing expected columns.
