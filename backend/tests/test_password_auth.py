"""
Tests for the subscriber password-auth feature:
  POST /api/auth/signup
  POST /api/auth/reset-request
  POST /api/auth/email-login  (admin/staff guard)
  POST /api/auth/update-password  (admin/staff guard)
  _is_admin_or_staff_email  (helper, including fail-closed behaviour)

Supabase is fully mocked — no network calls are made.
"""
import asyncio
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    """Run a coroutine in a fresh event loop (compatible with pytest-asyncio-less runs)."""
    return asyncio.run(coro)


def _mock_request():
    req = MagicMock()
    req.cookies = {}
    req.headers = {}
    req.state = MagicMock()
    return req


# ---------------------------------------------------------------------------
# _is_admin_or_staff_email
# ---------------------------------------------------------------------------

class TestIsAdminOrStaffEmail:
    """Unit tests for the synchronous guard helper."""

    def test_exact_admin_email_returns_true(self):
        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("leonardsim.sm@gmail.com") is True

    def test_admin_email_uppercase_returns_true(self):
        """Guard must catch Admin@... variants — case-insensitive comparison."""
        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("LEONARDSIM.SM@GMAIL.COM") is True

    def test_admin_email_mixed_case_returns_true(self):
        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("Leonardsim.SM@Gmail.COM") is True

    def test_admin_email_with_whitespace_returns_true(self):
        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("  leonardsim.sm@gmail.com  ") is True

    def test_active_staff_email_returns_true(self, monkeypatch):
        import routes.auth_routes as ar

        mock_sb = MagicMock()
        (
            mock_sb.table.return_value
            .select.return_value
            .ilike.return_value
            .eq.return_value
            .maybe_single.return_value
            .execute.return_value
        ).data = {"id": "staff-id-1"}
        monkeypatch.setattr(ar, "get_supabase", lambda: mock_sb)

        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("staff@example.com") is True

    def test_inactive_staff_email_returns_false(self, monkeypatch):
        """is_active = false rows should NOT block password login."""
        import routes.auth_routes as ar

        mock_sb = MagicMock()
        (
            mock_sb.table.return_value
            .select.return_value
            .ilike.return_value
            .eq.return_value
            .maybe_single.return_value
            .execute.return_value
        ).data = None  # no row with is_active = True
        monkeypatch.setattr(ar, "get_supabase", lambda: mock_sb)

        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("former.staff@example.com") is False

    def test_regular_subscriber_returns_false(self, monkeypatch):
        import routes.auth_routes as ar

        mock_sb = MagicMock()
        (
            mock_sb.table.return_value
            .select.return_value
            .ilike.return_value
            .eq.return_value
            .maybe_single.return_value
            .execute.return_value
        ).data = None
        monkeypatch.setattr(ar, "get_supabase", lambda: mock_sb)

        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("subscriber@example.com") is False

    def test_db_error_fails_closed(self, monkeypatch):
        """Any DB exception must return True (refuse, not permit)."""
        import routes.auth_routes as ar

        mock_sb = MagicMock()
        mock_sb.table.side_effect = RuntimeError("DB is down")
        monkeypatch.setattr(ar, "get_supabase", lambda: mock_sb)

        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("subscriber@example.com") is True

    def test_db_execute_error_fails_closed(self, monkeypatch):
        """An error raised at .execute() time also fails closed."""
        import routes.auth_routes as ar

        mock_sb = MagicMock()
        (
            mock_sb.table.return_value
            .select.return_value
            .ilike.return_value
            .eq.return_value
            .maybe_single.return_value
            .execute
        ).side_effect = ConnectionError("network gone")
        monkeypatch.setattr(ar, "get_supabase", lambda: mock_sb)

        from routes.auth_routes import _is_admin_or_staff_email
        assert _is_admin_or_staff_email("subscriber@example.com") is True


# ---------------------------------------------------------------------------
# POST /api/auth/signup
# ---------------------------------------------------------------------------

