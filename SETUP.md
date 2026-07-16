# Local Setup Guide — AI Agent SMM

This guide walks you through running the project on a fresh laptop (macOS, Linux, or Windows).

The app has two parts that run at the same time:
- **Backend** — Python / FastAPI (port `8000`)
- **Frontend** — Next.js (port `3000`)

All data (posts, images, settings) lives in **Supabase in the cloud**, so you do **not** need to install a database locally.

---

## 1. Prerequisites

Install these first if you don't have them:

| Tool | Version | Check with | Get it from |
|------|---------|-----------|-------------|
| **Python** | 3.11 or newer | `python3 --version` | https://www.python.org/downloads/ |
| **Node.js** | 20 or newer | `node --version` | https://nodejs.org (LTS) |
| **Git** | any | `git --version` | https://git-scm.com |

> On Windows, run the commands below in **Git Bash** (installed with Git) or **WSL**, not the default CMD prompt.

---

## 2. Get the code

```bash
git clone https://github.com/dcflm/ai-agent-smm.git
cd ai-agent-smm
```

---

## 3. Add your secret keys

The API keys are **not** in the repo (for security). You need to create two small config files.

### 3a. Backend keys — create a file named `.env` in the project root

Copy the template:
```bash
cp .env.example .env
```

Then open `.env` in any text editor and fill in the real values. The **required** ones are:

```
ANTHROPIC_API_KEY=sk-ant-...            # from console.anthropic.com
SUPABASE_URL=https://xxxx.supabase.co   # from Supabase project settings
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres
```

Optional (features degrade gracefully if left blank):
- `TAVILY_API_KEY` — news search (without it, autonomous news generation won't find articles)
- `OPENAI_API_KEY` — embeddings for the knowledge base / style memory
- `NANO_BANANA_API_KEY` — AI image generation (posts just have no image without it)
- `LINKEDIN_*` — publishing to LinkedIn (without it, approved posts stay "approved" but aren't posted)

> 💡 The exact key values are the same ones already set in the Render dashboard for the live deployment. Copy them from there, or from the original laptop's `.env` file.

### 3b. Frontend config — create `frontend/.env.local`

```bash
cp frontend/.env.local.example frontend/.env.local
```

The default content already points at your local backend, so no editing is needed:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## 4. Start the app

Open **two terminal windows**, both in the project folder.

### Terminal 1 — Backend
```bash
./run-backend.sh
```
The first run creates a Python virtual environment and installs dependencies (takes ~1–2 minutes). Later runs start instantly.

When you see `Application startup complete.` the backend is ready at http://localhost:8000

### Terminal 2 — Frontend
```bash
./run-frontend.sh
```
The first run installs Node packages (~1 minute). When you see `Ready`, open:

### 👉 http://localhost:3000

That's the app.

---

## 5. Verify it works

- Open http://localhost:8000/health — should show `{"status":"ok"}`
- Open http://localhost:3000 — the dashboard loads and shows existing posts (pulled from Supabase)

---

## Troubleshooting

**`python3: command not found`** → install Python 3.11+ (step 1). On some systems the command is just `python`.

**`Permission denied` when running `./run-backend.sh`** → run `chmod +x run-backend.sh run-frontend.sh` once.

**Backend error `Could not resolve authentication method`** → your `ANTHROPIC_API_KEY` in `.env` is empty or wrong.

**Frontend loads but shows no data / network errors** → the backend isn't running, or `frontend/.env.local` is missing. Confirm Terminal 1 shows "Application startup complete."

**Node version too old (Next.js needs 20+)** → install Node 20 LTS. If you use `nvm`: `nvm install 20 && nvm use 20`.

**Port already in use** → something else is on 8000 or 3000. Stop it, or on macOS/Linux run `kill $(lsof -ti :8000)` / `kill $(lsof -ti :3000)`.

---

## Email notifications (Resend)

The app can email the reviewer after each scheduled generation ("N new posts ready for review").

1. Sign up free at [resend.com](https://resend.com) **using the email address that should receive the notifications** — with the default sender, Resend only delivers to the account owner's own address.
2. Create an API key (Resend dashboard → API Keys) and set it as `RESEND_API_KEY` — in `.env` locally, or in the Render dashboard for the live deployment.
3. In the app → **Schedule** page → turn "Email me for review" **On**, enter the address, **Save**. Use the **Send test email** button to verify delivery instantly; the "Delivery ready / Server key missing" chip shows whether the server key is configured.

**Sustainable path (send to anyone):** verify your company's domain in Resend (Domains → Add domain → set the DNS records), then set `EMAIL_FROM=noreply@yourdomain.com`. After that, notifications can go to any recipient — required once more than one person reviews posts.

---

## Notes

- You do **not** need Supabase running locally — the app talks to the cloud project directly.
- Changing data locally (generating/approving posts) affects the **same** cloud database as the live site, because they share one Supabase project.
- To stop either server, press `Ctrl+C` in its terminal.
