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

## Email notifications — one-time platform setup (operator only, NO DNS)

Email sending is configured **once, by the operator** (you). **End users never touch this** —
in the app they just switch notifications on and type their email, and it works, to any address.

Why a one-time step exists at all: every email needs *some* verified sender identity — this is
email's anti-spam floor, not a quirk of one provider. The good news: with **Brevo** that
verification is **one click on a link — no DNS records**.

**Setup (do this once, ~5 minutes, no DNS):**
1. Create a free account at [brevo.com](https://www.brevo.com).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender** → enter a From name and a
   From address you control → open Brevo's confirmation email and **click the link**. Done — no DNS.
3. **SMTP & API → API Keys** → create a key → set `BREVO_API_KEY` in the Render dashboard.
4. Set `EMAIL_FROM` to that verified sender address (and optionally `EMAIL_FROM_NAME`) in Render.

After that, **any user in any company** just enters their email on the Schedule page and it
works — no account, no domain, no keys on their side, ever. The **Send test email** button lets
a user confirm delivery instantly.

> **Deliverability note (honest):** the no-DNS path is not domain-authenticated (no SPF/DKIM on
> your own domain), so mail is more likely to land in spam. That's fine for a demo/MVP. If this
> grows to real volume across many companies, add the one-time domain DNS records in Brevo (or
> switch to a domain-authenticated sender) for reliable inboxing — still zero friction for end
> users, who always just type their email.

---

## Notes

- You do **not** need Supabase running locally — the app talks to the cloud project directly.
- Changing data locally (generating/approving posts) affects the **same** cloud database as the live site, because they share one Supabase project.
- To stop either server, press `Ctrl+C` in its terminal.