class TestSignup:
    """POST /api/auth/signup handler tests."""

    def _body(self, email="user@example.com", password="validpassword1"):
        from routes.auth_routes import SignUpRequest
        return SignUpRequest(email=email, password=password)

    # ── Happy-path / anti-enumeration ────────────────────────────────────────

    def test_new_email_returns_200_check_email(self, monkeypatch):
        import routes.auth_routes as ar

        fresh = MagicMock()
        fresh.auth.sign_up.return_value = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import signup
        result = _run(signup(self._body()))
        assert result == {"ok": True, "detail": "check_email"}

    def test_existing_email_still_returns_200(self, monkeypatch):
        """Supabase 'User already registered' must be swallowed — no enumeration."""
        import routes.auth_routes as ar

        fresh = MagicMock()
        fresh.auth.sign_up.side_effect = Exception("User already registered")
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import signup
        result = _run(signup(self._body()))
        assert result == {"ok": True, "detail": "check_email"}

    # ── Admin / staff guard ───────────────────────────────────────────────────

    # ── Server-side validation ────────────────────────────────────────────────

    def test_empty_email_returns_400(self):
        from routes.auth_routes import signup
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _run(signup(self._body(email="")))
        assert exc_info.value.status_code == 400
        assert "required" in exc_info.value.detail.lower()

    def test_empty_password_returns_400(self):
        from routes.auth_routes import signup
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _run(signup(self._body(password="")))
        assert exc_info.value.status_code == 400

    def test_short_password_returns_400(self):
        from routes.auth_routes import signup
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _run(signup(self._body(password="short")))
        assert exc_info.value.status_code == 400
        assert "12" in exc_info.value.detail

    def test_malformed_email_returns_400(self):
        from routes.auth_routes import signup
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _run(signup(self._body(email="notanemail")))
        assert exc_info.value.status_code == 400

    def test_exactly_12_char_password_accepted(self, monkeypatch):
        """A password of exactly the minimum length must NOT trigger the length check."""
        import routes.auth_routes as ar

        fresh = MagicMock()
        fresh.auth.sign_up.return_value = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import signup
        result = _run(signup(self._body(password="exactly12chr")))
        assert result["ok"] is True

    # ── 503 on network failure ────────────────────────────────────────────────

    def test_network_error_returns_503(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException

        fresh = MagicMock()
        fresh.auth.sign_up.side_effect = ConnectionError("connection refused")
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import signup
        with pytest.raises(HTTPException) as exc_info:
            _run(signup(self._body()))
        assert exc_info.value.status_code == 503

    # ── new_auth_client used for sign_up ─────────────────────────────────────

    def test_sign_up_uses_new_auth_client_not_shared(self, monkeypatch):
        """signup must call new_auth_client() for the sign_up call, never get_supabase()."""
        import routes.auth_routes as ar

        shared_called = []

        def _shared():
            shared_called.append(1)
            return MagicMock()

        fresh = MagicMock()
        fresh.auth.sign_up.return_value = MagicMock()

        monkeypatch.setattr(ar, "get_supabase", _shared)
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import signup
        _run(signup(self._body()))
        # The only get_supabase() call allowed is from inside _is_admin_or_staff_email,
        # which we've bypassed with the monkeypatch — so shared_called must be empty.
        assert not shared_called, "sign_up must use new_auth_client, not the shared client"


# ---------------------------------------------------------------------------
# POST /api/auth/reset-request
# ---------------------------------------------------------------------------

class TestResetRequest:
    """POST /api/auth/reset-request handler tests."""

    def _body(self, email="user@example.com"):
        from routes.auth_routes import ResetRequestBody
        return ResetRequestBody(email=email)

    # ── Happy-path / anti-enumeration ────────────────────────────────────────

    def test_known_email_returns_200_check_email(self, monkeypatch):
        import routes.auth_routes as ar

        fresh = MagicMock()
        fresh.auth.reset_password_for_email.return_value = None
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import reset_request
        result = _run(reset_request(self._body()))
        assert result == {"ok": True, "detail": "check_email"}

    def test_unknown_email_still_returns_200(self, monkeypatch):
        """An unregistered email must produce the same neutral response."""
        import routes.auth_routes as ar

        fresh = MagicMock()
        fresh.auth.reset_password_for_email.side_effect = Exception("User not found")
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import reset_request
        result = _run(reset_request(self._body()))
        assert result == {"ok": True, "detail": "check_email"}

    # ── Admin / staff guard ───────────────────────────────────────────────────

    # ── Server-side validation ────────────────────────────────────────────────

    def test_empty_email_returns_400(self):
        from routes.auth_routes import reset_request, ResetRequestBody
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _run(reset_request(ResetRequestBody(email="")))
        assert exc_info.value.status_code == 400
        assert "email" in exc_info.value.detail.lower()

    def test_whitespace_only_email_returns_400(self):
        from routes.auth_routes import reset_request, ResetRequestBody
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _run(reset_request(ResetRequestBody(email="   ")))
        assert exc_info.value.status_code == 400

    # ── 503 on network failure ────────────────────────────────────────────────

    def test_network_error_returns_503(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException

        fresh = MagicMock()
        fresh.auth.reset_password_for_email.side_effect = ConnectionError("connection refused")
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import reset_request
        with pytest.raises(HTTPException) as exc_info:
            _run(reset_request(self._body()))
        assert exc_info.value.status_code == 503

    # ── new_auth_client used for reset ───────────────────────────────────────

    def test_reset_uses_new_auth_client_not_shared(self, monkeypatch):
        import routes.auth_routes as ar

        shared_called = []

        def _shared():
            shared_called.append(1)
            return MagicMock()

        fresh = MagicMock()
        fresh.auth.reset_password_for_email.return_value = None

        monkeypatch.setattr(ar, "get_supabase", _shared)
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        from routes.auth_routes import reset_request
        _run(reset_request(self._body()))
        assert not shared_called, "reset_password_for_email must use new_auth_client"


# ---------------------------------------------------------------------------
# POST /api/auth/email-login — admin/staff guard
# ---------------------------------------------------------------------------

class TestEmailLoginGuard:
    """Guard tests for the existing email-login endpoint."""

    def _body(self, email="user@example.com", password="anypassword"):
        from routes.auth_routes import EmailLoginRequest
        return EmailLoginRequest(email=email, password=password)

    def test_admin_email_refused_403(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException

        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)

        from routes.auth_routes import email_login
        with pytest.raises(HTTPException) as exc_info:
            _run(email_login(_mock_request(), self._body(email="leonardsim.sm@gmail.com")))
        assert exc_info.value.status_code == 403
        assert exc_info.value.headers["X-Error-Code"] == "staff_only_google"

    def test_staff_email_refused_403(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException

        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)

        from routes.auth_routes import email_login
        with pytest.raises(HTTPException) as exc_info:
            _run(email_login(_mock_request(), self._body(email="staff@example.com")))
        assert exc_info.value.status_code == 403

    def test_admin_email_mixed_case_refused_403(self, monkeypatch):
        """The guard must normalise email — Admin@... must not slip past."""
        import routes.auth_routes as ar
        from fastapi import HTTPException

        # Let the real guard run with a mocked DB returning no staff row
        mock_sb = MagicMock()
        (
            mock_sb.table.return_value
            .select.return_value
            .ilike.return_value
            .eq.return_value
            .maybe_single.return_value
            .execute.return_value
        ).data = None
        monkeypatch.setattr(ar, "get_supabase", lambda: mock_sb)

        from routes.auth_routes import email_login
        with pytest.raises(HTTPException) as exc_info:
            _run(email_login(_mock_request(), self._body(email="LEONARDSIM.SM@GMAIL.COM")))
        assert exc_info.value.status_code == 403

    def test_regular_subscriber_reaches_supabase(self, monkeypatch):
        """Non-admin/staff email must pass the guard and reach sign_in_with_password."""
        import routes.auth_routes as ar
        from fastapi import HTTPException

        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)

        fresh = MagicMock()
        fresh.auth.sign_in_with_password.side_effect = Exception("bad credentials")
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)

        from routes.auth_routes import email_login
        with pytest.raises(HTTPException) as exc_info:
            _run(email_login(_mock_request(), self._body()))
        # Should reach Supabase and get 401 (not 403 from the guard)
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/update-password — admin/staff guard
# ---------------------------------------------------------------------------

