CREATE TABLE IF NOT EXISTS benchmark_metrics (
  id BIGSERIAL PRIMARY KEY,
  trainer_name VARCHAR(64) NOT NULL,
  run_id VARCHAR(64),
  dataset_name VARCHAR(64),
  step INTEGER,
  latency_ms DOUBLE PRECISION,
  throughput DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  loss DOUBLE PRECISION,
  cpu_percent DOUBLE PRECISION,
  ram_percent DOUBLE PRECISION,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_metrics_created_at
  ON benchmark_metrics (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_benchmark_metrics_trainer_name
  ON benchmark_metrics (trainer_name);

CREATE INDEX IF NOT EXISTS idx_benchmark_metrics_dataset_name
  ON benchmark_metrics (dataset_name);
