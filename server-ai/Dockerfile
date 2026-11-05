FROM python:3.11-slim

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

# Expose the port the FastAPI server runs on
EXPOSE 8000

# Run the FastAPI server directly
CMD ["python", "-m", "src.app.api"]
