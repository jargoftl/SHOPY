# Tests

Run `npm test` with Node 22.12 or a newer Node 22 release. This runs the existing browser-helper unit tests, the API/frontend production build, then the PostgreSQL/Storage/migration integration suite. The integration suite uses PGlite and synthetic fixtures; database, Storage and email network access are mocked. No live Supabase credentials are required.

`legacy-sqlite/` preserves the old SQLite-specific integration tests as historical references for the pre-migration revision. They depend on better-sqlite3, synchronous database helpers and a DATABASE_PATH-based server, and are not runnable against the PostgreSQL backend. The current integration coverage is in `run.mjs`, with a full source schema fixture in `fixtures/sqlite-schema.sql`. Do not run a blanket `node --test tests/**/*.mjs` against those historical tests.

Offline coverage is not a substitute for the live Supabase, email and Render cutover checks in SETUP-SUPABASE.md.
