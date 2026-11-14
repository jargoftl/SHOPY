# SHOPY: Supabase + free Render setup

This package changes persistence from SQLite to Supabase PostgreSQL and private Supabase Storage. It does not connect to your account, move your real data, push to GitHub, or deploy automatically. No paid plan has been enabled.

Keep your existing project folder and SQLite database as a backup. Work in a separate copy of the project until the cutover is verified.

## 1. Prepare Supabase

Your existing free `shopy` project can be used. You do not need Supabase Auth or a GitHub integration: your existing Express login, sessions, roles and APIs remain in use.

1. In **Storage**, create a bucket named **shop-uploads**. Keep **Public bucket OFF**. Allow PNG, JPEG and WebP files and a maximum size of 2 MB. Do not add public read/write policies for receipts.
2. Click **Connect** at the top of the Supabase project. Choose the **Session pooler** PostgreSQL URI (normally port **5432**). Session pooling avoids common IPv4/direct-connection problems. Copy the actual URI shown for your project, not the example below.
3. Replace the password placeholder in that URI with your database password. URL-encode special password characters. This is your database password, not your GitHub password or API key.
4. Copy the project URL from project settings.
5. Under **Settings → API Keys**, find the backend **service_role** JWT in the legacy API keys section. Keep it private. Do not use the anon/publishable key for this backend storage adapter.

The application creates its 42 tables in a private **shop** schema, with row-level security enabled and no browser policies. Your Express backend connects as the database owner and enforces existing permissions. The database is not made publicly accessible through Supabase's Data API.

## 2. Install locally and configure secrets

Use Node **22.12.0** (matching your Render deployment) or a newer Node 22 release allowed by package.json.

Extract the ZIP into a NEW folder. Open a terminal in the extracted project folder containing package.json.

```sh
npm ci
```

Copy `.env.example` to `.env`. In Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

On Linux/macOS:

```sh
cp .env.example .env
```

Edit `.env` locally, filling in these four values:

```dotenv
DATABASE_URL="YOUR_COMPLETE_SUPABASE_SESSION_POOLER_URI"
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_PRIVATE_SERVICE_ROLE_JWT"
SUPABASE_STORAGE_BUCKET="shop-uploads"
```

Never put these secrets in React, `src/`, variables starting with `VITE_`, screenshots, GitHub, or chat. The provided .env.example contains placeholders only. The .gitignore excludes real environment files, databases, uploads and migration backups.

TLS verification is enabled. The app includes Supabase's public root CA automatically for Supabase database hosts and keeps Node's normal public certificate roots. Normal Supabase connections do not require a manually copied certificate or DATABASE_CA_CERT_PATH. That optional setting can still add a custom root certificate if needed; it does not replace the normal trust roots. Certificate and hostname checks remain enabled.

Build and test:

```sh
npm test
```

Tests use local embedded PostgreSQL (PGlite), synthetic data and mocked Storage/email; they do not use your live Supabase project. Tests override database credentials, disable real email transports and mock network storage. Real server integration is checked in the following steps.

## 3. Transfer existing data BEFORE starting the new app

If you have existing accounts, orders, balances or images, do this before running `npm run dev`, `npm start`, or deploying. Startup creates default rows; the transfer deliberately refuses a populated target.

1. Stop the old app and any process writing to its SQLite database. Keep it stopped through cutover so new orders aren't missed.
2. Locate the ACTUAL SQLite database. The old default was `data/shop.db`; your old DATABASE_PATH may point elsewhere. Do not create or substitute an empty file. Use the original file, not a copy made while the app was writing.
3. Keep a complete local copy of the original project/database. The transfer also makes its own private, consistent snapshot, including images stored in the database.
4. Run this locally, replacing the path with the real location:

```sh
npm run build:api
npm run migrate:sqlite -- "C:\path\to\original-project\data\shop.db"
```

Linux example:

```sh
npm run migrate:sqlite -- "/absolute/path/to/original-project/data/shop.db"
```

The tool opens the source read-only, creates a consistent snapshot under `migration-backups/`, checks integrity and foreign keys, and copies recognized tables in dependency order. IDs, password hashes, sessions, JSON fields, settings, financial values and relationships are copied without rehashing passwords or resetting balances. Image bytes are uploaded to private Storage with deterministic content hashes; existing `/api/...` image/receipt URLs continue working. Every copied row and every uploaded image is verified before the data transaction commits. Identity sequences are advanced above preserved IDs.

A successful run prints `Migration verified`. Keep the snapshot PRIVATE. If the run fails, original data remains unchanged and target row inserts roll back. Already uploaded Storage objects can remain after a failure and are safely reused on retry. Do not delete your original data or repeatedly deploy over a failed transfer.

If you accidentally started the app first, the tool will refuse populated tables. Do not clear a database containing real data. Use a fresh empty Supabase project/schema or ask for help identifying safe test-only seeds.

No uploaded database was supplied with this package, so your actual data has NOT been migrated or verified by the assistant.

## 4. Run locally and check your real Supabase connection