class TestUpdatePasswordGuard:
    """Guard and recovery-session tests for the update-password endpoint."""

    def _body(self, password="newpassword123"):
        from routes.auth_routes import UpdatePasswordRequest
        return UpdatePasswordRequest(password=password)

    def _payload(self, email="user@example.com", user_id="user-id-1"):
        return {"sub": user_id, "email": email, "user_metadata": {}, "app_metadata": {}}

    def test_admin_email_refused_403(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException

        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)

        from routes.auth_routes import update_password
        with pytest.raises(HTTPException) as exc_info:
            _run(update_password(
                _mock_request(),
                self._body(),
                self._payload(email="leonardsim.sm@gmail.com"),
            ))
        assert exc_info.value.status_code == 403
        assert exc_info.value.headers["X-Error-Code"] == "staff_only_google"

    def test_staff_email_refused_403(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException

        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)

        from routes.auth_routes import update_password
        with pytest.raises(HTTPException) as exc_info:
            _run(update_password(
                _mock_request(),
                self._body(),
                self._payload(email="staff@example.com"),
            ))
        assert exc_info.value.status_code == 403

    def test_short_password_returns_400_before_guard(self, monkeypatch):
        """The length check runs before the guard; admin cannot bypass it either."""
        import routes.auth_routes as ar
        from fastapi import HTTPException

        # Guard would refuse, but length check is first
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)

        from routes.auth_routes import update_password
        with pytest.raises(HTTPException) as exc_info:
            _run(update_password(
                _mock_request(),
                self._body(password="short"),
                self._payload(),
            ))
        assert exc_info.value.status_code == 400
        assert "12" in exc_info.value.detail


