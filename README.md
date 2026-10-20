# Mughal Sticker — Store & Ledger System

A complete business management app for Mughal Sticker: customers, store inventory with cost tracking, suppliers and purchases, bill generation with PDF slips, running ledgers (customer, salesman, item, supplier), daily expenses, and an admin profit dashboard.

**Stack:** React (Vite) · FastAPI (Python) · Neon PostgreSQL

---

## 1. Requirements

| Tool | Version |
|---|---|
| Python | 3.10 or newer |
| Node.js | 18 or newer |
| Internet | Needed to reach the Neon database |

---

## 2. Quick start

**Linux / macOS**

```bash
./setup.sh    # one time: installs everything + creates tables + login accounts
./run.sh      # every time: starts backend (8000) + frontend (5173)
```

**Windows**

```bat
setup.bat     REM one time
run.bat       REM every time
```

Then open **http://localhost:5173**.

> The first request after the app has been idle can take a few seconds — Neon databases sleep when unused and wake automatically.

---

## 3. Login accounts

| Role | Email | Password | Sees |
|---|---|---|---|
| Admin | `ADMIN_EMAIL` | `ADMIN_PASSWORD` | Everything, including the money-sensitive side: Dashboard, cost prices & profit, Purchases, Suppliers, Supplier ledger, Payables, Expenses |
| User | `USER_EMAIL` | `USER_PASSWORD` | Customers, Store (qty & selling price only), Bills & Ledger, Customer/Salesman/Item ledgers, Receivables (record receivings; undo is admin-only) |

These two accounts are created from `backend/.env` **the first time the app starts on an empty database**. After that, accounts are managed in the app (**Settings**): names, emails, roles, passwords and profile pictures — the `.env` values are never re-applied, so changing them later has no effect on existing accounts.

Passwords must be at least 8 characters with an uppercase letter, a lowercase letter, a number and a special character; the API enforces this for every account.

---

## 4. The modules

> **Dates are entered by hand everywhere.** Every form (stock, purchases, bills, deposits, supplier payments, expenses, customers) has a date picker that defaults to today but can be set to any past date, so old records can be back-filled.

### Customers
- Fields: Customer Code (unique ID), Customer Name, Phone Number, Shop Name (optional), Address (optional), "customer since" date (manual, defaults to today).
- Add customers one at a time, or bulk import with **Upload CSV / Excel**. Download the **CSV/Excel template** buttons to get the exact format.
- Invalid rows are skipped and listed with the row number and the reason; valid rows still import.
- Everything is editable later except the Customer Code.

### Store
Three tabs for the admin (staff only see Inventory):

**Inventory** — Stock Barcode (unique ID), Stock Name, Qty, Selling Price, Cost Price (admin), Margin (admin), date added.
- **Add Stock** (admin) records the item *and where it was bought*: pick an existing supplier or add a new one, cost price per unit, what was paid now, and an optional photo/PDF of the supplier's bill. Total cost and remaining balance are calculated live.
- **Restock** (📦+ icon) adds a new purchase lot to an existing item.
- The cost price is the **weighted average** of every purchase lot (recalculated on each restock); it can also be typed by hand for items with no purchases.
- Bulk upload accepts an optional `cost_price` column.
- Low-stock items (≤ 5 units) and out-of-stock items are highlighted.

**Purchases** — every lot bought: date, supplier, item, qty, cost/unit, total, paid, remaining, receipt. Pay the supplier over time (💵 icon), attach/replace the receipt (📎), edit or delete (stock is adjusted). Filters by supplier, date range and paid/owed status.

**Suppliers** — everyone you buy from, with total bought, paid and what you still owe. Click a name for the supplier ledger.

