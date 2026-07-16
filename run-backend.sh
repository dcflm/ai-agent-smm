#!/usr/bin/env bash
#
# Portable backend launcher — works on any laptop (macOS / Linux / Git Bash on Windows).
# First run creates a virtual environment and installs dependencies; later runs are instant.
#
set -e

# Move to the directory this script lives in (project root), regardless of where it's called from.
cd "$(dirname "$0")"

# 1. Check for a .env file
if [ ! -f ".env" ]; then
  echo "❌ No .env file found."
  echo "   Run:  cp .env.example .env   then fill in your keys. See SETUP.md."
  exit 1
fi

# 2. Pick a python command
PYTHON=python3
command -v $PYTHON >/dev/null 2>&1 || PYTHON=python
command -v $PYTHON >/dev/null 2>&1 || { echo "❌ Python not found. Install Python 3.11+ (see SETUP.md)."; exit 1; }

# 3. Create the virtual environment on first run
if [ ! -d ".venv" ]; then
  echo "📦 First run — creating virtual environment and installing dependencies..."
  $PYTHON -m venv .venv
  ./.venv/bin/pip install --upgrade pip -q
  ./.venv/bin/pip install -r backend/requirements.txt
  echo "✅ Dependencies installed."
fi

# 4. Load .env into the environment
set -a
# shellcheck disable=SC1091
source .env
set +a

# 5. Launch the API with hot-reload
echo "🚀 Backend starting on http://localhost:8000  (Ctrl+C to stop)"
exec ./.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
