"""Start the FastAPI backend using BACKEND_PORT from the project .env."""

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=os.getenv("BACKEND_HOST", "127.0.0.1"),
        port=int(os.getenv("BACKEND_PORT", "8000")),
        reload=True,
        app_dir=str(ROOT),
    )
