# GGU Store

Personal storefront project built with React, Vite, Tailwind CSS, Express, Supabase PostgreSQL, and Supabase Storage.

## Start locally and deploy

Read [SETUP-SUPABASE.md](SETUP-SUPABASE.md) before starting the updated app. It explains the free Supabase project, private Storage bucket, backend-only credentials, SQLite data transfer, validation, Render settings and rollback.

For an existing shop, stop writes and run the verified SQLite transfer BEFORE starting this version. The source database is left unchanged. Do not delete your old database or expose its contents in Git.

After completing the setup, run `npm ci`, `npm test`, and `npm run dev`. The API runs on port 3001 locally; Vite forwards `/api` requests. Production Express serves the built frontend and API from the same origin.

Website branding, accounts, sessions, orders, balances and settings are stored in Supabase PostgreSQL. Uploaded image and receipt bytes are stored in a private Supabase Storage bucket, accessed through the existing API routes. No Supabase Auth migration is required.

## Accounts, balances and orders

Buyers use `/profile` for their eight-digit member reference, account balance, saved addresses, followed stores, purchases and notifications. Sellers can browse and buy from the marketplace using their existing account. Admins manage accounts from `/admin`, with focused sections for approvals, orders/tracking, funding, seller finance, warehouse, marketing, statistics and settings.

New checkout uses **account balance only**. Buyers can receive admin-credited funds or submit a coin deposit. Configured deposit wallets are supplied automatically; an admin must independently verify the receipt and transfer reference before funds are credited. Credits, withdrawals and balance changes retain a transaction history. Withdrawal requests reserve funds so checkout cannot spend a pending withdrawal. Buyers and sellers set a four-digit transaction PIN using their login password before making deposit or withdrawal requests.

Balance-paid orders appear immediately in the store’s dashboard and orders. Either the store owner or an admin can confirm the paid sale, crediting the full product subtotal once to the seller wallet and recording the confirming account, role and time. Seller funds can be spent on purchases or requested for withdrawal; external transfers still require admin review. New checkout does not request a coin, payment screenshot or external wallet address. Historical external-payment and test orders remain distinguishable and retain their original review rules.

Admins assign carrier/tracking numbers to store orders. Sellers can read those assignments and update fulfillment, and buyers can see the tracking and status in their purchases. Status updates are manually entered, not carrier-webhook events. Refunds are reviewed manually; balance-order refunds currently require contacting the administrator.

The seller dashboard uses actual orders, sales, recorded visits and wallet history. Admins may set **labeled display adjustments** for counters and sales/profit displays, with audited before/after values and reasons. These adjustments never create real orders, visits or wallet money; actual values and charts remain available alongside the adjusted display.

Buyer, seller and admin accounts can stay signed in in separate tabs in the **same browser**. Each tab has its own selector and HttpOnly session cookie. Use the “Another account in a new tab” link to sign in independently. Logout affects that tab’s session; suspension and password resets still revoke account sessions. Carts are tab-local. The browser selector is not a credential, and private document links still require the matching session cookie and ownership/role checks.

The profile includes saved billing details, favorites and followed-store cards linking to each store’s products. Signed-in buyer store visits are recorded. Wallet/profile updates and notifications refresh in the background. Seller applications require admin identity review; approval emails can remain queued until an email provider is configured. Login/signup have no puzzle. Password and PIN hashes are never shown in admin account folders.

See [DEPLOYMENT.md](DEPLOYMENT.md) for balance posting rules, legacy-order handling, PIN security, tab sessions, tracking and statistics audit details.

## Seller product management

The admin can create, edit and remove items in the shared product warehouse on `/admin`. Both the warehouse form and seller product create/edit form accept a main image plus up to seven additional images from the device (PNG, JPEG or WebP, 2 MB each), with previews and removal before saving. Existing image URL options and saved images remain supported. Sellers can search it from Product Management and add a copy to their own catalog, published to both their store and the marketplace. The seller can subsequently edit or unpublish that copy using the existing product editor. Changes or removal in the warehouse do not change copies already made. Existing seller-created products remain available. The editor and warehouse form use the shared category and subcategory list.

On the first API startup after this update, 21 clearly labeled sample products are added to the shared warehouse, one for each category. Prices and images are illustrative, not actual offers; sample images may not depict the item. Admins can remove each sample in the warehouse. Removed samples do not reappear after restart; existing seller copies, if any, must be removed separately.

Sellers can select common sizes and colors or add their own, choose a category and subcategory using selection boxes, and set a manual stock count while creating or editing a product. The count appears on the product detail page as seller-reported; counts from 1 through 5 are labeled “few left.” It is informational only: orders do not reduce it, and even a zero count does not prevent purchases. It must be updated by the seller and is not a reliable live inventory balance. The discount choice uses the original price and current price: published marketplace listings with a higher original price appear on the Discounts page. Product details also suggest publicly listed products in the same category.

