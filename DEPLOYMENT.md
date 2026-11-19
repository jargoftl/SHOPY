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

Deposit and withdrawal requests require the account's four-digit transaction PIN. Withdrawal requests immediately reserve available funds. The admin locks the coin conversion, performs the outgoing transfer externally, and confirms it with the transaction reference. Rejection releases the hold. This application does not send cryptocurrency automatically. Never mark a transfer confirmed merely because a screenshot exists.

For legacy externally paid orders, the **full product-sale amount** may be released once delivered, with no active refund, after admin review. Legacy store-credit purchases remain noncash. New balance-only checkout and store-owner confirmation follow the newer rules documented below. Each order/seller release is unique. A completed refund reverses any released proceeds; a negative balance blocks new withdrawals until funds cover it. All balance changes and holds record before/after values. The fund-record screen exports the latest 1,000 records as CSV; the activity feed shows the latest 100 events. The admin review queue shows the latest 200 wallet requests and 500 order/store combinations.

No new environment variables are required. Existing private Supabase storage and payment wallet settings are reused. Legacy configured seller metrics remain in the old editor. New labeled display overrides are managed separately; actual sales and financial records remain authoritative.


### Four-digit transaction PIN and puzzle-free authentication

Buyers set or reset their PIN under **Profile → Setup**. Sellers use **My wallet → Set or reset transaction PIN**. Setting or resetting requires the current login password and matching four-digit PIN entries. Existing longer transaction passwords are not PINs; their owners must set a new PIN. Both buyer and seller deposit and withdrawal request APIs now require `transactionPin` as a four-character digit string, preserving leading zeroes. Login passwords and the retired buyer transaction-password endpoint cannot authorize a wallet request.

PINs are individually bcrypt-hashed and are never returned to the client or shown to administrators. Five wrong attempts lock the account's PIN for 15 minutes, independently of IP address. A password-authenticated PIN reset clears the lock. No new environment variables are required.

The image puzzle and its client component are removed. Login and signup retain password checks and rate limits. When email verification is configured, emailed codes remain bound to an HTTP-only browser cookie and cannot be used from another browser. The legacy puzzle status endpoint returns `enabled: false` so cached older clients can continue without an image challenge. `AUTH_CAPTCHA` is no longer used.

### Balance-only marketplace, sale confirmation and tracking

New product checkout accepts only `BALANCE`. The server rejects direct coin orders even if a caller bypasses the checkout screen. Buyers fund their account through admin credits or coin deposits; the configured deposit wallet is supplied automatically when available. Coin wallets are configured under **Admin → Buyer funding → Configure coin deposit wallets**, rather than supplied for each product order.

A buyer deposit is credited only after its receipt exists and the admin explicitly verifies the external transfer and records its transaction reference. Request closure and balance/history changes occur in one transaction; repeat confirmations and duplicate recorded transfers are rejected. Buyer withdrawals reserve funds at request creation. Checkout and admin balance reductions cannot spend those holds. Confirmation debits the account; rejection releases the hold.

New balance-paid orders carry `account_balance_payment=1`. They appear in the store’s orders and actual sales immediately. Either that store owner or an admin may confirm the paid sale and credit its **full product subtotal**, once, to the seller wallet. Shipping and tax are excluded. Confirmation stores the actor, role and timestamp, creates a fund record, and confirms initial fulfillment. Seller and admin confirmations racing for the same order cannot double-credit funds. Older external-payment orders retain their admin/delivery review rules; older noncash store-credit orders are not silently converted into merchant cash.

Sellers can shop from their existing signed-in account. Checkout uses any admin-credited purchase balance first, then available merchant wallet funds; held funds are excluded. Merchant-wallet spending creates a fund-record debit. No second buyer email is required to browse or buy.

Each store order automatically receives a unique random 11-digit tracking code. Admins can add an optional carrier reference and carrier under **Orders & tracking**. The store owner can read that assignment and update fulfillment status. Buyers see the tracking number and fulfillment status in their order. Tracking assignments and sale confirmations also appear in the store activity history. Seller wallets show confirmed-sale history and the actor who recorded each financial movement.

### Separate accounts in browser tabs

Every tab uses a random selector in session storage and a separate HttpOnly, Secure, SameSite=Lax session cookie. The selector is not an authentication token. Signing in establishes a fresh selector; logging out clears only the selected session. Buyer, seller and admin accounts can stay signed in concurrently in the same browser. Use **Another account in a new tab** or open a fresh tab and sign in separately. Carts and pending-cart records are tab-local too.

