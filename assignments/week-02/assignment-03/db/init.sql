-- db/init.sql — the entire database schema.
--
-- This file is used in TWO places, so there is only ever one definition:
--   1. docker-compose mounts it into /docker-entrypoint-initdb.d/, which Postgres
--      runs automatically the first time it initialises an empty data volume.
--   2. The app runs it at startup too (see repositories/postgresUserRepository.js).
--      Every statement is `IF NOT EXISTS`, so running it twice is harmless.
--
-- Why both? The init hook only fires on a *brand new* volume. Running it from the
-- app as well means the table also exists if you point at an already-created
-- database. A real project would replace this with a migration tool.

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY,
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
