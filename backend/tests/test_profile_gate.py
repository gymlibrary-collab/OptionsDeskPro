"""
verify_token must not accept a Supabase login that never went through the
backend sign-in flow (no user_profiles row), except admin, active staff and the
bootstrap endpoints that create the profile.
"""
import asyncio
import os
import sys
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import services.auth_utils as au


def _run(coro):
    return asyncio.run(coro)


def _request(token="tok"):
    req = MagicMock()
    req.cookies = {"sb_access_token": token}
    req.headers = {}
    req.state = type("S", (), {})()
    return req


def _supabase(*, profile=None, staff=None, deactivated=False, auth_error=None, email="new@example.com"):
    """Fake client: auth.get_user plus user_profiles / platform_staff lookups."""
    sb = MagicMock()
    if auth_error:
        sb.auth.get_user.side_effect = auth_error
    else:
        sb.auth.get_user.return_value = MagicMock(
            user=MagicMock(id="u1", email=email, user_metadata={}, app_metadata={})
        )

    def table(name):
        t = MagicMock()
        data = {"user_profiles": profile, "platform_staff": staff}[name]
        res = MagicMock(data=data)
        t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = res
        return t

    sb.table.side_effect = table
    return sb


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    au._profile_exists_cache_ts.clear()
    au._deactivation_cache.clear()
    au._deactivation_cache_ts.clear()
    monkeypatch.setattr(au, "_maybe_refresh", lambda *a, **k: asyncio.sleep(0, result=None), raising=False)
    monkeypatch.setattr(au, "_is_deactivated", lambda uid: False)


def _use(monkeypatch, sb):
    import services.db as db
    monkeypatch.setattr(db, "get_supabase", lambda: sb)


def test_login_without_profile_is_refused(monkeypatch):
    _use(monkeypatch, _supabase(profile=None, staff=None))
    with pytest.raises(HTTPException) as exc:
        _run(au.verify_token(_request()))
    assert exc.value.status_code == 401
    assert "sign in again" in exc.value.detail.lower()


def test_login_with_profile_is_accepted_and_cached(monkeypatch):
    sb = _supabase(profile={"id": "u1"})
    _use(monkeypatch, sb)
    assert _run(au.verify_token(_request()))["sub"] == "u1"
    calls = sb.table.call_count
    _run(au.verify_token(_request()))
    assert sb.table.call_count == calls  # second call served from cache


def test_missing_profile_is_not_cached(monkeypatch):
    """A user who has just signed in must not stay locked out for the cache lifetime."""
    _use(monkeypatch, _supabase(profile=None, staff=None))
    with pytest.raises(HTTPException):
        _run(au.verify_token(_request()))
    _use(monkeypatch, _supabase(profile={"id": "u1"}))
    assert _run(au.verify_token(_request()))["sub"] == "u1"


def test_active_staff_without_profile_is_accepted(monkeypatch):
    _use(monkeypatch, _supabase(profile=None, staff={"id": "u1"}))
    assert _run(au.verify_token(_request()))["sub"] == "u1"


def test_admin_without_profile_is_accepted(monkeypatch):
    _use(monkeypatch, _supabase(profile=None, staff=None, email=au.ADMIN_EMAIL))
    assert _run(au.verify_token(_request()))["email"] == au.ADMIN_EMAIL


def test_bootstrap_variant_accepts_user_without_profile(monkeypatch):
    sb = _supabase(profile=None, staff=None)
    _use(monkeypatch, sb)
    assert _run(au.verify_token_bootstrap(_request()))["sub"] == "u1"


def test_database_error_fails_open(monkeypatch):
    sb = _supabase(profile=None)
    sb.table.side_effect = Exception("db down")
    _use(monkeypatch, sb)
    assert _run(au.verify_token(_request()))["sub"] == "u1"


def test_rejected_token_does_not_echo_supabase_error(monkeypatch):
    _use(monkeypatch, _supabase(auth_error=Exception("JWT expired at 2026 for https://secretref.supabase.co")))
    with pytest.raises(HTTPException) as exc:
        _run(au.verify_token(_request()))
    assert exc.value.status_code == 401
    assert exc.value.detail == "Not authenticated"
    assert "supabase" not in exc.value.detail.lower()


def test_only_sign_in_and_logout_use_the_bootstrap_dependency():
    import routes.auth_routes as ar
    bootstrap_paths = set()
    for r in ar.router.routes:
        deps = [d.call for d in getattr(getattr(r, "dependant", None), "dependencies", [])]
        if au.verify_token_bootstrap in deps:
            bootstrap_paths.add(r.path)
    assert bootstrap_paths == {"/auth/login", "/auth/logout"}
