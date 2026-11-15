# Deployment

This project keeps its application data and uploaded image BLOBs in SQLite. Use a persistent mounted volume/disk for the API service; temporary container storage is not safe for production data. The API requires an absolute `DATABASE_PATH` when `NODE_ENV` is `production` and will refuse to start without one.

## Configure Netlify

1. Create a Netlify site from this repository, with the repository root as the base directory.
2. Use build command `npm ci --include=dev && npm run build` and publish directory `dist`. These are also set in `netlify.toml`.
3. In `netlify.toml`, replace `https://YOUR-BACKEND-HOST` with the backend's public HTTPS origin, without a trailing slash. For example, replace only that placeholder with the Railway or Render service origin. The `/api/:splat` suffix must remain unchanged.
4. Set the backend's `APP_URL` to the exact public Netlify site origin, such as `https://your-site.netlify.app`, with no path or trailing slash.

The `/api/*` rewrite is intentionally before the SPA fallback. It forwards requests to the backend while retaining the `/api` prefix. The frontend continues to use relative `/api` URLs, so browser requests and session cookies remain on the Netlify origin. No cross-origin browser request or third-party cookie is needed.

## Railway backend

1. Create a Railway service from this repository. Leave the root directory unset so the repository root is used.
2. Set build command to `npm ci --include=dev && npm run build:api` and start command to `npm run start:api`.
3. Add a Railway Volume mounted at `/var/data`. Railway volumes are persistent; availability and cost depend on the current Railway plan and may require payment.
4. Set `DATABASE_PATH` to `/var/data/shop.db`. Do not use the service's temporary filesystem for the database.
5. Add the environment variables listed under [Backend environment variables](#backend-environment-variables). Railway supplies `PORT`; do not hard-code it.

## Render backend

1. Create a Render Web Service from this repository. Leave Root Directory blank (the repository root).
2. Set Build Command to `npm ci --include=dev && npm run build:api` and Start Command to `npm run start:api`.
3. Attach a Persistent Disk mounted at `/var/data`. Render persistent disks may require a paid plan; without one, local SQLite data will be lost on redeploy/restart.
4. Set `DATABASE_PATH` to `/var/data/shop.db`. Do not use the service's temporary filesystem for the database.
5. Add the environment variables listed under [Backend environment variables](#backend-environment-variables). Render supplies `PORT`; do not hard-code it.

Both hosts use Node.js 22.12 or newer within major version 22, declared in `package.json` and pinned by `.nvmrc`. This satisfies Vite's Node 22.12 minimum and better-sqlite3's Node 22 minimum while avoiding newer native-addon ABIs.

`better-sqlite3` is a native Node.js module. The build environment needs Python, GNU make, and a C/C++ compiler to compile it when a matching prebuilt binary is unavailable. Railway and Render builds must provide that toolchain; a `node-gyp` error about missing `make` or a compiler means the builder needs its native build tools enabled.

## Backend environment variables

Set these on Railway or Render:

- `NODE_ENV`: `production`.
- `DATABASE_PATH`: `/var/data/shop.db`, on the mounted volume/disk.
- `COOKIE_SECURE`: `true`. Production cookies are forced secure by the server regardless, and this setting documents the HTTPS deployment requirement.
- `APP_URL`: the exact HTTPS Netlify site origin. Password reset links point here.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: create the initial admin account. Use a unique password meeting the app's minimum length requirement.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`: required for seller email verification and password-reset mail. Use the actual SMTP provider settings; do not commit them.
- `PORT`: supplied by the hosting platform.

Optional admin settings are `ADMIN_NAME`, `ADMIN_PHONE`, and `ADMIN_NOTIFICATION_EMAIL` (which otherwise falls back to `ADMIN_EMAIL`). Do not copy `.env.example` secrets or use its placeholder values in production.

The Netlify proxy passes login, logout, session, and reset requests through the same public origin. Express trusts its immediate hosting proxy, and session cookies are HTTP-only, `SameSite=Lax`, and secure in production. Seller email verification remains a six-digit code; password reset emails link to the Netlify `APP_URL`.

## Existing data and persistence checks

The local database at `data/shop.db` is ignored by Git and is not changed by these deployment settings. A new mounted volume starts with a new database unless you restore a copy of your existing database to it before the first API start. Deployment does not migrate or copy local data automatically. Back up the current database before any manual transfer, stop the local API before making a file copy (SQLite WAL mode can have `-wal` and `-shm` sidecars), and never overwrite a non-empty production database. Do not commit the database or its sidecars.

After deploying:

1. Open `https://YOUR-BACKEND-HOST/api/health` and `https://your-site.netlify.app/api/health`; both should return `{"status":"ok"}`. Replace the example origins with the deployed origins.
2. From the Netlify site, log in through the UI, confirm the session loads, log out, and confirm the protected session is cleared. Use the browser network panel to verify requests go to the Netlify `/api/...` path.
3. Register a test seller and complete the emailed six-digit verification code. Request a password reset and confirm the email link opens the Netlify site and lets you set a new password. Verify SMTP delivery and `APP_URL` if either email flow fails.
4. Create a test record and upload an image or screenshot. Restart/redeploy the backend, then verify the record and image are still present. A missing record after restart indicates the database path is not on the persistent mount.

The health endpoint is public and returns only a generic status. No deployment, data transfer, or database migration is performed by this configuration.
### Seller references, analytics and merchant wallet

User, seller and product screens now use stable eight-digit public references (`#12345678`). The migration backfills existing users, products and warehouse entries and assigns references to new entries. Internal database keys and existing URLs remain unchanged. Public references are labels, not authentication credentials.

The seller overview uses actual purchase records, real follows and recorded visits, rather than manually configured dashboard figures. Daily visits and the activity feed begin recording when this update is deployed; older activity is not fabricated. Sales are grouped by the order creation date in UTC. Product sales exclude shipping and tax. The financial statement shows gross sales before refunds; the order history shows refund state. The 15% profit figure is an estimate, not an additional wallet credit.

Seller wallets are separate from buyer/store-credit balances. The administrator reviews seller deposits at **Admin → Seller finance review**, supplies a coin wallet/network and locks the conversion rate. The seller uploads a private receipt. An administrator must independently verify the incoming transfer and record its transaction reference before crediting the USD-denominated seller balance.

Withdrawal requests require the seller's account password and immediately reserve available funds. The admin locks the coin conversion, performs the outgoing transfer externally, and confirms it with the transaction reference. Rejection releases the hold. This application does not send cryptocurrency automatically. Never mark a transfer confirmed merely because a screenshot exists.

The **full product-sale amount** may be released once an externally paid order is delivered, has no active refund, and an administrator explicitly verifies the amount. Store-credit purchases do not create withdrawable cash. Each order/seller release is unique. A completed refund reverses any released proceeds; a negative balance blocks new withdrawals until funds cover it. All balance changes and holds record before/after values. The fund-record screen exports the latest 1,000 records as CSV; the activity feed shows the latest 100 events. The admin review queue shows the latest 200 wallet requests and 500 order/store combinations.

No new environment variables are required. Existing private Supabase storage and payment wallet settings are reused. Existing configured seller metrics remain in the legacy admin editor but no longer drive the real sales dashboard.
