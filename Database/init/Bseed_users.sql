CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (email, password_hash, role)
VALUES
  ('admin@local.test', '$2b$10$bXlpufXtgm2rI2p4angva.uSIiPr0N2LzHOVmZFReDzn6kBGx6hBW', 'admin'),
  ('client@local.test', '$2b$10$BoZBDVAZswyvgjiYQylTzuQv22a6A3nBUpuHagTaz/M5g27pD3TZu', 'client')
ON CONFLICT (email) DO NOTHING;
