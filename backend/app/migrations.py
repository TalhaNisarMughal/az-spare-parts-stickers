"""Tiny forward-only migrations for columns added after the first release.

`Base.metadata.create_all` only creates *missing tables*; it never adds a
column to a table that already exists. The Neon database already holds live
data, so every new column is added here with ADD COLUMN IF NOT EXISTS (or the
SQLite equivalent) on startup — idempotent and safe to run every time.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# (table, column, SQL type + constraints)
COLUMNS: list[tuple[str, str, str]] = [
    ("stock", "cost_price", "NUMERIC(12,2)"),
    ("bill_items", "cost_price", "NUMERIC(12,2)"),
    ("bills", "receipt_id", "INTEGER REFERENCES receipts(id)"),
    ("users", "avatar", "BYTEA"),
    ("users", "avatar_type", "VARCHAR(50)"),
    ("users", "avatar_updated_at", "TIMESTAMP"),
    ("bill_payments", "settlement_id", "INTEGER REFERENCES customer_settlements(id) ON DELETE SET NULL"),
    ("purchase_payments", "settlement_id", "INTEGER REFERENCES supplier_settlements(id) ON DELETE SET NULL"),
]


def run_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in COLUMNS:
            if table not in inspector.get_table_names():
                continue  # create_all handles brand-new tables
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            if engine.dialect.name == "sqlite":
                # SQLite cannot add a REFERENCES clause after the fact; the
                # relationship is enforced by the ORM there anyway.
                ddl = ddl.split(" REFERENCES ")[0].replace("BYTEA", "BLOB")
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            else:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}")
                )
