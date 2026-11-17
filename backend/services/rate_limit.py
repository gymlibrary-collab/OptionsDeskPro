"""
In-process request rate limiting for the unauthenticated auth endpoints.

The app runs as a single process, so a sliding window held in memory is enough;
counts reset on restart.  Limits are per client address, not per account, so an
attacker cannot lock a victim out by hammering the victim's email.
"""
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

_MAX_KEYS = 20_000

_hits: dict[tuple[str, str], deque] = {}
_lock = threading.Lock()


def client_key(request: Request) -> str:
    """
    The address the nearest trusted proxy saw.  The left-most X-Forwarded-For
    entry is supplied by the client and can be forged to dodge the limit, so
    prefer X-Real-IP, then the right-most X-Forwarded-For entry.
    """
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def retry_after(bucket: str, key: str, limit: int, window_s: float) -> int | None:
    """Record a hit. Return None if allowed, else seconds until the next slot."""
    now = time.monotonic()
    with _lock:
        if len(_hits) > _MAX_KEYS:
            for k in [k for k, q in _hits.items() if not q or now - q[-1] > 3600]:
                del _hits[k]
        q = _hits.setdefault((bucket, key), deque())
        while q and now - q[0] >= window_s:
            q.popleft()
        if len(q) >= limit:
            return max(1, int(window_s - (now - q[0])) + 1)
        q.append(now)
        return None


def rate_limit(bucket: str, limit: int, window_s: float):
    """FastAPI dependency: at most `limit` requests per client per `window_s`."""

    def _dep(request: Request) -> None:
        wait = retry_after(bucket, client_key(request), limit, window_s)
        if wait is not None:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please wait a few minutes and try again.",
                headers={"Retry-After": str(wait)},
            )

    return _dep
