"""
Market news service using yfinance.
Reddit's public JSON API is blocked from cloud/server IPs; yfinance news
is already used elsewhere in the app and works reliably.
"""
import time
import logging
from datetime import datetime
import yfinance as yf

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[float, list]] = {}

TTL = {
    "earnings": 300,
    "stocks":   300,
    "crypto":   180,
    "selected": 300,
    "tokens":   600,
}

STOCK_SYMBOLS  = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMZN", "MSFT", "META", "GOOGL", "NFLX"]
CRYPTO_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD"]
TOKEN_SYMBOLS  = ["SOL-USD", "AVAX-USD", "DOT-USD", "LINK-USD", "MATIC-USD", "ADA-USD"]
EARNINGS_KW    = {"earnings", "results", "eps", "revenue", "beat", "miss",
                  "guidance", "quarterly", "profit", "loss", "q1", "q2", "q3", "q4"}


def _parse_time(item: dict) -> int:
    t = item.get("providerPublishTime")
    if t and isinstance(t, (int, float)):
        return int(t)
    content = item.get("content") or {}
    pub = content.get("pubDate", "")
    if pub:
        try:
            return int(datetime.fromisoformat(pub.replace("Z", "+00:00")).timestamp())
        except Exception:
            pass
    return int(time.time())


def _fmt(item: dict, flair: str = "") -> dict | None:
    content = item.get("content") or {}
    title = item.get("title") or content.get("title", "")
    if not title:
        return None
    publisher = (
        item.get("publisher")
        or (content.get("provider") or {}).get("displayName", "")
        or "Market News"
    )
    url = (
        item.get("link")
        or (content.get("canonicalUrl") or {}).get("url", "")
        or (content.get("clickThroughUrl") or {}).get("url", "")
        or ""
    )
    return {
        "title":        title,
        "subreddit":    publisher,
        "score":        0,
        "num_comments": 0,
        "url":          url,
        "flair":        flair,
        "created_utc":  _parse_time(item),
    }


def _news_for_symbols(symbols: list[str], max_per: int = 6) -> list:
    seen: set[str] = set()
    results = []
    for sym in symbols:
        try:
            news = yf.Ticker(sym).news or []
            for item in news[:max_per]:
                fmt = _fmt(item, flair=sym.replace("-USD", ""))
                if fmt and fmt["title"] not in seen:
                    seen.add(fmt["title"])
                    results.append(fmt)
        except Exception as e:
            logger.debug(f"News fetch failed for {sym}: {e}")
    return sorted(results, key=lambda x: x["created_utc"], reverse=True)


def _cached(key: str, ttl: int, fn) -> list:
    now = time.time()
    if key in _cache:
        ts, data = _cache[key]
        if now - ts < ttl:
            return data
    data = fn()
    _cache[key] = (now, data)
    return data


def get_earnings_buzz() -> list:
    def fetch():
        posts = _news_for_symbols(STOCK_SYMBOLS, max_per=8)
        hits = [p for p in posts if any(k in p["title"].lower() for k in EARNINGS_KW)]
        return (hits or posts)[:20]
    return _cached("earnings", TTL["earnings"], fetch)


def get_stocks_buzz() -> list:
    return _cached("stocks", TTL["stocks"],
                   lambda: _news_for_symbols(STOCK_SYMBOLS, max_per=6)[:25])


def get_crypto_buzz() -> list:
    return _cached("crypto", TTL["crypto"],
                   lambda: _news_for_symbols(CRYPTO_SYMBOLS, max_per=8)[:25])


def get_selected_stocks_buzz(symbols: list[str]) -> list:
    if not symbols:
        return []
    key = "sel_" + "_".join(sorted(s.upper() for s in symbols))
    return _cached(key, TTL["selected"],
                   lambda: _news_for_symbols(symbols, max_per=8)[:20])


def get_new_tokens_buzz() -> list:
    return _cached("tokens", TTL["tokens"],
                   lambda: _news_for_symbols(TOKEN_SYMBOLS, max_per=8)[:25])
