# GGU Store

Personal storefront project built with React, Vite, Tailwind CSS, Express, Supabase PostgreSQL, and Supabase Storage.

## Start locally and deploy

Read [SETUP-SUPABASE.md](SETUP-SUPABASE.md) before starting the updated app. It explains the free Supabase project, private Storage bucket, backend-only credentials, SQLite data transfer, validation, Render settings and rollback.

For an existing shop, stop writes and run the verified SQLite transfer BEFORE starting this version. The source database is left unchanged. Do not delete your old database or expose its contents in Git.

After completing the setup, run `npm ci`, `npm test`, and `npm run dev`. The API runs on port 3001 locally; Vite forwards `/api` requests. Production Express serves the built frontend and API from the same origin.

Website branding, accounts, sessions, orders, balances and settings are stored in Supabase PostgreSQL. Uploaded image and receipt bytes are stored in a private Supabase Storage bucket, accessed through the existing API routes. No Supabase Auth migration is required.

## Buyer profiles and manual requests

Customers can open `/profile` to see their member ID, saved billing addresses, followed and visited stores, notifications, and balance. Buyers and sellers each have one USD-denominated store-credit balance, starting at **$0**. Existing stored values are copied during migration without resetting balances or rerunning old destructive SQLite migrations. Back up the original SQLite database before migration. Only admins can adjust balances. Saved addresses can be selected on the billing page. Store visits are recorded only for signed-in customers.

The profile overview and wallet page have an eye button to hide or show the displayed balance. This only masks the amount on screen; it does not change or protect the stored balance.

From an account folder, an admin can add to or subtract from a buyer's or seller's balance with a recorded reason. Balance is internal store credit, not cash, and adjustments do not transfer funds. Seller sales and profit can be edited in the linked seller metrics page; they are manually configured figures, not verified sales. Admins can rename an existing seller store and suspend or restore buyer and seller accounts with a reason. Suspension revokes active sessions and blocks login; a suspended seller's store and products are hidden and cannot be newly ordered. Restoring the account makes its previously published listings visible again. Existing orders are retained, and account actions are recorded in the admin folder. Admin accounts cannot be suspended through these controls.

Billing pre-fills a signed-in buyer's name, email and phone, plus their default saved address when available. Buyers can edit these fields or select another saved address for the current checkout; changing the billing email does not change the account email.

The deposit and withdrawal buttons create manual requests for one of the displayed coin options. An admin can send or update the accepted coin, network, wallet address and instructions per pending deposit. Buyers can copy the address and upload up to ten PNG/JPEG screenshots per request (2 MB each); the admin can download them. Each screenshot retains the payment details in effect when uploaded. Screenshots are not proof of settlement and must be independently verified. An admin can mark a request confirmed or rejected, and separately adjust store credit with a recorded reason. Confirmation does not verify a payment, transfer cryptocurrency, or change the balance. No payment provider or blockchain is connected, and store credit is not cash or automatically withdrawable. Buyer signup and request notifications are available in the admin notification center.

The admin dashboard and open buyer profile check for updates every 15 seconds. The admin receives an in-app notification when a buyer submits a request and another when a screenshot is uploaded. The admin must send the wallet details for each request; they are not generated or sent automatically when the coin is selected.

Buyers must first set a transaction password in profile Setup using their login password. Enter it before selecting a deposit coin or submitting a withdrawal. Selecting a deposit coin then immediately sends a request without an amount. The buyer sees a waiting indicator until the admin provides the wallet; a wallet-details dialog appears with a copy button only while that request is open. Pending requests can be reopened from request history, where existing wallet details are shown inline. The buyer enters the amount once the wallet is available, then can upload a receipt. Changing the coin or amount requires a new request. Amount-less requests cannot be confirmed.

The profile overview links to separate pages for wallet request history (`/profile/wallet`), test orders, favorite products, followed stores, visited-store history (`/profile/visits`), settings, addresses and notifications. Store history shows visit counts and the most recent visit recorded while signed in. Buyers and admins can exchange messages at `/messages`. Setup provides name, phone, login and transaction password changes and a cancellation review request. A cancellation request never deletes or disables an account automatically; an admin can mark it reviewed or declined on the account details page. Older `/profile#...` links redirect to their corresponding profile page.

