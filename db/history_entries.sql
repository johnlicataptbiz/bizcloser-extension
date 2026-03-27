-- Safeguard: only create the table if it does not already exist so
-- repeated deployments or migrations remain idempotent.
CREATE TABLE IF NOT EXISTS history_entries (
  id text PRIMARY KEY,
  thread text NOT NULL,
  reply text NOT NULL,
  analysis jsonb,
  metadata jsonb,
  timestamp timestamptz(6) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
