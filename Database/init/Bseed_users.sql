CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (email, password_hash, role)
VALUES
  ('admin@local.cy', '$2b$12$M8BCpQ3UJih06lZImM/Uj.2FvfN715ztBTJNj4kDChJoZAUXSlxXG', 'admin'),
  ('client@local.cy', '$2b$12$dcwnr43LR7x4oNoTuhZCru9Wc/eL4XkjXxh9gkhZHOzFmSiVEs/N6', 'client')
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;
