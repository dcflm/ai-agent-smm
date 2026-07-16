# Connecting LinkedIn — Direct Publishing Setup

This guide gets your app posting directly to your LinkedIn **Company Page** when you click **Approve**.

> ⏳ **Read this first.** The one slow part is LinkedIn's approval of the *Community Management API* for your developer app. That is a manual review on LinkedIn's side and can take a few days. Everything else takes ~20 minutes. Until the token is set, the app works normally — approved posts just stay in "approved" instead of going live.

The app needs exactly **two** values at the end:
- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_ORGANIZATION_ID`

---

## Step 1 — You must be an admin of the Company Page

You can only post to a LinkedIn Company Page you administer. If you don't own one, create one at https://www.linkedin.com/company/setup/new/ (free), or get an admin role on bizpando AG's page.

---

## Step 2 — Create a LinkedIn Developer app

1. Go to https://www.linkedin.com/developers/apps and click **Create app**.
2. Fill in app name, and under **Company** select your Company Page (this links the app to the page).
3. Accept the terms and create the app.
4. On the app's **Settings** tab, note the **Client ID** and **Client Secret** (you likely won't need them for the manual-token method, but keep them).

---

## Step 3 — Request the required product access

1. Open your app → **Products** tab.
2. Request **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** (these are usually instant).
3. Request **Community Management API** — this is the one that grants **posting as the organization** (`w_organization_social`) and reading page analytics (`r_organization_social`).
   - This request is **reviewed by LinkedIn** and may take a few days. You may need to describe your use case.

You need the `w_organization_social` scope granted before posting will work.

---

## Step 4 — Get an access token with the right scope

Use LinkedIn's **OAuth 2.0 token generator** (easiest for a single company page):

1. Go to your app → **Auth** tab → find the **OAuth 2.0 tools** / "Token Generator".
2. Select the scopes: `w_organization_social` (and `r_organization_social` if you also want analytics).
3. Authorize as yourself (you must be a Page admin).
4. Copy the generated **access token**.

> ⚠️ These tokens expire (typically 60 days). When posting stops working, regenerate the token and update it in Render (Step 6). The app's LinkedIn status indicator will tell you when the token is rejected.

---

## Step 5 — Find your Organization ID

Your `LINKEDIN_ORGANIZATION_ID` is the **numeric** id of the Company Page.

- Easiest: open your Company Page admin view — the URL contains it, e.g.
  `https://www.linkedin.com/company/12345678/admin/` → the org ID is `12345678`.
- Or call the API with your token:
  ```
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee"
  ```
  Look for `urn:li:organization:XXXXXXXX` — the `XXXXXXXX` is your org ID.

Enter only the number (not the full `urn:li:organization:` prefix) — the app adds the prefix for you.

---

## Step 6 — Add the values to the deployment (Render)

1. Open the Render dashboard → your service **ai-agent-smm-backend** → **Environment**.
2. Set (or update):
   - `LINKEDIN_ACCESS_TOKEN` = the token from Step 4
   - `LINKEDIN_ORGANIZATION_ID` = the number from Step 5
3. Save — Render redeploys automatically (~1–2 min).

For **local** testing, put the same two lines in your `.env` file instead.

---

## Step 7 — Verify

- Call the status endpoint (or check the LinkedIn indicator in the app):
  ```
  curl https://ai-agent-smm-backend.onrender.com/api/linkedin/status
  ```
  - `{"connected": true, ...}` → you're ready. Approving a post now publishes it to LinkedIn.
  - `{"configured": true, "connected": false, ...}` → token is set but rejected (expired or missing scope) — regenerate it (Step 4).
  - `{"configured": false, ...}` → the two env vars aren't set yet.
- Then **Approve** a post in the app. On success its status becomes **published** and a LinkedIn post id is stored. Images are uploaded to LinkedIn automatically.

---

## Notes & limits

- **Text always posts; images are best-effort.** If the image upload to LinkedIn fails for any reason, the post still goes out as text-only rather than failing entirely.
- **Token expiry is the usual cause of "it stopped posting."** There is no automatic refresh in this prototype — regenerate and update the token when the status endpoint reports it's rejected.
- If Community Management access is never approved, direct posting can't work — but the rest of the app (generation, review, editing, analytics) is unaffected.