Signed-in buyers can select a configured coin at checkout to create a manual order. In Orders & manual payments the admin saves a wallet, network and manual USD-per-coin rate for each coin. Unconfigured coins are unavailable. The server calculates the product subtotal, tax at 3% rounded down to whole cents, and zero shipping; it divides the USD total by the saved rate and rounds the coin amount up to eight decimal places. Rates are not updated automatically and must be maintained by the admin. The order snapshots the wallet and amount, so later changes do not alter existing quotes. Older orders awaiting manual quotes still require admin review. Buyers can copy the wallet, upload a PNG/JPEG screenshot, and follow the review from My Orders. Screenshots do not prove settlement: the admin must independently verify a transfer before marking it paid. No blockchain or payment provider is integrated. Card options are unavailable.

The My Orders page groups these test records by their saved status and provides expandable item, billing and status-history details. Product image URLs are saved with new order items. For older orders, the current image is used at migration if the product still exists; otherwise an unavailable-image placeholder is shown. Statuses are administrator-set labels, not live logistics information.

Sellers see new orders before payment confirmation, including only their own items and the buyer's name. They receive notifications for a new order, receipt review, payment confirmation or rejection, and fulfillment status changes. The notification bell shows an unread count and refreshes every 15 seconds while the workspace is open. Until payment is confirmed, sellers must not fulfill orders and cannot update logistics. After confirmation, the admin and that seller can update the seller's manually assigned logistics status; these are not live tracking events. Manual deposit requests on the buyer wallet page remain separate from orders. Historical test orders remain clearly marked and are not converted into paid orders.

Any signed-in customer, seller, or admin can place a coin purchase and access their own payment, receipts, and refund requests. Buyers and sellers can instead pay the full amount using their store-credit balance; the server checks the current total and deducts it atomically, recording the purchase once even if the request is retried. Store-credit orders do not process external payments or seller payouts. Refunds for these orders require contacting the administrator; they are not automatically credited or transferred. Personal purchases are available at `/orders`; the seller's shop orders and the admin's order-management view remain separate.

After uploading a payment screenshot, buyers return to their orders with a pending notice. The notification bell and temporary messages report administrator verification and seller/admin fulfillment updates while the site is open; the notifications remain available in the message center. Statuses are manually entered, not live tracking. The admin dashboard groups its main sections into expandable panels and opens payment management in a dialog. A branded loading screen appears for slower foreground API requests; background refreshes do not interrupt browsing.

Admins can open an order in payment management to view its screenshot without downloading it, independently verify the transfer, and then update each seller's fulfillment to pending, about to be sent, sent, on the way, or arrived. The admin bell marks unread notifications in red. The dashboard chart counts orders created on each of the past seven UTC dates; confirmed totals reflect manual admin confirmations rather than verified blockchain transactions.

Checkout leaves purchased items in the local browser cart until payment is confirmed. Store-credit orders are confirmed immediately; coin orders require manual admin confirmation. Once the buyer is signed in on that browser, the cart checks for confirmation and removes the purchased quantities; products added later remain. The cart and pending-cart record are local to the browser and are not synchronized across devices. A rejected or unconfirmed order leaves the cart unchanged.

Buyer, seller and administrator sessions persist across browser restarts and independent sign-ins. Sessions expire after one year of inactivity and are renewed during authenticated activity near expiry. Logging out ends the current session; password resets and account suspension revoke all sessions. Password changes revoke other buyer sessions. Browsers can also remove cookies, and one browser profile uses one account at a time.

Purchase and historical test orders display a unique, randomly generated eight-digit order number across buyer, seller, admin and refund views. Existing orders receive a number on API startup, while their internal IDs and existing links remain unchanged. The migration preserves these numbers; keep PostgreSQL backups after cutover.

The seller bell shows red for unread notifications and green when there are none. Individual seller notifications show red when unread and green when read. Open a notification's details or mark it read in the message center to update its state.

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
