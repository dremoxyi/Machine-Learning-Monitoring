BEGIN;

INSERT INTO users (email, password_hash, role, firstname, lastname)
VALUES
  ('admin@cy-tech.fr', '$2b$12$5pgEoWtuefPItKWFi8OBP.HC72nA8pPKc5BhoWbDnA3EJotu7CyBO', 'admin', 'Blobi', 'Le Blob'),
  ('alice@cy-tech.fr', '$2b$12$.y.AfNwXbmpl1OMhtxlBZOD8QChdfJZ8jc.YPJf8FvZe9IrN6y8Nu', 'admin', 'Alice', 'Patronne'),
  ('user@cy-tech.fr', '$2b$12$93L3Dcve8ttx51uPrngzg.47lnJK6I0ix8H.Zct/HGY52vj.fSeFm', 'client', 'Bob', 'Leponge'),
  ('charlie@cy-tech.fr', '$2b$12$gDB4VXUhCAx1sycMuS6lQuJRNGWO.wDXfHj0PXj/ynxHd5yOZrVt.', 'client', 'Charlie', 'Client'),
  ('dana@cy-tech.fr', '$2b$12$7V9Po.rgJqOC1LNHWzHoPuOmSG2B8C8djzI0d7rOdlaG78PUu6CWa', 'client', 'Dana', 'Martin')
ON CONFLICT (email) DO UPDATE
SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  firstname = EXCLUDED.firstname,
  lastname = EXCLUDED.lastname;

COMMIT;
