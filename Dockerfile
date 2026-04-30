FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend package (keeps backend/ as an importable Python package)
COPY backend/ ./backend/

# Persistent-ish directory for generated/uploaded images
RUN mkdir -p static/images

EXPOSE 8000

# Railway injects $PORT automatically; fall back to 8000 locally
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
