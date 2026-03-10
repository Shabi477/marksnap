from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
load_dotenv()

from database import init_db
from routers import auth_router, classes_router, tests_router, scan_router, results_router, school_router
import os

app = FastAPI(title="MarkSnap", version="1.0.0", description="Scan & grade multiple choice tests instantly")

# CORS — allow configured origins + defaults for dev
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(classes_router.router)
app.include_router(tests_router.router)
app.include_router(scan_router.router)
app.include_router(results_router.router)
app.include_router(school_router.router)

# Serve uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "MarkSnap"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