# ---------------------------------------------------------------------------
# _is_supabase_service_error
# ---------------------------------------------------------------------------

class TestIsSupabaseServiceError:
    """Unit tests for the 503-detection helper."""

    def test_connection_error_is_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(ConnectionError("connection refused")) is True

    def test_timeout_error_is_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(TimeoutError("timed out")) is True

    def test_rate_limit_message_is_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(Exception("email rate limit exceeded")) is True

    def test_too_many_requests_is_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(Exception("too many requests")) is True

    def test_user_already_registered_is_not_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(Exception("User already registered")) is False

    def test_invalid_credentials_is_not_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(Exception("Invalid login credentials")) is False

    def test_generic_value_error_is_not_service_error(self):
        from routes.auth_routes import _is_supabase_service_error
        assert _is_supabase_service_error(ValueError("some other problem")) is False


# ---------------------------------------------------------------------------
# _MUTATING regex guard — sign_up and reset_password_for_email
# ---------------------------------------------------------------------------

class TestNewAuthCallsUseUnsharedClient:
    """
    Extend the existing TestAuthCallsUseUnsharedClient coverage to verify that
    the two new auth calls added by this feature also use new_auth_client().

    The source-scan approach mirrors test_efficiency_fixes.py so both tests
    enforce the same invariant.
    """

    import re as _re_module

    _SIGN_UP = _re_module.compile(r"sb\.auth\.sign_up\b")
    _RESET_PW = _re_module.compile(r"sb\.auth\.reset_password_for_email\b")

    def _lines(self):
        root = os.path.join(os.path.dirname(__file__), "..")
        return open(os.path.join(root, "routes/auth_routes.py")).read().split("\n")

    def _assert_uses_new_client(self, pattern):
        lines = self._lines()
        found = 0
        for i, line in enumerate(lines):
            if not pattern.search(line):
                continue
            found += 1
            j = i
            import re
            while j >= 0 and not re.search(r"\bsb = ", lines[j]):
                j -= 1
            assert j >= 0, f"No 'sb = ' found before line {i + 1}"
            assert "new_auth_client()" in lines[j], (
                f"auth_routes.py:{i + 1} uses the shared client for a session-changing call"
            )
        assert found > 0, f"Pattern {pattern.pattern!r} not found in auth_routes.py"

    def test_sign_up_uses_new_auth_client(self):
        self._assert_uses_new_client(self._SIGN_UP)

    def test_reset_password_for_email_uses_new_auth_client(self):
        self._assert_uses_new_client(self._RESET_PW)


# ---------------------------------------------------------------------------
# update-password: current password or a fresh emailed-link session required
# ---------------------------------------------------------------------------

def _jwt(amr):
    """Unsigned JWT-shaped token carrying an amr claim (the endpoint verifies via Supabase)."""
    import base64
    import json
    body = base64.urlsafe_b64encode(json.dumps({"sub": "user-id-1", "amr": amr}).encode()).decode().rstrip("=")
    return f"h.{body}.s"


