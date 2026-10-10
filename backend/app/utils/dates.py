"""Manual date entry helpers.

Every record date in the system (bill, purchase, payment, expense, …) is typed
by hand as a plain YYYY-MM-DD in the user's local time. Storage stays naive
UTC, matching the rest of the app, so the conversion is:

    local midnight of that day  ->  UTC  (via the browser's tz_offset)

with one twist: when the chosen day is *today*, the current time is used
instead of midnight so that entries made on the same day keep the order they
were entered in.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException


def parse_day(s: str) -> datetime:
    try:
        return datetime.strptime(s.strip(), "%Y-%m-%d")
    except (ValueError, AttributeError):
        raise HTTPException(400, "Dates must be in YYYY-MM-DD format.")


def local_day_to_utc(day: str | None, tz_offset: int) -> datetime:
    """YYYY-MM-DD (local) -> naive UTC datetime. Empty/None means 'now'."""
    now_utc = datetime.utcnow()
    if not day or not day.strip():
        return now_utc

    offset = timedelta(minutes=tz_offset)
    local_now = now_utc - offset
    chosen = parse_day(day)

    if chosen.date() == local_now.date():
        return now_utc
    if chosen.date() > local_now.date() + timedelta(days=1):
        raise HTTPException(400, "The date cannot be in the future.")
    return chosen + offset  # local midnight expressed in UTC
