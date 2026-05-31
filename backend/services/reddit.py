"""
Reddit public JSON API client with per-key in-memory caching.
No auth required — uses the unauthenticated JSON endpoint.
"""
import time
import logging
import requests

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "OptionsDesk/1.0"}

# (timestamp, data)
_cache: dict[str, tuple[float, list]] = {}

TTL = {
    "earnings": 300,   # 5 min
    "stocks":   300,   # 5 min
    "crypto":   180,   # 3 min
    "selected": 300,   # 5 min
    "tokens":   600,   # 10 min
}


def _fetch(subreddit: str, sort: str = "hot", limit: int = 20) -> list:
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json?limit={limit}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        r.raise_for_status()
        children = r.json()["data"]["children"]
        return [_fmt(c["data"]) for c in children if not c["data"].get("stickied")]
    except Exception as e:
        logger.warning(f"Reddit fetch r/{subreddit}: {e}")
        return []


def _search(subreddit: str, query: str, limit: int = 10) -> list:
    url = (
        f"https://www.reddit.com/r/{subreddit}/search.json"
        f"?q={requests.utils.quote(query)}&sort=new&limit={limit}&restrict_sr=1"
    )
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        r.raise_for_status()
        children = r.json()["data"]["children"]
        return [_fmt(c["data"]) for c in children]
    except Exception as e:
        logger.warning(f"Reddit search r/{subreddit} '{query}': {e}")
        return []


def _fmt(d: dict) -> dict:
    return {
        "title":        d.get("title", ""),
        "subreddit":    d.get("subreddit", ""),
        "score":        d.get("score", 0),
        "num_comments": d.get("num_comments", 0),
        "url":          f"https://reddit.com{d.get('permalink', '')}",
        "flair":        d.get("link_flair_text") or "",
        "created_utc":  int(d.get("created_utc", 0)),
    }


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
        keywords = {"earnings", "results", "eps", "revenue", "beat", "miss",
                    "guidance", "q1", "q2", "q3", "q4", "quarterly", "profit", "loss"}
        posts = _fetch("earnings", "hot", 20) + _fetch("stocks", "hot", 20)
        hits = [p for p in posts if any(k in p["title"].lower() for k in keywords)]
        return sorted(hits or posts, key=lambda x: x["score"], reverse=True)[:20]
    return _cached("earnings", TTL["earnings"], fetch)


def get_stocks_buzz() -> list:
    def fetch():
        posts = _fetch("wallstreetbets", "hot", 20) + _fetch("stocks", "hot", 15)
        return sorted(posts, key=lambda x: x["score"], reverse=True)[:25]
    return _cached("stocks", TTL["stocks"], fetch)


def get_crypto_buzz() -> list:
    def fetch():
        posts = _fetch("CryptoCurrency", "hot", 20) + _fetch("CryptoMarkets", "hot", 15)
        return sorted(posts, key=lambda x: x["score"], reverse=True)[:25]
    return _cached("crypto", TTL["crypto"], fetch)


def get_selected_stocks_buzz(symbols: list[str]) -> list:
    if not symbols:
        return []
    key = "sel_" + "_".join(sorted(s.upper() for s in symbols))
    def fetch():
        query = " OR ".join(f"${s.upper()}" for s in symbols[:6])
        posts = _search("wallstreetbets", query, 12) + _search("options", query, 10)
        return sorted(posts, key=lambda x: x["score"], reverse=True)[:20]
    return _cached(key, TTL["selected"], fetch)


def get_new_tokens_buzz() -> list:
    def fetch():
        posts = _fetch("CryptoMoonShots", "hot", 20) + _fetch("altcoin", "hot", 15)
        return sorted(posts, key=lambda x: x["score"], reverse=True)[:25]
    return _cached("tokens", TTL["tokens"], fetch)
