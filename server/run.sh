#!/bin/bash

# Activate virtual environment if needed
source .venv/bin/activate

# Run the FastAPI server (host/port from settings.toml)
uv run uvicorn src.app.main:app --reload