```sh
npm run dev
```

The Vite terminal shows the local website URL. Verify buyer/admin/seller login, products, an image upload, receipts and existing orders/balances against the original app. Existing image links should still return the same files; unauthorized users must not be able to retrieve admin-only receipts.

If there is no existing data at all, skip the transfer and start normally: fresh tables and starter rows are created automatically. Configure ADMIN_EMAIL and ADMIN_PASSWORD only if you need the existing admin bootstrap. With an existing database, use the actual existing administrator's email; the inherited bootstrap promotes that email to admin if it exists. It does not reset an existing password.

## 5. Configure Render's FREE web service

Keep the free instance selected. No disk or paid database is needed for this code.

Under **Environment**, add:

| Variable | Value |
| --- | --- |
| NODE_ENV | production |
| DATABASE_URL | Complete Supabase session pooler URI with encoded database password |
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Backend service_role JWT |
| SUPABASE_STORAGE_BUCKET | shop-uploads |
| APP_URL | Your actual HTTPS Render website URL, without an extra path |

Retain your existing admin and email environment settings where required. The old DATABASE_PATH is no longer used. Render supplies PORT; the server listens on 0.0.0.0 and uses it.

No Secret File is needed for a normal Supabase connection: its public root certificate is bundled automatically. If you already added DATABASE_CA_CERT_PATH with a valid certificate file, it remains supported alongside the bundled and system roots. For a custom root, add its public certificate as a Render Secret File and set DATABASE_CA_CERT_PATH to that file's absolute path.

Use:

**Build command**

```sh
npm ci --include=dev && npm run build
```

**Start command**

```sh
npm run start:api
```

Dev dependencies must be available during the build because TypeScript and Vite build both the API and frontend. Runtime does not use a Vite preview server: Express serves `dist/` and preserves same-origin session cookies and frontend routing.

After the local transfer and verification succeed, copy the updated project files into your Git working copy. Do not overwrite your private .env or backup folder. Review `git status` and `git diff` locally, then commit/push the source changes and deploy the latest commit. Do not commit node_modules, databases, real environment files or migration-backups. If any secret was already committed previously, removing it from the next commit is not enough: rotate it with the provider.

## 6. Email on free Render

Existing SMTP configuration and email templates are retained. Free Render restricts common outbound SMTP ports; seller verification and password reset need a working email transport.

An OPTIONAL HTTPS email transport is included to support that hosting limitation. To use it, create a Brevo account on its free plan, verify your sender, then set BREVO_API_KEY and EMAIL_FROM only on the backend. For example, EMAIL_FROM can be `SHOPY <your-verified-sender@example.com>`. Do not enable paid options. Sender/account approval and the provider's free sending quota still apply. BREVO_API_KEY takes precedence over SMTP when supplied. Without it, the existing SMTP transport is used.

No Brevo account was created or connected. Actual email delivery is not verified by the offline tests.

### Seller signup before email setup

By default, SELLER_EMAIL_VERIFICATION=auto: sellers can register normally when no email provider is configured. This does not establish ownership of the email address. The server retains email/password validation, seller profile requirements, password hashing, role restrictions and session handling. Customer signup is unchanged.

Once a working SMTP or HTTPS email provider is configured, auto requires a valid seller verification code for new seller registrations. A configured provider failing to deliver never bypasses verification. Set SELLER_EMAIL_VERIFICATION=required to enforce verification even before email setup, or disabled to explicitly postpone it. No verification codes are returned in production. Password recovery still requires working email delivery.

## 7. Free-plan limits, backups and rollback

Free Render can sleep and take time to wake up. Supabase's free plan has storage, database, transfer and availability limits, and projects may pause after inactivity. External persistence keeps data independent of Render's temporary filesystem; it is not unlimited storage or a guarantee of permanent free hosting. Monitor the provider dashboards and keep independent database AND Storage backups. Do not assume the free plan provides automatic backups.

Storage objects are content-addressed and kept private. The code intentionally does not delete objects when a database transaction rolls back or a product is removed, to avoid breaking shared references. Review unreferenced objects before deleting anything if storage quota becomes tight; keep backups and account for old snapshot references.

Before real users resume writes, rollback means stopping the new server and restoring your old project/SQLite snapshot with its former hosting configuration. Once users create new data in Supabase, the old SQLite file is stale: stop writes and export/reconcile that newer data before switching back. Do not run both versions with separate databases for live orders.

## Validation performed for this package

- TypeScript API build and Vite production build.
- Automated API smoke checks across admin, buyer and seller roles, populated purchases, balance debits/idempotency, uploads and private receipt permissions.
- Local PostgreSQL schema creation, large balances above 32-bit range and SQLite transfer fixtures with image verification, rollback, preserved hashes/IDs and sequence continuation.
- Node 22.12 runtime validation.

Live Supabase networking, credentials, bucket permissions, your actual database contents, email delivery, and a live Render deployment still require the setup and checks above. No claim is made that every possible UI interaction has been exercised.
