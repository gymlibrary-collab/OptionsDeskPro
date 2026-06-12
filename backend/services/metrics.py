"""
In-process request counters for the admin health panel (ADR-0006).

These counters live in the Python process — they reset on restart and are
not accurate across multiple backend instances. They are an operational
convenience display, not a billing-critical number.

Pattern mirrors the cache pattern in market_data.py.
"""
import time
from datetime import datetime, timezone

# Keyed by (event_name, utc_date_str) → count
# e.g. ('strategy_analyze', '2026-06-12') → 312
_request_counter: dict[tuple, int] = {}


def _utc_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def increment(event_name: str) -> None:
    """Increment the counter for an event on the current UTC date."""
    key = (event_name, _utc_date())
    _request_counter[key] = _request_counter.get(key, 0) + 1


def get_counts_last_24h() -> dict[str, int]:
    """
    Return counts for all events on today's UTC date.
    (Approximation: includes only events since last process start on today's date.)
    """
    today = _utc_date()
    result: dict[str, int] = {}
    for (event, date_str), count in _request_counter.items():
        if date_str == today:
            result[event] = result.get(event, 0) + count
    return result
