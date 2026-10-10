"""Cost-price bookkeeping shared by the stock and purchases routers."""
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Purchase, Stock

TWO = Decimal("0.01")


def d2(x) -> Decimal:
    return Decimal(str(x or 0)).quantize(TWO)


def recompute_cost_price(stock: Stock, db: Session) -> None:
    """stock.cost_price = weighted average cost over every purchase of the item.

    Simple and stable: editing or deleting any old purchase re-derives the same
    figure. An item with no purchases keeps whatever was typed by hand.
    """
    qty_total, cost_total = (
        db.query(
            func.coalesce(func.sum(Purchase.qty), 0),
            func.coalesce(func.sum(Purchase.total_cost), 0),
        )
        .filter(Purchase.stock_barcode == stock.stock_barcode)
        .first()
    )
    if qty_total and int(qty_total) > 0:
        stock.cost_price = (Decimal(str(cost_total)) / Decimal(int(qty_total))).quantize(TWO)


def current_costs(db: Session) -> dict[str, Decimal]:
    """{barcode: cost_price} for every item with a known cost — the fallback for
    bill lines sold before cost tracking existed."""
    return {
        barcode: Decimal(str(cost))
        for barcode, cost in db.query(Stock.stock_barcode, Stock.cost_price)
        .filter(Stock.cost_price.isnot(None))
        .all()
    }