The seller product editor can select a main photo and additional gallery photos directly from the device. PNG, JPEG and WebP files up to 2 MB each are supported, with up to eight images per product. Image bytes are saved in private Supabase Storage when the product is saved; database records preserve the existing image URLs. Uploaded images remain stored after replacement or deletion so historical order images can continue to display, and require Storage backups in addition to database backups. Product images are public to anyone with their image link. Render does not need a persistent local disk; PostgreSQL and Storage remain external to the web service.

For confirmed paid orders, a buyer can request one refund per seller and order from My Orders. The relevant seller can approve or reject it; other sellers cannot see or review the request. Approval does not transfer money. The administrator must arrange the amount, destination and transfer separately, independently confirm it, and record a transfer reference. This records the administrator's assertion only; the app does not verify or execute a crypto refund. Test orders cannot be refunded through this workflow. The Product Reviews page is a placeholder: buyer review submission is not enabled.

The theme control changes the browser's light/dark preference and saves it locally when browser storage is available. The admin dashboard retains its existing dark styling.

Admins can open an account from `/admin` to review available profile, activity, address, request, balance, test orders and seller details. New manual orders are managed separately in the dashboard's Orders & manual payments section. The confirmed-deposit total reflects manually confirmed requested amounts, not verified funds. Passwords and authentication secrets are never displayed.

The admin account directory can be searched and filtered by role. Each account folder links to its details, activity and messages; buyer folders also contain their own balance and request controls, favorites, followed stores and test orders. Seller folders show store details, products and a link to their manually configured metrics. Seller sales and actual fulfillment are not recorded by the test checkout. Existing administration tools remain under “Additional administration tools.”

Run `npm test` for browser-helper unit tests, production builds, and the current PostgreSQL migration/API integration suite. See [tests/README.md](tests/README.md) for coverage and preserved historical SQLite tests.

## API locations

The TypeScript Express API is in `server/index.ts`; Email notifications are in `server/email.ts`; TypeScript settings are in `tsconfig.server.json`; the browser API helper is `src/lib/api.js`. Vite forwards `/api` requests to the backend in development. `npm run build:api` type-checks and compiles the backend into `dist-server/`, and `npm run start:api` starts the compiled API.

- `POST /api/auth/register` creates a customer account; `POST /api/auth/seller-verification-code` emails a short-lived seller code; `POST /api/auth/register-seller` creates the seller account and profile after code verification.
- `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` manage login sessions.
- `POST /api/auth/forgot-password` sends a reset email; `POST /api/auth/reset-password` accepts a single-use, 30-minute token and invalidates existing sessions.
- `GET /api/products`, `GET /api/products/:id`, and `GET /api/categories` provide the public catalog.
- `GET|POST|PATCH|DELETE /api/seller/products` let sellers manage their own products.
- `GET /api/categories`, `GET /api/seller/categories`, `POST /api/seller/categories`, and `DELETE /api/seller/categories/:id` manage shared catalog categories.
- `GET /api/admin/users`, `GET /api/admin/products`, `GET /api/admin/events`, and `PATCH /api/admin/users/:id/role` support the owner dashboard.

Seller profile review is at `GET /api/admin/sellers`. Seller signup accepts an optional PNG, JPEG or WebP shop logo up to 2 MB, with a preview and removal before submission. Uploaded logos persist in private Supabase Storage and are served through the public image API; the logo URL option remains available. Identity-document examples are not uploaded and SSNs are not collected.

## Email setup

For hosts that block common SMTP ports, an optional HTTPS transport uses `BREVO_API_KEY` and a verified `EMAIL_FROM`; existing email templates and API behavior are retained. No email account or paid option is enabled automatically. Otherwise configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in `.env`. Set `APP_URL` to the exact public frontend origin (HTTPS is required in production); locally it defaults to `http://localhost:5173`. Reset links must point to the site the user actually opens. `ADMIN_NOTIFICATION_EMAIL` receives registration and successful-login alerts, including the member ID and contact details. The customer also receives a welcome email and a notice after each successful login. If SMTP is missing or delivery fails, account creation/login still works, but password reset reports that email is unavailable.

## Password handling

Passwords are hashed with bcrypt and are never shown in the admin UI or returned by the API. Admins can view account IDs, names, email addresses, phone numbers, roles, and recent sign-in/registration activity. This is a local learning setup, not production-hardened; do not expose it publicly without additional security review.
# SHOPY
