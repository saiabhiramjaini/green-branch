FROM python:3.11-slim

# Install system dependencies
# - git: Required by GitPython to clone, commit, and push repositories
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Install 'uv' for fast and reliable Python package installation
RUN pip install --no-cache-dir uv

# Copy project specification files first to leverage Docker layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies into the system Python environment using uv
RUN uv pip install --system -r pyproject.toml

# Copy the entire application source code
COPY src ./src

# Create the base path directory for cloned repositories
# Ensure this matches `api_settings.repos_base_path`
RUN mkdir -p /home/ubuntu/repos

# Expose the port the FastAPI server runs on
EXPOSE 8001

# Run the FastAPI server directly
CMD ["python", "-m", "src.app.api"]
