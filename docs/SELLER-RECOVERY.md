# Seller recovery phrases

Set `RECOVERY_PHRASE_KEY` on the backend before enabling this release. Generate a
32-byte hex key privately with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Preserve it across deployments. Back it up separately from your PostgreSQL backup;
losing it prevents phrase display and admin backup retrieval. Do not replace it
without a planned migration. Never put it in frontend variables or Git.

The schema initializes the private `seller_recovery_phrases` table automatically.
Existing sellers and pending seller applicants enroll when they open a seller page.
The modal blocks normal dismissal until the phrase is copied and saving is confirmed.
Browsers cannot prove the user actually stored a copy or prevent closing the tab;
unfinished enrollment is shown again on the next visit.

Words use 128 bits of cryptographic randomness, plus the BIP-39 checksum and English
word list. These are shop recovery credentials, never cryptocurrency wallet keys.
The database stores a SHA-256 verifier and AES-256-GCM encrypted backup bound to the
account. Plain phrases are not returned from ordinary profile/account-list APIs.

Seller settings require the current password to reveal a phrase. Admin user details
require the administrator's password and explicit identity-review confirmation;
retrieval is rate-limited and recorded without the phrase in account admin history.
Never share phrases through ordinary email; verify the requester independently and
use a private authenticated support channel. Existing support-assisted one-time
reset links remain available when the seller loses their phrase.

Forgot password offers email + ordered phrase + new password. Successful recovery
atomically consumes the phrase, invalidates sessions and outstanding reset tokens,
and creates an account notification. After signing in, the seller saves a new phrase.
Public reset attempts are limited to five per IP per hour. Existing email/support
reset routes remain available; the phrase is an additional recovery method.

Verify with the production backend key set: signup/application modal; copy failure
fallback; Escape blocking; refresh before and after saving; password-protected reveal;
admin rejection and audit; wrong phrase; successful reset; session invalidation;
old phrase rejection; new phrase enrollment. Also test mobile layout and keyboard focus.
