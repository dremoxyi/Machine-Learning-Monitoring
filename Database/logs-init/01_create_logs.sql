CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  level VARCHAR(16) NOT NULL,
  event VARCHAR(128) NOT NULL,
  message TEXT NOT NULL,
  user_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at
  ON app_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_logs_event
  ON app_logs (event);