Private receipt and verification-photo links include the tab selector, while still requiring its HttpOnly session cookie and the appropriate account permissions. Existing API clients without a selector retain their legacy cookie path. New tabs do not borrow a different tab’s session. A session or account change clears stale notification state.

### Admin workspace and display statistics

The admin centre now has focused sections for accounts, seller approval, orders/tracking, buyer funding, seller finance, warehouse, marketing, display statistics, activity and settings. Heavy management sections load only when opened.

**Display statistics** lets an admin override displayed product/order totals, sales/profit, follower and visitor figures, and daily/weekly/monthly counters, with a required audit reason. The seller dashboard labels these as **admin-adjusted**, alongside actual figures. Adjustments never write real purchase orders, visitor events or wallet money. Before/after values and the administering account are retained in `seller_stat_audit`. Clearing an override restores the actual figure. Charts and transaction histories continue to show recorded activity.

The site uses a black, white and neutral gray brand palette, retaining semantic sale/error/status colors and coin brand icons. Existing product images and the site’s own name remain in place.

### Shipment tracking, seller funding and loading

Buyers can search their own shipments by the 11-digit code from their dashboard. Sellers and administrators can update delivery progress; the history records the actor role and time. The animated dispatch icon represents manually entered progress, not live GPS tracking. Existing carrier references are preserved.

**Seller funding** is a separate administrator tab. Credits require an amount, reason and explicit authorization, use an idempotency key, and record the administrator and before/after balance in fund history. No external coin transfer is performed by this action.

Unread notifications are red and read notifications green, with text labels. Account reads share only concurrent requests within the same tab; completed balances are not cached. The admin overview uses counts, wallet receipts load in batches, and indexed account/order lookups reduce database work. Hosting cold starts remain outside these improvements.

### Password controls and delivery estimates

Password and transaction-PIN inputs offer accessible show/hide controls and remain masked initially. Seller-created products now require a price-summary confirmation before POST; cancel makes no changes. Wholesale and gross profit remain estimates at 85% and 15% of retail.

The buyer tracking panel displays a timed three-day estimate (preparation during day one, expected transit from day two, estimated arrival window after 72 hours). Estimates do not change order status, confirm delivery, or release funds. Actual seller/admin progress changes generate success toasts, and buyer tracking refreshes announce changed statuses. Carrier integration is required for automatic verified delivery.

### Bulk warehouse publishing

Seller warehouse cards have selection checkboxes. Select all on this page affects the visible page; Select all matching products reads all pages for the current search/category. Already-listed products are excluded. Selection persists while browsing pages. The bulk confirmation shows combined estimated prices and publishes through the existing authorized quote/import flow, checking each current price. Imports run sequentially to limit load. Successful items update the seller catalog immediately; failed items remain retryable without repeating successful imports. Keep the page open while publishing.

### Mobile navigation, recommendations and public reviews

Small screens have readable 16px form inputs, larger touch targets, single-column forms, responsive dialogs, and a collapsible seller navigation menu. Cart buttons include a cart icon. Phone checks cover 320px and 390px viewports.

Seller warehouse requests use `available=1` plus a random seed. Already-imported products are excluded by owner. The seed gives stable pages during multi-selection; after publishing, a new seed refreshes suggestions within the current category/search without leaving the warehouse. If all matching products are already imported, the list is empty.

Public product and store reviews allow one review per buyer account. Repeat submissions update that review; ratings are 1–5 and text is limited to 2,000 characters. Paid purchases receive a verified-purchase label. Administrator feedback is labeled and excluded from customer averages. Admin deletion hides the review but retains moderator/time metadata; removed reviews cannot be republished by their author. Approved sellers’ admin detail pages include store review moderation.

Seller signup does not request or create a transaction PIN. Wallet setup is offered when a seller first starts a deposit or withdrawal. Existing account PIN enforcement, password-confirmed setup/reset and lockout rules remain in effect. Configured PINs are preserved. Government-ID verification remains required. SSN card photos and full SSNs were not added; the optional suffix reference is not a verified SSN check. A dedicated verification provider is needed for that service.

### Seller referrals and manual rewards

