-- ============================================================================
-- Mughal Sticker — Database Schema (PostgreSQL / Neon)
-- Idempotent: safe to run more than once.
-- ============================================================================

-- ------------------------------------------------------------------ users
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(20) NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'user')),
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- -------------------------------------------------------------- customers
-- Customer Code (PK), Customer Name, Phone Number, Shop Name (optional),
-- Address (optional), Datetime (auto on creation)
CREATE TABLE IF NOT EXISTS customers (
    customer_code VARCHAR(50)  PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    phone_number  VARCHAR(50)  NOT NULL,
    shop_name     VARCHAR(255),
    address       TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- ------------------------------------------------------------------ stock
-- Stock Barcode (PK), Stock Name, Qty, Unit Price, Cost Price (v2), Datetime
CREATE TABLE IF NOT EXISTS stock (
    stock_barcode VARCHAR(100) PRIMARY KEY,
    stock_name    VARCHAR(255) NOT NULL,
    qty           INTEGER      NOT NULL DEFAULT 0 CHECK (qty >= 0),
    unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    created_at    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- ------------------------------------------------------------------ bills
-- One row per bill; line items live in bill_items, deposits in bill_payments.
CREATE TABLE IF NOT EXISTS bills (
    bill_id           VARCHAR(30)  PRIMARY KEY,                 -- e.g. MS-00001
    customer_code     VARCHAR(50)  NOT NULL REFERENCES customers(customer_code),
    salesman_name     VARCHAR(255) NOT NULL,
    payment_type      VARCHAR(20)  NOT NULL
                      CHECK (payment_type IN ('Debit','Credit','Cash','Cheque')),
    net_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    deposited_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    status            VARCHAR(10)  NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed')),
    purchase_date     TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    last_modified     TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_bills_customer      ON bills(customer_code);
CREATE INDEX IF NOT EXISTS idx_bills_purchase_date ON bills(purchase_date);
CREATE INDEX IF NOT EXISTS idx_bills_status        ON bills(status);

-- ------------------------------------------------------------- bill_items
CREATE TABLE IF NOT EXISTS bill_items (
    id               SERIAL PRIMARY KEY,
    bill_id          VARCHAR(30)  NOT NULL
                     REFERENCES bills(bill_id) ON DELETE CASCADE,
    stock_barcode    VARCHAR(100) NOT NULL REFERENCES stock(stock_barcode),
    item_name        VARCHAR(255) NOT NULL,          -- snapshot at billing time
    description      TEXT,
    unit_price       NUMERIC(12,2) NOT NULL,
    discounted_price NUMERIC(12,2),                  -- per-unit price after discount
    discount_percent NUMERIC(6,2)  NOT NULL DEFAULT 0,
    qty              INTEGER NOT NULL CHECK (qty > 0),
    line_total       NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill    ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_barcode ON bill_items(stock_barcode);

-- ---------------------------------------------------------- bill_payments
-- Every deposit ever made against a bill (including the initial deposit),
-- so the ledger shows exactly when the customer paid what.
CREATE TABLE IF NOT EXISTS bill_payments (
    id           SERIAL PRIMARY KEY,
    bill_id      VARCHAR(30) NOT NULL
                 REFERENCES bills(bill_id) ON DELETE CASCADE,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_date TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);

-- --------------------------------------------------------------- counters
-- Monotonic counters (bill numbering). Bill numbers are never reused.
CREATE TABLE IF NOT EXISTS counters (
    name  VARCHAR(50) PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- Added in v2 (Mughal Sticker): cost tracking, suppliers, purchases,
-- receipts and expenses. Existing tables gain columns via ALTER … IF NOT EXISTS
-- so this file stays safe to re-run on a live database.
-- ============================================================================

-- ---------------------------------------------------------------- receipts
-- Uploaded receipt images / PDFs, stored in the database (Render's disk is
-- wiped on every deploy). Images are downscaled on upload.
CREATE TABLE IF NOT EXISTS receipts (
    id           SERIAL PRIMARY KEY,
    kind         VARCHAR(20)  NOT NULL,          -- purchase | bill | expense
    filename     VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes   INTEGER      NOT NULL,
    data         BYTEA        NOT NULL,
    uploaded_at  TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- --------------------------------------------------------------- suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL UNIQUE,
    phone      VARCHAR(50),
    address    TEXT,
    notes      TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

-- --------------------------------------------------------------- purchases
-- One lot of stock bought from a supplier. total_cost = qty * cost_price.
CREATE TABLE IF NOT EXISTS purchases (
    id                SERIAL PRIMARY KEY,
    supplier_id       INTEGER      NOT NULL REFERENCES suppliers(id),
    stock_barcode     VARCHAR(100) NOT NULL REFERENCES stock(stock_barcode),
    qty               INTEGER      NOT NULL CHECK (qty > 0),
    cost_price        NUMERIC(12,2) NOT NULL,
    total_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    status            VARCHAR(10)  NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed')),
    purchase_date     TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    note              TEXT,
    receipt_id        INTEGER REFERENCES receipts(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    last_modified     TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_barcode  ON purchases(stock_barcode);
CREATE INDEX IF NOT EXISTS idx_purchases_date     ON purchases(purchase_date);

-- ------------------------------------------------------ purchase_payments
CREATE TABLE IF NOT EXISTS purchase_payments (
    id           SERIAL PRIMARY KEY,
    purchase_id  INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    amount       NUMERIC(14,2) NOT NULL,
    payment_date TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON purchase_payments(purchase_id);

-- ---------------------------------------------------------------- expenses
CREATE TABLE IF NOT EXISTS expenses (
    id           SERIAL PRIMARY KEY,
    expense_date TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    category     VARCHAR(100) NOT NULL,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    paid_to      VARCHAR(255),
    note         TEXT,
    receipt_id   INTEGER REFERENCES receipts(id),
    created_at   TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ------------------------------------------------- columns on older tables
-- stock.cost_price: weighted-average buying cost per unit (NULL = unknown)
ALTER TABLE stock      ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
-- bill_items.cost_price: cost per unit snapshotted at the moment of sale
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
-- bills.receipt_id: optional sales receipt handed to the customer
ALTER TABLE bills      ADD COLUMN IF NOT EXISTS receipt_id INTEGER REFERENCES receipts(id);
