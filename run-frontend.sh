#!/usr/bin/env bash
#
# Portable frontend launcher — works on any laptop (macOS / Linux / Git Bash on Windows).
# First run installs Node packages; later runs start immediately.
#
set -e

cd "$(dirname "$0")/frontend"

# 1. Check Node is available
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install Node 20+ (see SETUP.md)."; exit 1; }

# 2. Warn if Node is older than 20 (Next.js 16 requires it)
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "⚠️  Node $(node --version) detected — Next.js needs 20+. If you use nvm: nvm install 20 && nvm use 20"
fi

# 3. Create the frontend env file if missing
if [ ! -f ".env.local" ]; then
  echo "📝 Creating frontend/.env.local from template..."
  cp .env.local.example .env.local
fi

# 4. Install packages on first run
if [ ! -d "node_modules" ]; then
  echo "📦 First run — installing Node packages (this takes a minute)..."
  npm install
  echo "✅ Packages installed."
fi

# 5. Start the dev server
echo "🚀 Frontend starting on http://localhost:3000  (Ctrl+C to stop)"
exec npm run dev
