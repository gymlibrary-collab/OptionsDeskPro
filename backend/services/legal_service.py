"""
Legal service — active-version cache and pending-acknowledgment check.

Cache is a module-level dict (consistent with the existing in-process cache
pattern used by auth_utils.py and tier_limits.py). The backend runs as a
single Railway instance so an in-process dict is sufficient.

Never call get_supabase() at module level.
"""
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── Active-version cache ─────────────────────────────────────────────────────
# Stores the full legal_document_versions row for the currently active version.
# TTL: 60 seconds. Invalidated synchronously on every publish.

_active_version_cache: Optional[dict] = None
_active_version_cache_ts: float = 0.0
_ACTIVE_VERSION_TTL = 60.0  # seconds


def get_active_version() -> Optional[dict]:
    """
    Return the currently active legal_document_versions row (full dict).
    Served from in-process cache; refreshes from DB on miss or TTL expiry.
    Returns None when no active version has been published.
    On DB error returns None (caller decides whether to fail-open or raise).
    """
    global _active_version_cache, _active_version_cache_ts

    now = time.time()
    if _active_version_cache is not None and (now - _active_version_cache_ts) < _ACTIVE_VERSION_TTL:
        return _active_version_cache

    return _refresh_active_version_cache()


def _refresh_active_version_cache() -> Optional[dict]:
    """Query DB for the active version and update the cache. Returns the row or None."""
    global _active_version_cache, _active_version_cache_ts
    try:
        from services.db import get_supabase
        sb = get_supabase()
        result = (
            sb.table("legal_document_versions")
            .select("id, version_number, title, content_markdown, content_hash, effective_date, published_at")
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        row = result.data or None
        _active_version_cache = row
        _active_version_cache_ts = time.time()
        return row
    except Exception as e:
        logger.warning("legal_service: failed to fetch active legal version from DB: %s", e)
        return None


def invalidate_legal_version_cache() -> None:
    """
    Force a fresh DB fetch on the next call to get_active_version().
    Called synchronously after a successful publish_legal_version RPC.
    """
    global _active_version_cache, _active_version_cache_ts
    _active_version_cache = None
    _active_version_cache_ts = 0.0


def get_pending_legal_acknowledgment(user_id: str, email: str) -> bool:
    """
    Return True if the user has not acknowledged the current active version.

    Logic (matches the design spec Section 4 / login response extension):
    1. Admin email always returns False.
    2. No active version published yet → False (fail-open, no gate without a version).
    3. Otherwise: look up the user's acknowledgment row for the active version ID.
       If none found → True (pending). If found → False.

    Fail-open: any DB error returns False so a legal DB hiccup does not lock
    everyone out (matches the _is_deactivated() pattern in auth_utils.py).
    """
    from services.auth_utils import ADMIN_EMAIL
    if email == ADMIN_EMAIL:
        return False

    try:
        active = get_active_version()
        if not active:
            return False

        version_id = active["id"]

        from services.db import get_supabase
        sb = get_supabase()
        ack = (
            sb.table("legal_acknowledgments")
            .select("id")
            .eq("user_id", user_id)
            .eq("version_id", version_id)
            .maybe_single()
            .execute()
        )
        return ack.data is None  # True = no acknowledgment row found
    except Exception as e:
        logger.warning(
            "legal_service: pending-ack check failed for user %s — failing open: %s",
            user_id, e,
        )
        return False
