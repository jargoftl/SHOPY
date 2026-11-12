# GGU Store

Personal storefront project built with React, Vite, Tailwind CSS, Express, and SQLite.

## Start locally

1. Copy `.env.example` to `.env`.
2. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. Use your own email and a unique password at least 12 characters long.
3. Configure `APP_URL` as the frontend origin and SMTP settings in `.env` to enable password reset emails. Registration and login still work without SMTP, but password recovery requires it.
4. Run `npm run dev` and open the Vite URL shown in the terminal.

The API runs on port 3001. SQLite creates `data/shop.db` automatically. The configured admin account is created the first time the API starts. New public signups are customers; promote a user to seller from `/admin`.

The admin dashboard's **Website name** setting changes storefront branding, the browser title and new account emails. The name is saved in SQLite, survives restarts, and other open pages refresh it periodically or when focused. Only an authenticated admin can change it. The initial name is GGU; this setting does not rename existing stores or historical content.

## Buyer profiles and manual requests

Customers can open `/profile` to see their member ID, saved billing addresses, followed and visited stores, notifications, and a demo balance. New balances start at **$0**. At the owner's request, existing buyer balances are reset to $0 once when this version starts; previous values are recorded in the admin account detail page, and subsequent changes are preserved. Only admins can adjust balances. Saved addresses can be selected on the billing page. Store visits are recorded only for signed-in customers.

The profile overview and wallet page have an eye button to hide or show the displayed balance. This only masks the amount on screen; it does not change or protect the stored balance.

Billing pre-fills a signed-in buyer's name, email and phone, plus their default saved address when available. Buyers can edit these fields or select another saved address for the current checkout; changing the billing email does not change the account email.

The deposit and withdrawal buttons create manual requests for one of the displayed coin options. An admin can send or update the accepted coin, network, wallet address and instructions per pending deposit. Buyers can copy the address and upload up to ten PNG/JPEG screenshots per request (2 MB each); the admin can download them. Each screenshot retains the payment details in effect when uploaded. Screenshots are not proof of settlement and must be independently verified. An admin can mark a request confirmed or rejected, and separately set a buyer's demo balance with a recorded reason. Confirmation does not verify a payment, transfer cryptocurrency, or change the balance. No payment provider or blockchain is connected, and demo balances are not real money. Buyer signup and request notifications are available in the admin notification center.

The admin dashboard and open buyer profile check for updates every 15 seconds. The admin receives an in-app notification when a buyer submits a request and another when a screenshot is uploaded. The admin must send the wallet details for each request; they are not generated or sent automatically when the coin is selected.

Buyers must first set a transaction password in profile Setup using their login password. Enter it before selecting a deposit coin or submitting a withdrawal. Selecting a deposit coin then immediately sends a request without an amount. The buyer sees a waiting indicator until the admin provides the wallet; a wallet-details dialog appears with a copy button only while that request is open. Pending requests can be reopened from request history, where existing wallet details are shown inline. The buyer enters the amount once the wallet is available, then can upload a receipt. Changing the coin or amount requires a new request. Amount-less requests cannot be confirmed.

The profile overview links to separate pages for wallet request history (`/profile/wallet`), test orders, favorite products, followed stores, visited-store history (`/profile/visits`), settings, addresses and notifications. Store history shows visit counts and the most recent visit recorded while signed in. Buyers and admins can exchange messages at `/messages`. Setup provides name, phone, login and transaction password changes and a cancellation review request. A cancellation request never deletes or disables an account automatically; an admin can mark it reviewed or declined on the account details page. Older `/profile#...` links redirect to their corresponding profile page.

Signed-in buyers' future test checkouts are saved with product and billing snapshots, server-calculated totals and manually assigned test status history. Admins can update those statuses from the buyer's account details; buyers can refresh and filter their test orders. No checkout charges a payment or arranges delivery, and statuses are not real tracking. Guest and non-buyer test checkouts remain unsaved. Earlier test checkouts cannot be recovered.

The My Orders page groups these test records by their saved status and provides expandable item, billing and status-history details. Product image URLs are saved with new order items. For older orders, the current image is used at migration if the product still exists; otherwise an unavailable-image placeholder is shown. Statuses are administrator-set labels, not live logistics information.

The test checkout coin picker records a selection only. It does not create a wallet request, send a wallet address or link a profile deposit to an order. Do not send funds for test orders. The manual deposit request flow remains separate on the buyer wallet page.

Admins can open an account from `/admin` to review available profile, activity, address, request, balance, test orders and seller details. The confirmed-deposit total reflects manually confirmed requested amounts, not verified funds. Actual spending and real purchased items are unavailable. Passwords and authentication secrets are never displayed.

The admin account directory can be searched and filtered by role. Each account folder links to its details, activity and messages; buyer folders also contain their own balance and request controls, favorites, followed stores and test orders. Seller folders show store details, products and a link to their manually configured metrics. Seller sales and actual fulfillment are not recorded by the test checkout. Existing administration tools remain under “Additional administration tools.”

Run the isolated buyer and password-reset regression tests after building the API with `npm run build:api && node --test tests/buyer-api.test.mjs tests/buyer-migration.test.mjs tests/money.test.mjs tests/password-reset.test.mjs`.

## API locations

The TypeScript Express API is in `server/index.ts`; SMTP notifications are in `server/email.ts`; TypeScript settings are in `tsconfig.server.json`; the browser API helper is `src/lib/api.js`. Vite forwards `/api` requests to the backend in development. `npm run build:api` type-checks and compiles the backend into `dist-server/`, and `npm run start:api` starts the compiled API.

- `POST /api/auth/register` creates a customer account; `POST /api/auth/seller-verification-code` emails a short-lived seller code; `POST /api/auth/register-seller` creates the seller account and profile after code verification.
- `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` manage login sessions.
- `POST /api/auth/forgot-password` sends a reset email; `POST /api/auth/reset-password` accepts a single-use, 30-minute token and invalidates existing sessions.
- `GET /api/products`, `GET /api/products/:id`, and `GET /api/categories` provide the public catalog.
- `GET|POST|PATCH|DELETE /api/seller/products` let sellers manage their own products.
- `GET /api/categories`, `GET /api/seller/categories`, `POST /api/seller/categories`, and `DELETE /api/seller/categories/:id` manage shared catalog categories.
- `GET /api/admin/users`, `GET /api/admin/products`, `GET /api/admin/events`, and `PATCH /api/admin/users/:id/role` support the owner dashboard.

Seller profile review is at `GET /api/admin/sellers`. The demo stores seller contact/workspace details only; local image previews are not uploaded and SSNs are not collected.

## Email setup

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` in `.env`. Set `APP_URL` to the exact public frontend origin (HTTPS is required in production); locally it defaults to `http://localhost:5173`. Reset links must point to the site the user actually opens. `ADMIN_NOTIFICATION_EMAIL` receives registration and successful-login alerts, including the member ID and contact details. The customer also receives a welcome email and a notice after each successful login. If SMTP is missing or delivery fails, account creation/login still works, but password reset reports that email is unavailable.

## Password handling

Passwords are hashed with bcrypt and are never shown in the admin UI or returned by the API. Admins can view account IDs, names, email addresses, phone numbers, roles, and recent sign-in/registration activity. This is a local learning setup, not production-hardened; do not expose it publicly without additional security review.
# SHOPY
