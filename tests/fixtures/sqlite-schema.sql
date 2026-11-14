CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  , suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0, 1)));
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE password_resets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL
  );
CREATE TABLE auth_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('registered', 'login')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE account_admin_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE seller_email_verifications (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    compare_at_price REAL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    image_urls_json TEXT NOT NULL DEFAULT '[]',
    colors_json TEXT NOT NULL DEFAULT '[]',
    sizes_json TEXT NOT NULL DEFAULT '[]',
    rating REAL NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  , is_store_published INTEGER NOT NULL DEFAULT 1);
CREATE TABLE product_images (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    image BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE seller_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    store_description TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    follower_count INTEGER NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
    visitor_count INTEGER NOT NULL DEFAULT 0 CHECK (visitor_count >= 0),
    country TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'demo_documents_not_stored',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '/messages',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE store_follows (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, seller_id)
  );
CREATE TABLE buyer_wallets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0)
  );
CREATE TABLE reward_balances (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_units >= 0)
  );
CREATE TABLE reward_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    adjustment_units INTEGER NOT NULL,
    balance_units INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE buyer_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
    city TEXT NOT NULL, region TEXT NOT NULL, postal_code TEXT NOT NULL, country TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0
  );
CREATE TABLE buyer_store_visits (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    visit_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, seller_id)
  );
CREATE TABLE buyer_balance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    old_cents INTEGER NOT NULL, new_cents INTEGER NOT NULL,
    reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE schema_migrations (
    name TEXT PRIMARY KEY
  );
CREATE TABLE site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE buyer_balance_reset_audit (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_cents INTEGER NOT NULL,
    reset_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE buyer_request_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES buyer_wallet_requests(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    image BLOB NOT NULL,
    wallet_address TEXT NOT NULL,
    network TEXT NOT NULL,
    coin TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE buyer_security (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    transaction_password_hash TEXT NOT NULL
  );
CREATE TABLE buyer_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id)
  );
CREATE TABLE cancellation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE UNIQUE INDEX cancellation_pending_idx ON cancellation_requests(user_id) WHERE status = 'pending';
CREATE TABLE demo_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_the_way', 'delivered', 'returned')),
    total_cents INTEGER NOT NULL, billing_json TEXT NOT NULL, payment_method TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE demo_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES demo_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, name TEXT NOT NULL,
    price_cents INTEGER NOT NULL, quantity INTEGER NOT NULL, color TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT ''
  , image_url TEXT NOT NULL DEFAULT '');
CREATE TABLE demo_order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES demo_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE seller_dashboard_metrics (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX products_category_idx ON products(category);
CREATE INDEX notifications_user_id_idx ON notifications(user_id, id DESC);
CREATE INDEX messages_conversation_idx ON messages(conversation_seller_id, id);
CREATE INDEX messages_recipient_unread_idx ON messages(recipient_id, read_at);
CREATE TABLE "buyer_wallet_requests" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
          coin TEXT NOT NULL,
          amount_cents INTEGER CHECK (amount_cents > 0 OR (amount_cents IS NULL AND kind = 'deposit')),
          destination TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
          instructions TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          payment_coin TEXT NOT NULL DEFAULT '',
          wallet_address TEXT NOT NULL DEFAULT '',
          network TEXT NOT NULL DEFAULT ''
        );
CREATE TABLE payment_wallets (
      coin TEXT PRIMARY KEY, network TEXT NOT NULL, address TEXT NOT NULL
    , usd_rate TEXT);
CREATE TABLE purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, buyer_id INTEGER NOT NULL REFERENCES users(id),
      request_key TEXT NOT NULL, coin TEXT NOT NULL, billing_json TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER, tax_cents INTEGER,
      coin_amount TEXT, network TEXT, wallet_address TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_quote' CHECK(status IN ('awaiting_quote','awaiting_receipt','awaiting_review','paid','rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, usd_rate TEXT, UNIQUE(buyer_id, request_key)
    );
CREATE TABLE purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      seller_id INTEGER NOT NULL REFERENCES users(id), product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL, image_url TEXT NOT NULL, price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL, color TEXT NOT NULL, size TEXT NOT NULL
    );
CREATE TABLE purchase_sellers (
      order_id INTEGER NOT NULL REFERENCES purchase_orders(id), seller_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','about_to_send','sent','on_the_way','hold','stalled','delivered')),
      PRIMARY KEY(order_id, seller_id)
    );
CREATE TABLE purchase_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      content_type TEXT NOT NULL, image BLOB NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE purchase_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
      seller_id INTEGER NOT NULL REFERENCES users(id), buyer_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','approved','rejected','completed')),
      transfer_reference TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(order_id, seller_id)
    );
CREATE TABLE balance_purchase_history (
      order_id INTEGER PRIMARY KEY REFERENCES purchase_orders(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      balance_after_cents INTEGER NOT NULL CHECK(balance_after_cents >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE order_numbers (
    kind TEXT NOT NULL CHECK(kind IN ('purchase', 'demo')),
    order_id INTEGER NOT NULL,
    number INTEGER NOT NULL UNIQUE CHECK(number BETWEEN 10000000 AND 99999999),
    PRIMARY KEY(kind, order_id)
  );
CREATE TABLE warehouse_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE seller_product_stock (
    product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK(quantity >= 0)
  );
CREATE TABLE seller_warehouse_imports (
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouse_products(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (seller_id, warehouse_id)
  );