class TestUpdatePasswordRequiresProof:
    """
    Security review H01: a session token alone must not be enough to replace an
    account's password.  Either the session was just established from an emailed
    link, or the caller supplies the current password.
    """

    def _payload(self):
        return {"sub": "user-id-1", "email": "user@example.com", "user_metadata": {}, "app_metadata": {}}

    def _setup(self, monkeypatch, sign_in_ok=True, bearer_user_id="user-id-1"):
        import routes.auth_routes as ar
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)
        monkeypatch.setattr(ar, "_is_deactivated", lambda uid: False)
        shared = MagicMock()
        shared.auth.get_user.return_value = MagicMock(
            user=MagicMock(id=bearer_user_id, email="user@example.com")
        )
        monkeypatch.setattr(ar, "get_supabase", lambda: shared)
        auth_client = MagicMock()
        if not sign_in_ok:
            auth_client.auth.sign_in_with_password.side_effect = Exception("Invalid login credentials")
        monkeypatch.setattr(ar, "new_auth_client", lambda: auth_client)
        return shared, auth_client

    def _request(self, bearer=None, cookie=None):
        req = MagicMock()
        req.cookies = {"sb_access_token": cookie} if cookie else {}
        req.headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
        req.state = type("S", (), {})()
        return req

    def _call(self, req, password="newpassword123", current=None):
        from routes.auth_routes import UpdatePasswordRequest, update_password
        return _run(update_password(
            req, UpdatePasswordRequest(password=password, current_password=current), self._payload()
        ))

    def test_ordinary_session_without_current_password_refused(self, monkeypatch):
        import time
        from fastapi import HTTPException
        shared, _ = self._setup(monkeypatch)
        token = _jwt([{"method": "password", "timestamp": time.time()}])
        with pytest.raises(HTTPException) as exc:
            self._call(self._request(cookie=token))
        assert exc.value.status_code == 400
        assert exc.value.headers["X-Error-Code"] == "current_password_required"
        shared.auth.admin.update_user_by_id.assert_not_called()

    def test_oauth_session_without_current_password_refused(self, monkeypatch):
        import time
        from fastapi import HTTPException
        shared, _ = self._setup(monkeypatch)
        token = _jwt([{"method": "oauth", "timestamp": time.time()}])
        with pytest.raises(HTTPException):
            self._call(self._request(bearer=token))
        shared.auth.admin.update_user_by_id.assert_not_called()

    def test_wrong_current_password_refused(self, monkeypatch):
        import time
        from fastapi import HTTPException
        shared, _ = self._setup(monkeypatch, sign_in_ok=False)
        token = _jwt([{"method": "password", "timestamp": time.time()}])
        with pytest.raises(HTTPException) as exc:
            self._call(self._request(cookie=token), current="wrong-password")
        assert exc.value.status_code == 403
        assert exc.value.headers["X-Error-Code"] == "current_password_invalid"
        shared.auth.admin.update_user_by_id.assert_not_called()

    def test_correct_current_password_allowed(self, monkeypatch):
        import time
        shared, auth_client = self._setup(monkeypatch)
        token = _jwt([{"method": "password", "timestamp": time.time()}])
        assert self._call(self._request(cookie=token), current="old-password") == {"ok": True}
        auth_client.auth.sign_in_with_password.assert_called_once_with(
            {"email": "user@example.com", "password": "old-password"}
        )
        shared.auth.admin.update_user_by_id.assert_called_once_with(
            "user-id-1", {"password": "newpassword123"}
        )
        # the check must run on an unshared client, never the service-role one
        shared.auth.sign_in_with_password.assert_not_called()

    def test_fresh_recovery_session_needs_no_current_password(self, monkeypatch):
        import time
        shared, auth_client = self._setup(monkeypatch)
        token = _jwt([{"method": "recovery", "timestamp": time.time() - 60}])
        assert self._call(self._request(bearer=token)) == {"ok": True}
        auth_client.auth.sign_in_with_password.assert_not_called()
        shared.auth.admin.update_user_by_id.assert_called_once()

    def test_fresh_otp_session_needs_no_current_password(self, monkeypatch):
        import time
        shared, _ = self._setup(monkeypatch)
        token = _jwt([{"method": "otp", "timestamp": time.time() - 60}])
        assert self._call(self._request(bearer=token)) == {"ok": True}

    def test_stale_recovery_session_refused(self, monkeypatch):
        import time
        from fastapi import HTTPException
        shared, _ = self._setup(monkeypatch)
        token = _jwt([{"method": "recovery", "timestamp": time.time() - 3600}])
        with pytest.raises(HTTPException) as exc:
            self._call(self._request(bearer=token))
        assert exc.value.headers["X-Error-Code"] == "current_password_required"
        shared.auth.admin.update_user_by_id.assert_not_called()

    def test_malformed_token_treated_as_no_proof(self, monkeypatch):
        from fastapi import HTTPException
        shared, _ = self._setup(monkeypatch)
        with pytest.raises(HTTPException):
            self._call(self._request(cookie="not-a-jwt"))
        shared.auth.admin.update_user_by_id.assert_not_called()

    def test_bearer_identity_wins_over_cookie_identity(self, monkeypatch):
        """Reset page on a shared browser: the recovery Bearer user is updated, not the cookie user."""
        import time
        shared, _ = self._setup(monkeypatch, bearer_user_id="recovery-user")
        bearer = _jwt([{"method": "recovery", "timestamp": time.time()}])
        cookie = _jwt([{"method": "password", "timestamp": time.time()}])
        assert self._call(self._request(bearer=bearer, cookie=cookie)) == {"ok": True}
        shared.auth.admin.update_user_by_id.assert_called_once_with(
            "recovery-user", {"password": "newpassword123"}
        )

    def test_invalid_bearer_is_unauthenticated(self, monkeypatch):
        from fastapi import HTTPException
        shared, _ = self._setup(monkeypatch)
        shared.auth.get_user.side_effect = Exception("bad jwt")
        with pytest.raises(HTTPException) as exc:
            self._call(self._request(bearer="garbage"))
        assert exc.value.status_code == 401
        shared.auth.admin.update_user_by_id.assert_not_called()


