#!/bin/bash

# Activate virtual environment if needed
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Run server-runner (settings from .env and config.py)
python -m src.app.api