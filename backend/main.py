import os
import math
import json
from fastapi import FastAPI
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
]
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


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