# ---------------------------------------------------------------------------
# Security review M01 / L01 follow-ups
# ---------------------------------------------------------------------------

class TestStaffAddressesGetNeutralResponse:
    """
    Sign-up and reset-request must answer a staff/admin address exactly like any
    other, and must not create an account or send an email for it.
    """

    NEUTRAL = {"ok": True, "detail": "check_email"}

    @pytest.mark.parametrize("email", [
        "leonardsim.sm@gmail.com", "LeonardSim.SM@Gmail.com", "  leonardsim.sm@gmail.com  ",
    ])
    def test_signup_admin_address_neutral_and_nothing_created(self, monkeypatch, email):
        import routes.auth_routes as ar
        from routes.auth_routes import SignUpRequest, signup
        fresh = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        result = _run(signup(SignUpRequest(email=email, password="validpassword1")))
        assert result == self.NEUTRAL
        fresh.auth.sign_up.assert_not_called()

    def test_signup_staff_address_neutral_and_nothing_created(self, monkeypatch):
        import routes.auth_routes as ar
        from routes.auth_routes import SignUpRequest, signup
        fresh = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)
        result = _run(signup(SignUpRequest(email="staff@example.com", password="validpassword1")))
        assert result == self.NEUTRAL
        fresh.auth.sign_up.assert_not_called()

    @pytest.mark.parametrize("email", ["leonardsim.sm@gmail.com", "LEONARDSIM.SM@GMAIL.COM"])
    def test_reset_request_admin_address_neutral_and_nothing_sent(self, monkeypatch, email):
        import routes.auth_routes as ar
        from routes.auth_routes import ResetRequestBody, reset_request
        fresh = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        assert _run(reset_request(ResetRequestBody(email=email))) == self.NEUTRAL
        fresh.auth.reset_password_for_email.assert_not_called()

    def test_reset_request_staff_address_neutral_and_nothing_sent(self, monkeypatch):
        import routes.auth_routes as ar
        from routes.auth_routes import ResetRequestBody, reset_request
        fresh = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: True)
        assert _run(reset_request(ResetRequestBody(email="staff@example.com"))) == self.NEUTRAL
        fresh.auth.reset_password_for_email.assert_not_called()

    def test_staff_lookup_failure_still_sends_nothing(self, monkeypatch):
        """Fail-closed: if the staff lookup errors, treat as staff — neutral answer, no email."""
        import routes.auth_routes as ar
        from routes.auth_routes import ResetRequestBody, reset_request
        broken = MagicMock()
        broken.table.side_effect = Exception("db down")
        monkeypatch.setattr(ar, "get_supabase", lambda: broken)
        fresh = MagicMock()
        monkeypatch.setattr(ar, "new_auth_client", lambda: fresh)
        assert _run(reset_request(ResetRequestBody(email="someone@example.com"))) == self.NEUTRAL
        fresh.auth.reset_password_for_email.assert_not_called()


