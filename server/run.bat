@echo off

REM Activate virtual environment
call .venv\Scripts\activate

REM Run the FastAPI server (host/port from settings.toml)
uv run uvicorn src.app.main:app --reload