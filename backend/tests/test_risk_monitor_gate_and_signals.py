"""
Tests for Risk Monitor:
  1. GET /api/positions/risk is Enterprise-only (403 + X-Error-Code: feature_locked),
     evaluated through compute_entitlements (so admin_override_tier_key works).
  2. /positions and /portfolio are NOT gated.
  3. _assess_risk emits a stable `code` on pnl / dte / iv signals.

Supabase is faked; no network access occurs.
"""
import os
import sys
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routes import positions as positions_route  # noqa: E402
from services import tier_limits  # noqa: E402
from services.auth_utils import verify_token  # noqa: E402
from services.legal_service import legal_gate_dep  # noqa: E402


# ── Fake supabase ────────────────────────────────────────────────────────────

class _Q:
    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _FakeSB:
    def __init__(self, sub_row):
        self._sub = sub_row

    def table(self, name):
        if name == "subscriptions":
            return _Q(self._sub)
        return _Q([])  # plans -> empty => hardcoded TIER_LIMITS fallback


def _client(sub_row, email="user@example.com"):
    app = FastAPI()
    app.include_router(positions_route.router, prefix="/api")
    app.dependency_overrides[verify_token] = lambda: {
        "sub": "u1", "email": email, "user_metadata": {}, "app_metadata": {}}
    app.dependency_overrides[legal_gate_dep] = lambda: None
    tier_limits.invalidate_plans_cache()
    tier_limits._plans_cache.clear()
    patcher = patch("services.db.get_supabase", return_value=_FakeSB(sub_row))
    patcher.start()
    return TestClient(app), patcher


@pytest.fixture
def run_client():
    made = []

    def _make(sub_row, **kw):
        c, p = _client(sub_row, **kw)
        made.append(p)
        return c

    yield _make
    for p in made:
        p.stop()
    tier_limits._plans_cache.clear()
    tier_limits.invalidate_plans_cache()


@pytest.fixture
def stub_portfolio():
    with patch.object(positions_route.settlement, "auto_settle_expired", new=AsyncMock()) as settle, \
         patch.object(positions_route.user_portfolio, "get_positions", new=AsyncMock(return_value=[])), \
         patch.object(positions_route.user_portfolio, "get_summary", new=AsyncMock(return_value={"cash": 1})):
        yield settle


# ── 403 gate ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("tier", ["free", "starter", "pro"])
def test_risk_locked_below_enterprise(run_client, stub_portfolio, tier):
    c = run_client({"tier_key": tier, "status": "active"})
    r = c.get("/api/positions/risk")
    assert r.status_code == 403
    assert r.headers["X-Error-Code"] == "feature_locked"
    assert "Enterprise" in r.json()["detail"]
    stub_portfolio.assert_not_called()  # no settlement work for a locked caller


def test_risk_locked_when_no_subscription_row(run_client, stub_portfolio):
    r = run_client(None).get("/api/positions/risk")
    assert r.status_code == 403
    assert r.headers["X-Error-Code"] == "feature_locked"


def test_risk_allowed_for_enterprise_and_settles(run_client, stub_portfolio):
    c = run_client({"tier_key": "enterprise", "status": "active"})
    r = c.get("/api/positions/risk")
    assert r.status_code == 200
    assert r.json() == []
    stub_portfolio.assert_awaited_once()


def test_risk_degraded_enterprise_is_locked(run_client, stub_portfolio):
    """past_due degrades to free exactly as for other features."""
    c = run_client({"tier_key": "enterprise", "status": "past_due"})
    assert c.get("/api/positions/risk").status_code == 403


def test_risk_admin_override_tier_allowed(run_client, stub_portfolio):
    """Admin granted enterprise via admin_override_tier_key is allowed."""
    c = run_client({"tier_key": "free", "status": "active",
                    "admin_override_tier_key": "enterprise"},
                   email="leonardsim.sm@gmail.com")
    assert c.get("/api/positions/risk").status_code == 200


def test_risk_admin_without_override_follows_entitlements(run_client, stub_portfolio):
    """No special admin bypass: same as every other feature gate."""
    c = run_client({"tier_key": "free", "status": "active"},
                   email="leonardsim.sm@gmail.com")
    assert c.get("/api/positions/risk").status_code == 403


def test_positions_and_portfolio_not_gated(run_client, stub_portfolio):
    c = run_client({"tier_key": "starter", "status": "active"})
    assert c.get("/api/positions").status_code == 200
    assert c.get("/api/portfolio").status_code == 200


# ── signal codes ─────────────────────────────────────────────────────────────

def _pos(dte=40, avg=1.0, cur=1.0, action="buy", target=50.0, key="long_call"):
    return SimpleNamespace(
        symbol="AAPL", expiry=(date.today() + timedelta(days=dte)).isoformat(),
        strike=100.0, option_type="call", quantity=1, avg_cost=avg, current_price=cur,
        pnl=0.0, strategy_key=key, strategy_name="X", profit_target_pct=target,
        entry_action=action)


def _codes(pos, iv=None, bias=None):
    return [s.get("code") for s in positions_route._assess_risk(pos, iv, bias)["signals"]]


def test_codes_pnl():
    assert _codes(_pos(cur=1.5)) == ["profit_target_hit"]
    assert _codes(_pos(cur=1.4)) == ["profit_near"]          # 40% >= 37.5%
    assert _codes(_pos(cur=0.75)) == ["stop_near"]           # -25%
    assert _codes(_pos(cur=0.5)) == ["stop_hit"]             # -50%
    assert _codes(_pos(cur=0.4)) == ["stop_hit"]             # -60%, still < 2x stop (-100%)


def test_codes_pnl_stop_2x():
    # target 50 -> 2x stop at -100%
    p = _pos(cur=0.0)
    assert _codes(p) == ["stop_2x"]


def test_codes_dte():
    assert "expiry_today" in _codes(_pos(dte=0))
    assert "dte_3" in _codes(_pos(dte=2))
    assert "dte_7" in _codes(_pos(dte=6))
    assert "dte_21" in _codes(_pos(dte=15))
    assert "expiry_today" not in _codes(_pos(dte=40))


def test_codes_iv_shift_and_legacy_fields_unchanged():
    iv = {"iv_rank": 90, "iv_environment": "high"}
    risk = positions_route._assess_risk(_pos(), iv, None)
    iv_sigs = [s for s in risk["signals"] if s["type"] == "iv"]
    assert iv_sigs and all(s["code"] == "iv_shift" for s in iv_sigs)
    for s in risk["signals"]:
        assert {"level", "type", "msg"} <= set(s)
