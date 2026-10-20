from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .core.security import hash_password
from .database import Base, SessionLocal, engine
from .migrations import run_migrations
from .models import User
from .routers import (
    auth,
    bills,
    customers,
    dashboard,
    expenses,
    ledgers,
    payables,
    purchases,
    receipts,
    receivables,
    stock,
    suppliers,
    users,
)
from .utils.pdf import bills_dir


def seed_default_users() -> None:
    """Bootstrap the first admin and staff accounts from .env.

    Only runs when there are no accounts at all. After that, accounts are
    managed from the Settings page (names, emails, roles and passwords), so
    the .env values are never re-applied over what was changed in the app.
    """
    db = SessionLocal()
    try:
        if db.query(User.id).first() is not None:
            return
        for email, password, name, role in [
            (settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD, settings.ADMIN_NAME, "admin"),
            (settings.USER_EMAIL, settings.USER_PASSWORD, settings.USER_NAME, "user"),
        ]:
            db.add(
                User(
                    email=email.strip().lower(),
                    hashed_password=hash_password(password),
                    full_name=name,
                    role=role,
                )
            )
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safety net: if init_db.py wasn't run, still create tables and seed users.
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)  # columns added to tables that already existed
    seed_default_users()
    bills_dir()  # make sure the bill-slip directory exists
    yield


app = FastAPI(
    title="Mughal Sticker API",
    version="1.0.0",
    description=(
        "Customers, Store inventory, Purchases & Suppliers, Bills & Ledger, "
        "Expenses, and Dashboard analytics."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(customers.router)
app.include_router(stock.router)
app.include_router(bills.router)
app.include_router(suppliers.router)
app.include_router(purchases.router)
app.include_router(expenses.router)
app.include_router(receipts.router)
app.include_router(receivables.router)
app.include_router(payables.router)
app.include_router(ledgers.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "Mughal Sticker"}
