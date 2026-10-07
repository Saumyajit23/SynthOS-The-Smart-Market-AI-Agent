# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.13-slim AS builder

WORKDIR /app

# Install system deps needed to compile some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies into a prefix so we can copy them cleanly
COPY brain/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source (everything except venv, __pycache__, .env)
COPY brain/ ./
COPY sensory/ ./sensory/

# Don't copy local venv or secrets into the image
RUN rm -rf venv .env __pycache__ **/__pycache__

# Expose the backend port
EXPOSE 8000

# Health check — hits FastAPI's root or /docs
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the server — fastapi_app is the FastAPI instance name in main.py
CMD ["uvicorn", "main:fastapi_app", "--host", "0.0.0.0", "--port", "8000"]