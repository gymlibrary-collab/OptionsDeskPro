from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routes.options import router as options_router
from routes.orders import router as orders_router
from routes.positions import router as positions_router
from routes.strategies import router as strategies_router
from routes.auth_routes import router as auth_router
from routes.admin_routes import router as admin_router

app = FastAPI(title="Options Trading Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://options-frontend-production.up.railway.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(options_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(positions_router, prefix="/api")
app.include_router(strategies_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
