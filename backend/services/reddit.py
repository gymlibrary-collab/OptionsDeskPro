"""
StockTwits public API client for Trading Desk social buzz.
StockTwits is a financial social network with real-time trader posts —
functionally equivalent to Reddit r/wallstreetbets but with a proper API.
No auth required. Rate limit: ~200 req/hour; in-memory caching keeps us well under.
"""
import time
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

BASE    = "https://api.stocktwits.com/api/2"
HEADERS = {"User-Agent": "OptionsDesk/1.0 (options analysis app)"}

_cache: dict[str, tuple[float, list]] = {}

TTL = {
    "earnings": 600,   # 10 min
    "stocks":   600,   # 10 min
    "crypto":   300,   # 5 min
    "selected": 300,   # 5 min
    "tokens":   900,   # 15 min
}

STOCK_SYMBOLS  = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT"]
CRYPTO_SYMBOLS = ["BTC.X", "ETH.X", "SOL.X", "XRP.X"]
TOKEN_SYMBOLS  = ["SOL.X", "AVAX.X", "LINK.X", "ADA.X"]
EARNINGS_KW    = {"earnings", "eps", "revenue", "beat", "miss", "guidance",
                  "quarterly", "q1", "q2", "q3", "q4", "results"}

# StockTwits uses .X suffix for crypto; map common bare tickers
_CRYPTO_ALIASES = {
    "BTC": "BTC.X", "ETH": "ETH.X", "SOL": "SOL.X", "XRP": "XRP.X",
    "BNB": "BNB.X", "ADA": "ADA.X", "AVAX": "AVAX.X", "LINK": "LINK.X",
    "MATIC": "MATIC.X", "DOT": "DOT.X",
}


def _resolve(sym: str) -> str:
    return _CRYPTO_ALIASES.get(sym.upper(), sym.upper())


def _fetch_symbol(symbol: str, limit: int = 20) -> list:
    url = f"{BASE}/streams/symbol/{symbol}.json?limit={limit}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        if r.status_code in (404, 429):
            if r.status_code == 429:
                logger.warning(f"StockTwits rate limited for {symbol}")
            return []
        r.raise_for_status()
        messages = r.json().get("messages", [])
        base_flair = symbol.replace(".X", "")
        return [_fmt(m, flair=base_flair) for m in messages]
    except Exception as e:
        logger.warning(f"StockTwits fetch {symbol}: {e}")
        return []


def _fmt(m: dict, flair: str = "") -> dict:
    body     = m.get("body", "")
    user     = m.get("user") or {}
    username = user.get("username", "")
    likes    = (m.get("likes") or {}).get("total", 0)

    # Sentiment badge ("Bullish" / "Bearish") if tagged, else ticker
    entities  = m.get("entities") or {}
    sentiment = (entities.get("sentiment") or {}).get("basic", "")
    badge = sentiment if sentiment else flair

    msg_id = m.get("id", "")
    links  = m.get("links") or []
    url    = (links[0].get("url", "") if links
              else f"https://stocktwits.com/{username}/message/{msg_id}" if username
              else "")

    created = 0
    created_at = m.get("created_at", "")
    if created_at:
        try:
            created = int(datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp())
        except Exception:
            pass

    return {
        "title":        body,
        "subreddit":    f"@{username}" if username else "StockTwits",
        "score":        likes,
        "num_comments": 0,
        "url":          url,
        "flair":        badge,
        "created_utc":  created,
    }


def _twits_for_symbols(symbols: list[str], max_per: int = 6) -> list:
    seen: set[str] = set()
    results = []
    for sym in symbols:
        for msg in _fetch_symbol(_resolve(sym), limit=max_per * 2)[:max_per]:
            body = msg["title"]
            if body and body not in seen:
                seen.add(body)
                results.append(msg)
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
        posts = _twits_for_symbols(STOCK_SYMBOLS, max_per=8)
        hits  = [p for p in posts if any(k in p["title"].lower() for k in EARNINGS_KW)]
        return (hits or posts)[:20]
    return _cached("earnings", TTL["earnings"], fetch)


def get_stocks_buzz() -> list:
    return _cached("stocks", TTL["stocks"],
                   lambda: _twits_for_symbols(STOCK_SYMBOLS, max_per=6)[:25])


def get_crypto_buzz() -> list:
    return _cached("crypto", TTL["crypto"],
                   lambda: _twits_for_symbols(CRYPTO_SYMBOLS, max_per=8)[:25])


def get_selected_stocks_buzz(symbols: list[str]) -> list:
    if not symbols:
        return []
    key = "sel_" + "_".join(sorted(s.upper() for s in symbols))
    return _cached(key, TTL["selected"],
                   lambda: _twits_for_symbols(symbols, max_per=8)[:20])


def get_new_tokens_buzz() -> list:
    return _cached("tokens", TTL["tokens"],
                   lambda: _twits_for_symbols(TOKEN_SYMBOLS, max_per=8)[:25])
