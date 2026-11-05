@echo off

REM Activate virtual environment if it exists
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate
)

REM Run the EC2 agent (settings from .env and config.py)
python -m src.app.api