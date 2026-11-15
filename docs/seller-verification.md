# Seller verification and approval email

New seller registrations are applications. Signed-in buyers can apply using their existing account, retaining their email, password, purchases and balances. Until an administrator approves the current submission, the account stays a customer with `sellerStatus: pending`. Seller product, warehouse, marketing, store management and fulfillment APIs continue to require the seller/admin role. Pending stores are not listed publicly. Generic role promotion cannot bypass the verification review. Existing active sellers retain their access and are marked as previously active, without claiming identity photos were checked.

Signup requires a valid phone number, one selfie, ID front and ID back, and consent to private manual review. The browser supports camera capture and file selection, re-encodes photos locally to remove camera metadata, and limits each processed photo to 2 MB. The backend independently checks types, image signatures, sizes and consent. No SSN, birth date or document-number input was added.

Photos go to a separate random `verification/` prefix in the existing private Supabase bucket. Uploads refuse a public bucket. Photos never use the public product-image API. Document endpoints require authentication and allow only the applicant or an administrator; they send `Cache-Control: private, no-store`. Raw Storage paths are not returned. Verification request errors do not log request bodies. No real identity photos are in GitHub.

Admin dashboard → Seller applications → Review application opens the user's profile. The verification section is at the top and shows contact details, phone number, three photos, consent time and submission revision. Approval requires an explicit review checkbox, all three photos, a valid phone and the current revision. The administrator may request corrections or decline with a note. Applicants can sign in to `/seller/application`, view status, and submit replacement photos when corrections are requested. Revised photos invalidate old photo links and old review revisions. Approvals record the administrator and time, enable the seller role and notify the user in-app.

After review, the administrator may remove the private photos while retaining the review history. Private object deletion is queued/retried; removed document IDs stop working immediately. Replacement and failed-upload objects are also queued for cleanup.

## Approval emails on free Render

Use the HTTPS Brevo integration already supported by this app. SMTP ports may be restricted on free hosting.

1. Create/use a free Brevo account and verify the sender email under its Senders settings. Complete any activation the provider requires.
2. Create a transactional **API key** under SMTP & API → API Keys. Use an API key, not an SMTP password.
3. In **Render → Environment**, set:

   - `BREVO_API_KEY`: the private Brevo API key.
   - `EMAIL_FROM`: your verified sender, for example `Your Store <verified@example.com>`.
   - `APP_URL`: `https://shopystoretech.netlify.app` (or your actual public frontend URL).

4. Save and deploy. Do not place the key in GitHub, Netlify frontend variables or any `VITE_*` variable. No new paid service or automatic paid option is enabled by this code.

Approval emails are stored in a durable outbox in the same transaction as approval. Without a configured provider, they remain queued. A background worker checks once a minute; failures back off and can be retried from the applicant's admin profile. The administrator sees queued, sending, provider-accepted or failed status. Email outages do not undo approval or grant access early. One outbox entry is created per approved submission revision. Emails contain the applicant's name and a sign-in link, not identity photos or ID details.

`SELLER_EMAIL_VERIFICATION=auto` additionally enables the signup email-code step when a provider is configured. Use `disabled` only if you want to keep that email-code step off; manual photo/phone review and admin approval remain required. `SELLER_VERIFICATION_WORKER=disabled` is for isolated tests and should not be set in production if automatic queued delivery and cleanup are wanted.

For local development, use synthetic sample photos. `npm test` verifies the private bucket requirement, all required documents, pending access, role-bypass rejection, photo permissions, correction/review revisions, approval audit, queued mail, provider failures/retries and photo removal. Browser checks cover camera/file inputs, previews, consent, pending login routing, resubmission and the admin review panel.