### Bills & Ledger
- **Generate New Bill** — choose an **Existing Customer** (searchable) or add a **New Customer** on the spot (they're saved to the Customers module too).
- Add one or more items: pick from the store, the barcode and price fill automatically, the price stays editable, and an optional **Discount / Unit** shows the discount %.
- Quantity is checked live against the store — if you ask for more than is available you'll see *"Quantity is not available in the inventory."*
- Payment type: Debit / Credit / Cash / Cheque. The **Deposited Amount** can be 0 (credit sales are the default here) and the **Remaining Balance** is calculated automatically.
- The **date of sale** is picked manually (defaults to today). A photo/PDF of the receipt handed to the customer can be attached at creation or later (📎 icon) and viewed any time.
- After generation a **PDF bill slip** is saved to `backend/generated_bills/` and can be previewed any time with the **eye** button.
- The admin sees a **Profit** column per bill: each line snapshots the item's cost price at the moment of sale, so a bill's profit never changes when later purchases change the cost.
- **Deposits over time:** the banknote button records new deposits (with a manual date); deposited/remaining update everywhere and the full payment history is kept.
- Bills **auto-close** when the balance reaches 0, and can also be manually toggled open/closed.
- Rows are colour-coded: **yellow line = open** (balance remaining), **green line = closed** (fully cleared).
- Edit or delete any bill — stock quantities are adjusted or returned to the store automatically, and the PDF slip is regenerated.
- Search (case-insensitive) by customer name, item name, barcode, salesman or Bill ID, plus date-range and open/closed filters.

### Ledgers
Four complete track records, each filterable and printable. Reachable from the **Ledgers** tab, and by clicking any customer, salesman or item name in Bills & Ledger, Customers or Store.

**Customer ledger** — a true running account. Bills are debits, payments are credits, merged into one chronological timeline so every row shows the balance *at that moment*. Includes an opening balance for the period, every item on every bill (qty, price, discount, line total), a summary of what the customer buys, and totals for the period.

> Date filters slice which rows are *shown*; the running balance is always computed over the customer's whole history, so filtering never distorts a balance.

**Salesman ledger** — what one salesman sold, to whom, when, and what it generated. Sales broken down by customer and by item, plus a line-by-line detail of every item sold, with clickable links through to each bill and each customer's own ledger. Headline figures: total sales, collected, outstanding, units, customers served, average bill.

**Item ledger** — where one item went. Which customers bought it (name, code, phone, shop, qty, dates, amounts, balances), which salesmen sold it, a month-by-month breakdown, and every individual sale. Shows what the item earned and what is still owed on it.

**Supplier ledger** (admin) — the customer ledger turned around: purchases are debits (what you owe), payments are credits, with a true running balance, every lot bought, and a summary of what you buy from them.

**Filters (all ledgers):** free-text search, quick ranges (this/last month, last 7/30 days, this/last year), a month picker, explicit From/To dates, and open/closed status. The salesman ledger adds a customer filter; the item ledger adds both customer and salesman filters.

**PDF:** every ledger has a **Preview / Print PDF** button — a landscape report built live from whatever filters are active, previewed in the app with Print and Download.

> **On per-item money:** payments are recorded against a *bill*, not against individual lines. So the paid/outstanding figures on an item or salesman line are that line's proportional share of its bill, labelled "(share)" wherever they appear. Bill-level and customer-level figures are exact.

### Receivables
One screen for *who owes what*. Every customer is listed with their **total sale**, **total received** and **total remaining** (sorted by highest remaining, with a "with dues only" switch), and the page header totals the whole book.

Open a customer and press **Receive payment** to record an amount against the account as a whole instead of opening bills one by one. The amount is applied to that customer's unpaid bills **oldest first**; the modal previews exactly which bills it will clear before you save. Every bill whose balance reaches zero is **closed automatically**, and the per-bill slices appear as normal deposits on the bill slip and in the Customer ledger. The **Money received** table shows every receiving (and every deposit recorded directly on a bill) with the bills it was applied to; the admin can **undo** a receiving, which reopens the bills it had closed.

> A receiving can only be dated on or after the bills it settles, and never for more than the customer owes.

### Payables (admin only)
The same screen from the other side of the counter: *who you owe*. Every supplier is listed with the **total purchased** from them, **total paid** and **total remaining**, and the page header totals the whole book.

Open a supplier and press **Pay supplier** to record an amount against the account as a whole instead of paying purchases one by one. The amount is applied to that supplier's unpaid purchases **oldest first**; the modal previews exactly which purchases it will clear before you save. Every purchase whose balance reaches zero is **marked paid automatically**, and the per-purchase slices appear as normal payments in the Supplier ledger and on the Purchases tab. The **Money paid** table shows every payment (and every payment recorded directly on a purchase) with the purchases it was applied to; a payment made on account can be **undone**, which reopens the purchases it had closed.

> A payment can only be dated on or after the purchases it settles, and never for more than you owe the supplier.

### Expenses (admin only)
- Log day-to-day business spending: date, category (preset list + your own), amount, paid to, note, optional receipt.
- Filter by category and date range; totals and a per-category breakdown for the chosen period.

### Dashboard (admin only)
- **Money is hidden by default** (blurred) — the *Show finances* button reveals it for the current visit.
- **Period filter**: Today, Yesterday, This week, This month, Last month, This year, Last year, All time, or a custom range. Every figure and list below follows it.
- Period cards: Sales, Gross profit (sales − cost of goods, with margin %), Expenses, Net profit (gross − expenses), Cash collected, Cash out, Stock bought — each with the % change versus the previous equal-length period.
- All-time position: what customers owe you, what you owe suppliers, stock value at cost, customers/items/suppliers.
- **Is the business growing?** — Sales, gross profit, net profit and expenses over time (daily / weekly / monthly / yearly).
- What sold, where the money went (expenses by category), bills, top customers and a low-stock watch list, all for the chosen period.
- Profit is counted on the **sale date** (when billed), not when the customer pays. Bills sold before a cost price was set fall back to the item's current cost; the dashboard warns when a period contains lines with no cost at all.

### Settings
- **My profile** — your name, sign-in email and profile picture (shown at the top right with your role).
- **Change password** — requires the current password; the new one must meet the complexity rules above.
- **People who can sign in** (admin) — add staff or admins, edit name/email/role, reset a password, remove an account. There must always be at least one admin, and you cannot remove yourself.

### Layout
The app is responsive: on laptops the sidebar is always visible; on tablets and phones it becomes a drawer behind the ☰ button, forms stack into one column and wide tables scroll sideways.

### Receipts
Uploaded receipts (purchases, bills, expenses) are stored **in the database**, not on disk, so they survive Render redeploys. Photos are downscaled to 1600px JPEG on upload; PDFs are kept as-is. Max 8 MB per file.

---

## 5. Project structure

```
az-spare-parts-stickers/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + startup safety net
│   │   ├── config.py          # reads backend/.env
│   │   ├── database.py        # engine/session (Neon-friendly pooling)
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic request validation
│   │   ├── routers/           # auth, customers, stock, bills, ledgers, dashboard
│   │   └── utils/             # CSV/Excel import, PDF slips, ledger reports, serializers
│   ├── generated_bills/       # PDF slips live here (auto-created)
│   ├── init_db.py             # applies schema + seeds the two accounts
│   ├── requirements.txt
│   └── .env                   # ALL credentials & settings
├── frontend/
│   ├── src/                   # React app (pages, components, styles)
│   └── .env                   # VITE_API_URL
├── database/
│   └── schema.sql             # full PostgreSQL schema
├── setup.sh / setup.bat       # one-time setup
└── run.sh / run.bat           # start both servers
```

---

## 6. Configuration (`backend/.env`)

All credentials live in one file:

- `DATABASE_URL` — the Neon connection string (already filled in).
- `SECRET_KEY` — signs login tokens.
- `ADMIN_*` / `USER_*` — the two seeded accounts.
- `BILLS_DIR` — where PDF slips are stored (default `generated_bills`).
- `CORS_ORIGINS` — allowed frontend addresses.

> **Security note:** since the database password has been shared in plain text, it's a good idea to rotate it in the Neon console and paste the new connection string into `backend/.env`.

---

## 7. Deploying to the cloud

Backend on **Render**, frontend on **Vercel**, database stays on **Neon**. The two
services must be deployed in this order, because each needs the other's URL.

### a. Backend (Render)

Render → **New → Web Service** → connect this repo. Do **not** use *New → Blueprint*:
Blueprints require a payment method on file, whereas a single free web service does
not. (`render.yaml` stays in the repo for when you move to a paid plan.)

| Field | Value |
|---|---|
| Language | `Python 3` |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | `Free` |
| Health Check Path | `/api/health` |

Then add the environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (same one in `backend/.env`) |
| `SECRET_KEY` | Long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The admin login to seed |
| `USER_EMAIL` / `USER_PASSWORD` | The staff login to seed |
| `CORS_ORIGINS` | `http://localhost:5173` for now; updated in step (c) |

`backend/.python-version` pins Python to 3.11.9 — `pandas` publishes no wheels for
3.13, so Render's default would fail the build.

Tables are created and accounts seeded on first boot. Confirm with
`https://<your-service>.onrender.com/api/health`.

### b. Frontend (Vercel)

Vercel → **Add New → Project** → pick this repo, then set **Root Directory** to
`frontend`. Vercel detects Vite on its own. Add one environment variable:

    VITE_API_URL = https://<your-service>.onrender.com

(no trailing slash — the client appends `/api` itself). `frontend/vercel.json`
routes all paths to `index.html`, without which refreshing on `/bills` returns 404.

### c. Connect them

Back in Render, set `CORS_ORIGINS` to your Vercel production URL, e.g.
`https://az-spare-parts-stickers.vercel.app`, and let the service redeploy. Until this is
done the browser blocks every API call as a CORS error.

Vercel gives each preview deployment its own URL, which won't be in `CORS_ORIGINS`
and so can't reach the API. Add specific preview URLs as needed, or switch the
backend to `allow_origin_regex` if you want all of them to work.

### Free-tier cold starts

Render's free plan sleeps a service after ~15 minutes idle; the next request takes
50+ seconds while it wakes, during which the UI shows "Cannot reach the server".
Upgrading to a paid instance removes this — no redeploy needed.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach the server" in the app | The backend isn't running — start it with `run.sh` / `run.bat`. |
| `init_db.py` fails to connect | Check internet access and the `DATABASE_URL` in `backend/.env`; make sure the Neon project is active. |
| First request is slow | Neon wakes from sleep — subsequent requests are fast. |
| Port 8000 or 5173 already in use | Stop the other program, or change the port in `run.sh` and `frontend/.env` (`VITE_API_URL`). |
| Changed a password in `.env` but old one still works | Restart the backend (it re-seeds accounts on startup). |
| `.xls` upload rejected | Save the file as `.xlsx` or `.csv` (templates are provided in both). |
| A ledger PDF opens but won't print | Some browsers block printing a framed PDF — use **Download PDF** and print from your PDF viewer. |

API reference (interactive): **http://localhost:8000/docs**
