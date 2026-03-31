BEGIN;

INSERT INTO users (email, password_hash, role, firstname, lastname)
VALUES
  ('admin@cy-tech.fr', '$2b$12$.qdZ9w1zXfAJYu.kda3lxudEzseP.D4TUw2CtccO8Hm6xPd0mX1E6', 'admin', 'Blobi', 'Le Blob'),
  ('user@cy-tech.fr', '$2b$12$H950Qfpd6MP05u8DKSloheOWZyrKtfpdlzOkZJeroWDxPfPtEbU5.', 'client', 'Bob', 'L eponge')
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  firstname = EXCLUDED.firstname,
  lastname = EXCLUDED.lastname;

COMMIT;
