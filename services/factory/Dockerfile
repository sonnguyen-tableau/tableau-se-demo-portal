FROM python:3.12-slim

# tableauhyperapi requires these system libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for fast dependency install
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Use system Python so uv doesn't create a venv (simpler in Docker)
ENV UV_SYSTEM_PYTHON=1

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies (no dev extras, no playwright)
RUN uv sync --frozen --no-dev

# Copy application code
COPY app/ ./app/

# Create data directory
RUN mkdir -p /tmp/factory

EXPOSE 8000

# Railway overrides PORT via env var; fall back to 8000 for local dev
ENV PORT=8000
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
