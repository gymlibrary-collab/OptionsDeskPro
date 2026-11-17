import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Module-level singleton — created on first call, never at import time (CLAUDE.md).
_client: Client | None = None


def get_supabase() -> Client:
    """
    Return the shared Supabase service-role client, creating it on first call.

    Creating once and reusing avoids the overhead of rebuilding an httpx connection
    pool on every request (~10-20 ms per call). The underlying httpx.Client is
    thread-safe, so the shared instance is safe to call from asyncio.to_thread
    worker threads.

    Never call session-changing auth methods on this client (sign_in_*,
    exchange_code_for_session, refresh_session, sign_out): supabase-py reacts to
    those by replacing the client's Authorization header with that user's token,
    so every later query from every request would run as that user instead of
    the service role. Use new_auth_client() for those calls.
    """
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def new_auth_client() -> Client:
    """A fresh, unshared client for auth calls that change the client's session."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