New seller applications receive a unique 16-character referral code. Existing sellers receive one when opening the referral area. Buyer and seller signup links use `?ref=CODE`; signup forms show the optional code, which is carried within the browser tab until registration succeeds. Attribution is stored only for a new account, once per account. Existing buyer-to-seller applications do not reassign referral credit. Invalid codes produce a correctable error.

Sellers see their signup links, counts and reward history under **Referrals & rewards**; pending applicants can also share links from their application page. The admin tab shows which seller owns each code, each referred account, signup type and reward decision. No amount is predetermined and signup does not automatically create spendable funds. An admin chooses a positive reward and reason or rejects the referral. Credits go to the referring seller wallet only after that seller is approved. Repeated/concurrent approval requests cannot issue a second credit. The ledger records administrator, amount and reason. Histories show the latest 200 seller entries / 500 admin entries; summary counts cover all entries.

Phone examples now use US `+1 (202) 555-0123` formatting. Seller signup and new billing selections default to United States; saved billing countries and international choices are preserved. The optional SSN field requests only four digits and labels them an unverified administrator reference; it does not claim to validate identity.

### Production interface cleanup

The referral heading reads “Invite people. Earn reward.” The rotating-banner timing caption is removed. Signup has no preview-step controls or local verification-code display. Purchase history uses real purchase records; legacy simulated-order panels are removed, and production rejects the old simulated checkout/status-update endpoints.

Production no longer seeds starter/example catalog entries. A one-time migration archives known bootstrap listings by exact seed fingerprints and disables the three original bootstrap-only partner accounts. It archives only known sample warehouse entries and copied sample listings, preserving all records and financial/order snapshots. Archived entries are omitted from catalog management and warehouse publishing, including direct quote/import requests. This does not relabel sample transactions as genuine purchases.

### Wallet dialogs, direct funding and navigation performance

PIN setup/reset now opens in a native modal for both seller and buyer accounts. Escape/Close are disabled while the PIN is being saved; the modal returns focus on close and discards unsaved inputs. It remains separate from deposit/withdrawal submission. The storefront’s main navigation uses a consistent 14px font.

Admin **Buyer funding** now has a direct, additive credit form, separate from balance replacement and coin settlement. It credits the same `reward_balances` balance used by checkout, writes before/after amounts, reason and administrator to funding and account history, and uses a unique request key to prevent duplicate credits. **Seller funding** credits the existing seller wallet. Both actions require explicit authorization and validate the target account type. Buyer coin-request administration is loaded only when opened. No external transfer is performed by a direct funding credit.

Pages use quiet content placeholders instead of fetching/loading prose. The page-exit animation delay is removed, and large account/dashboard pages load as separate chunks. Account identity alone may be reused for 10 seconds within a tab scope; mutations and unauthorized responses invalidate it, and stale in-flight identity reads cannot repopulate it after a mutation. Wallet balances, funding histories and purchase data are never served from this completed-response cache. Hidden seller tabs skip background polling and refresh when focused. Free hosting wake-up/network time can still affect initial responses.

### Signup verification, approval and delivered-order email

With `SELLER_EMAIL_VERIFICATION=required`, both buyer and seller registration require a six-digit code delivered to the supplied email address. Codes expire after ten minutes, remain hashed in the database, are bound to the requesting browser, and are consumed on successful registration. Buyers then have a shopping account. Email-verified seller applicants remain customers with pending seller status until an administrator reviews and approves their private application. Approval emails use the existing durable approval queue; provider outages do not undo approval.

Marking a paid store order delivered now queues an email to that order’s store owner. The message contains the public order reference, tracking code and seller order link, without buyer address/contact information or verification photos. The fulfillment update commits before any email provider call. Estimated delivery timelines never queue this message, and sending it does not alter wallet balances.

The private `seller_delivery_emails` outbox reserves one job per order/store pair, records send attempts and provider-acceptance status, and retries failures after five minutes (up to five attempts). A worker checks every minute and is also kicked after delivery updates. It resumes queued work on startup while the backend is awake; free-host sleep can delay retries. Existing delivered orders are not automatically bulk-mailed. Admins can send an unsent delivered-order notification or retry a failed send from Orders & tracking; already-sent jobs cannot be manually resent. Sent means the provider accepted the email, not a guarantee of inbox placement. SMTP/provider timeout ambiguity can still cause a duplicate after a process crash.

No new required email environment variables are needed beyond the configured provider key, verified sender, application URL and required-verification setting. `DELIVERY_EMAIL_WORKER=disabled` is an optional test-only worker control and should not be set on the live backend. API secrets remain on Render.

