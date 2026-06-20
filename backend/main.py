import asyncio
import os
import math
import json
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn


def _sanitize(obj):
    """Recursively replace NaN/Inf floats with 0.0 so json.dumps never raises."""
    if isinstance(obj, float):
        return 0.0 if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj


class SafeJSONResponse(JSONResponse):
    """JSONResponse that replaces NaN/Inf with 0.0 before encoding."""
    def render(self, content) -> bytes:
        return json.dumps(_sanitize(content), ensure_ascii=False).encode("utf-8")

from routes.options import router as options_router
from routes.orders import router as orders_router
from routes.positions import router as positions_router
from routes.strategies import router as strategies_router
from routes.auth_routes import router as auth_router
from routes.admin_routes import router as admin_router
from routes.trading_routes import router as trading_router
from routes.watchlist import router as watchlist_router
from routes.ai_routes import router as ai_router
from routes.billing_routes import router as billing_router
from routes.platform_routes import router as platform_router
from routes.public_routes import router as public_router
from routes.legal_routes import router as legal_router
from routes.platform_legal_routes import router as platform_legal_router

app = FastAPI(title="Options Trading Dashboard", version="1.0.0", default_response_class=SafeJSONResponse)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Hardcoded client origins (unchanged from pre-SaaS to avoid breaking changes).
# Admin portal origins are env-driven (ADMIN_PORTAL_ORIGINS, comma-separated).
_client_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://optionspro-client-production.up.railway.app",
    "https://optionspro-admin-production.up.railway.app",
    "https://optionscompass-production.up.railway.app",
    "https://optionscompass-admin-production.up.railway.app",
    "https://optionscompass.up.railway.app",
    "https://optionscompass-admin.up.railway.app",
]

# Optional operator override for a custom frontend domain without a code deploy
_extra_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
if _extra_origin and _extra_origin.startswith("https://"):
    _client_origins.append(_extra_origin)
_admin_origins = [
    o.strip()
    for o in os.getenv("ADMIN_PORTAL_ORIGINS", "").split(",")
    if o.strip()
    and o.strip() != "*"
    and (o.strip().startswith("http://") or o.strip().startswith("https://"))
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_client_origins + _admin_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(options_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(positions_router, prefix="/api")
app.include_router(strategies_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(trading_router, prefix="/api")
app.include_router(watchlist_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(platform_router, prefix="/api")
app.include_router(public_router, prefix="/api")
app.include_router(legal_router, prefix="/api")
app.include_router(platform_legal_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
async def warm_cache():
    """Schedule background warm-up and return immediately so Railway health checks pass."""
    asyncio.create_task(_background_warm_cache())


async def _background_warm_cache():
    from services.market_data import get_options_chain, get_quote
    loop = asyncio.get_running_loop()
    for sym in ("SPY", "QQQ", "AAPL", "NVDA", "TSLA", "IWM"):
        try:
            await asyncio.gather(
                loop.run_in_executor(None, get_options_chain, sym, None),
                loop.run_in_executor(None, get_quote, sym),
            )
        except Exception:
            pass


# ── Transparent refresh cookie attachment ─────────────────────────────────────
# When verify_token performs a proactive token refresh it stores the new tokens
# on request.state. This middleware detects that and sets the updated cookies on
# the outgoing response without coupling any route handler to cookie logic.

@app.middleware("http")
async def attach_refreshed_cookies(request: Request, call_next):
    response = await call_next(request)
    new_at = getattr(request.state, "new_access_token", None)
    new_rt = getattr(request.state, "new_refresh_token", None)
    if new_at:
        from services.auth_utils import _set_auth_cookies
        _set_auth_cookies(response, new_at, new_rt)
    return response


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
