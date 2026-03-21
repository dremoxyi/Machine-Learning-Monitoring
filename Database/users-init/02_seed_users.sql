BEGIN;

INSERT INTO users (email, password_hash, role)
VALUES
  ('admin@cy-tech.fr', '$2b$12$.qdZ9w1zXfAJYu.kda3lxudEzseP.D4TUw2CtccO8Hm6xPd0mX1E6', 'admin'),
  ('user@cy-tech.fr', '$2b$12$H950Qfpd6MP05u8DKSloheOWZyrKtfpdlzOkZJeroWDxPfPtEbU5.', 'client')
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

COMMIT;