### Seller SSN storage
Full SSNs are optional and US-only, encrypted with AES-256-GCM. Set `SSN_ENCRYPTION_KEY` on Render to a unique 64-character hexadecimal secret generated with `openssl rand -hex 32`. Keep this key out of Git, email, and screenshots; retain a secure backup. Changing or losing it prevents decryption of existing records. Leave it unset to reject full-SSN collection while continuing to accept applications without an SSN. Existing last-four-only records stay last-four-only.
Admins can reveal a stored number through the applicant review panel. The protected POST endpoint records an `ssn_viewed` audit event without recording the number and returns a non-cacheable response. The UI hides it after 30 seconds. SSNs are self-reported, not automatically verified; they do not replace the required ID review. Run `npm run build:api` then `node --test tests/seller-ssn.test.mjs` to check encryption and tamper rejection.

### Client super-admin handover
The existing `admin` role keeps its normal dashboard permissions. The additional `users.is_super_admin` flag permits access to `/super-admin`. Public registration and regular admin endpoints cannot grant this flag. No existing account is automatically promoted.
After the client registers and verifies their account, a trusted database owner can run the following **once** in Supabase SQL Editor, replacing the email with the exact client account:

```sql
UPDATE shop.users
SET role = 'admin', is_super_admin = 1
WHERE email = 'CLIENT-EXACT-EMAIL-HERE'
  AND suspended = 0
RETURNING id, email, role, is_super_admin;
```
Confirm exactly one expected account is returned. The client then signs out and back in and opens `/super-admin` (also linked from Admin → Manage admins). They can search an existing account by exact email or public ID, grant/revoke regular admin access, and confirm each change with their own password. Access changes are audited and revoke all sessions of the changed account. Approved sellers revert to seller access when admin permission is removed; other accounts revert to buyer access. Super-admin accounts cannot be demoted through this screen, protecting the last owner. Ownership changes still require a trusted database owner. Never grant this flag to the ordinary support/admin team.

### Login network records
Successful buyer, seller and admin sign-ins record the network IP and hosting-proxy country/region/city metadata when available. Admin → Account activity shows these fields. No extra location lookup or third-party request delays sign-in. Proxy-reported locations are approximate, may reflect VPN/proxy routing, and are never used to verify identity or authorize access. Missing metadata and historical records show “Location unavailable”; no city is fabricated. Access to event records remains admin-only.

### Email-independent signup and account recovery
Signup email codes are **off by default**, regardless of the legacy `SELLER_EMAIL_VERIFICATION` setting. Password confirmation stays in the signup forms; sellers still require identity review and administrator approval. A syntactically valid email is not proof of email ownership. To explicitly restore emailed signup challenges in the future, set `REGISTRATION_EMAIL_VERIFICATION=required` only after configuring a working email provider.
The Forgot password page now creates an administrator recovery request, with generic responses that do not disclose account existence. Admin → Account recovery lists requests; open the relevant account folder and choose Create password-reset link. Verify the requester independently through the store's official support channel, confirm your admin password, then privately share the 30-minute, single-use link. Only token hashes are stored. Issuance is audited without recording secrets; password reset revokes existing sessions. Regular admins cannot recover admin accounts; a super admin may recover regular admins or their own account, but cannot reset a different super admin. An owner locked out of every recovery channel still needs trusted database-owner assistance.
Welcome emails are disabled when signup email verification is off. With explicit email verification enabled, welcome emails are best-effort and do not block account creation. Approval and delivery emails retain their existing provider configuration. No passwords are stored in readable or reversibly encrypted form.

### Store establishment dates and timestamp history
Admin → People & stores → a seller account → Store dates & history allows a dated business-establishment value (1900–2100), or removal of that value. A reason is required. Edits use optimistic concurrency and append an actor/timestamp/from/to/reason entry to `account_admin_history`. Sellers and buyers cannot edit the date.
The public store page and seller dashboard show the immutable platform joining date separately from the administrator-provided business date. Future dates are labeled Planned opening. Changing this field never updates `users.created_at`, `seller_profiles.created_at`, transaction creation dates, order dates, wallet histories or their financial reporting periods. Admin creation timestamps and edit history are displayed with date, time and Africa/Lagos timezone; financial ledgers retain their explicitly labeled UTC timestamps.
