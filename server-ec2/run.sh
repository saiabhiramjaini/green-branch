#!/bin/bash

# Activate virtual environment if needed
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Run the EC2 agent (settings from .env and config.py)
python -m src.app.api