class TestMinimumPasswordLength:
    def test_signup_rejects_11_characters(self, monkeypatch):
        import routes.auth_routes as ar
        from fastapi import HTTPException
        from routes.auth_routes import SignUpRequest, signup
        monkeypatch.setattr(ar, "_is_admin_or_staff_email", lambda e: False)
        with pytest.raises(HTTPException) as exc:
            _run(signup(SignUpRequest(email="user@example.com", password="elevenchars")))
        assert exc.value.status_code == 400 and "12" in exc.value.detail

    def test_update_password_rejects_11_characters(self):
        from fastapi import HTTPException
        from routes.auth_routes import UpdatePasswordRequest, update_password
        with pytest.raises(HTTPException) as exc:
            _run(update_password(
                _mock_request(), UpdatePasswordRequest(password="elevenchars"),
                {"sub": "u", "email": "user@example.com"},
            ))
        assert exc.value.status_code == 400 and "12" in exc.value.detail


class TestRateLimit:
    def _req(self, real_ip=None, xff=None, host="10.0.0.1"):
        req = MagicMock()
        headers = {}
        if real_ip:
            headers["x-real-ip"] = real_ip
        if xff:
            headers["x-forwarded-for"] = xff
        req.headers = headers
        req.client = MagicMock(host=host)
        return req

    def setup_method(self):
        import services.rate_limit as rl
        rl._hits.clear()

    def test_blocks_after_limit_with_retry_after(self):
        from fastapi import HTTPException
        from services.rate_limit import rate_limit
        dep = rate_limit("t-block", 3, 60)
        req = self._req(real_ip="1.2.3.4")
        for _ in range(3):
            dep(req)
        with pytest.raises(HTTPException) as exc:
            dep(req)
        assert exc.value.status_code == 429
        assert int(exc.value.headers["Retry-After"]) >= 1

    def test_clients_are_limited_independently(self):
        from services.rate_limit import rate_limit
        dep = rate_limit("t-indep", 1, 60)
        dep(self._req(real_ip="1.1.1.1"))
        dep(self._req(real_ip="2.2.2.2"))  # must not raise

    def test_buckets_are_independent(self):
        from services.rate_limit import rate_limit
        req = self._req(real_ip="1.1.1.1")
        rate_limit("t-a", 1, 60)(req)
        rate_limit("t-b", 1, 60)(req)  # must not raise

    def test_window_expiry_allows_again(self, monkeypatch):
        import services.rate_limit as rl
        clock = [1000.0]
        monkeypatch.setattr(rl.time, "monotonic", lambda: clock[0])
        dep = rl.rate_limit("t-exp", 1, 60)
        req = self._req(real_ip="1.1.1.1")
        dep(req)
        clock[0] += 61
        dep(req)  # must not raise

    def test_forged_leftmost_forwarded_for_does_not_dodge_limit(self):
        from fastapi import HTTPException
        from services.rate_limit import rate_limit
        dep = rate_limit("t-xff", 1, 60)
        dep(self._req(xff="6.6.6.1, 9.9.9.9"))
        with pytest.raises(HTTPException):
            dep(self._req(xff="6.6.6.2, 9.9.9.9"))

    def test_auth_routes_are_rate_limited(self):
        import routes.auth_routes as ar
        limited = {
            r.path for r in ar.router.routes
            if any("rate_limit" in getattr(getattr(d, "dependency", None), "__qualname__", "") for d in getattr(r, "dependencies", []))
        }
        assert {"/auth/signup", "/auth/reset-request", "/auth/email-login", "/auth/update-password"} <= limited
