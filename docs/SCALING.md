# Scaling roadmap — from bizpando (single tenant) to a multi-company platform

This document maps every single-tenant assumption in the current codebase and the
migration path to serve multiple companies on one platform. Nothing here blocks
the bizpando launch; it's the checklist for the next phase.

## Current single-tenant assumptions (inventory)

| Area | Today | Where |
|---|---|---|
| Brand identity | `company_name` setting (default "bizpando AG"); used in emails. Agent prompts mention bizpando but are editable via Settings UI | `backend/config.py`, `backend/utils/email_sender.py`, hardcoded fallbacks in `backend/agent/core.py` + `backend/api/create.py` system prompts, frontend title/branding |
| System prompt | ONE prompt in Supabase Storage (`settings/system_prompt.json`) | `backend/api/settings.py` |
| Schedule | ONE schedule (`settings/schedule_settings.json`) | `backend/api/schedule.py` |
| Usage/cost tracking | ONE counter file (`settings/api_usage_log.json`) | `backend/utils/usage_tracker.py` |
| Publish log | ONE log (`settings/publish_log.json`) | `backend/utils/publish_log.py` |
| LinkedIn credentials | ONE token + org id in env vars | `backend/config.py`, Render env |
| Email recipient | ONE `notify_email` in schedule settings | `backend/api/schedule.py` |
| Email sender | Brevo single verified sender (`EMAIL_FROM`), no-DNS click-verify; delivers to any recipient | `backend/config.py` `brevo_api_key`/`email_from`, `backend/utils/email_sender.py` |
| Notion mirror | ONE database id in env | `backend/agent/tools/notion_tool.py` |
| Posts / KB / embeddings | Tables have NO tenant column | `backend/db/migrations/001_initial.sql` |
| Auth | None — the app is open to anyone with the URL | everywhere |
| Scheduler jobs | Job ids like `auto_post_monday` (global) | `backend/api/schedule.py` |

## Migration path (ordered)

1. **Tenant model.** New `companies` table (id, name, slug, created_at). Add
   `company_id UUID REFERENCES companies(id)` to `posts`, `knowledge_base`,
   `post_embeddings`, `style_rules`, `edit_history`, `post_kpis`.
2. **Per-tenant config record.** Replace the storage-JSON singletons with a
   `company_settings` table (company_id, system_prompt, schedule JSONB,
   notify_email, notify_enabled, company_name, email_from). The storage-JSON
   helpers (`load_settings`/`save_prompt`/usage tracker) become thin wrappers
   over this table keyed by tenant.
3. **Per-tenant credentials.** Move LinkedIn token/org, Notion db id into an
   encrypted `company_credentials` table (use Supabase Vault or app-level
   encryption). Env vars remain only for platform-level keys (Anthropic,
   Resend, Supabase itself).
4. **Auth.** Supabase Auth (email magic links are enough); a `memberships`
   table (user_id, company_id, role). Every API route gains a tenant scope from
   the session; every DB query filters by `company_id` (enable RLS).
5. **Scheduler.** Job ids become `auto_post_{company_id}_{day}`; on startup,
   iterate companies and register each enabled schedule. The news pipeline
   takes `company_id` and loads that tenant's prompt/config.
6. **Email at scale.** Currently Brevo with a single no-DNS verified sender
   (`EMAIL_FROM`) — sends to any recipient, but unauthenticated mail (no SPF/DKIM
   on our domain) has higher spam risk. At volume, authenticate a platform domain
   (Brevo Domains → DNS records, or any domain-auth provider) e.g.
   `notifications.yourplatform.com`; `email_from` becomes a per-tenant display
   name over the platform domain. End-user experience is unchanged (type email).
7. **LinkedIn at scale.** Replace pasted 60-day tokens with the full OAuth
   authorization-code flow: "Connect LinkedIn" button → LinkedIn consent →
   store refresh token (1 year) per tenant → auto-refresh access tokens.
   The current weekly health-check + alert email remains as the safety net.
8. **Frontend.** Company switcher in the nav; branding (name/logo) from the
   tenant record; all api calls carry the tenant context via the session.

## Deliberately deferred (and why)

- **LinkedIn OAuth refresh flow** — needs approved LinkedIn app + redirect
  URIs; the pasted-token + watchdog approach is sufficient for one tenant.
- **RLS / auth** — adds friction during the thesis demo phase; required before
  any second company onboards.
- **Per-tenant cost attribution** — usage tracker gains a company_id dimension
  in step 2; not needed while one tenant pays for everything.
