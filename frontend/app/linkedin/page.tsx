"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  KeyRound,
  Building2,
  Server,
  ClipboardList,
  UserCog,
} from "lucide-react";

// LinkedIn brand logo (lucide's brand icons aren't bundled in this version).
function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

type Status = {
  configured: boolean;
  connected: boolean;
  detail: string;
  organization_id: string | null;
};

const GUIDE_URL = "https://github.com/dcflm/ai-agent-smm/blob/main/LINKEDIN_SETUP.md";

const STEPS = [
  {
    icon: UserCog,
    title: "Be an admin of a LinkedIn Company Page",
    body: "You can only publish to a Company Page you administer. If you don't have one, create it (free) or get an admin role on the bizpando AG page.",
    action: { label: "Create a Company Page", href: "https://www.linkedin.com/company/setup/new/" },
  },
  {
    icon: Building2,
    title: "Create a LinkedIn Developer app",
    body: "In the LinkedIn Developer portal, click “Create app” and link it to your Company Page under the “Company” field.",
    action: { label: "Open LinkedIn Developers", href: "https://www.linkedin.com/developers/apps" },
  },
  {
    icon: ShieldCheck,
    title: "Request “Community Management API” access",
    body: "In your app → Products, request the Community Management API. This grants posting as the organization (w_organization_social). ⏳ LinkedIn reviews this manually — it can take a few days and is the one slow step.",
    action: { label: "Where to request it", href: "https://www.linkedin.com/developers/apps" },
    warn: true,
  },
  {
    icon: KeyRound,
    title: "Generate an access token",
    body: "In your app → Auth → OAuth 2.0 token generator, select the w_organization_social scope, authorize as yourself (a Page admin), and copy the access token. Note: these tokens expire (~60 days) — regenerate when publishing stops working.",
    action: { label: "Open your app’s Auth tab", href: "https://www.linkedin.com/developers/apps" },
  },
  {
    icon: ClipboardList,
    title: "Find your Organization ID",
    body: "Open your Company Page admin view — the number in the URL (…/company/12345678/admin/) is your Organization ID. Enter only the number.",
  },
  {
    icon: Server,
    title: "Add both values to the backend (Render)",
    body: "In the Render dashboard → ai-agent-smm-backend → Environment, set the two variables below, then save. Render redeploys automatically (~1–2 min).",
    action: { label: "Open Render dashboard", href: "https://dashboard.render.com" },
    envVars: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_ID"],
  },
];

export default function LinkedInSetupPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setChecking(true);
    try {
      const s = await api.getLinkedInStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const state: "connected" | "rejected" | "not_configured" | "unknown" = !status
    ? "unknown"
    : status.connected
    ? "connected"
    : status.configured
    ? "rejected"
    : "not_configured";

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#0A66C2] flex items-center justify-center text-white shrink-0">
          <LinkedInLogo className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connect LinkedIn</h1>
          <p className="text-sm text-gray-500">
            Set up direct publishing so approved posts go live on your Company Page.
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div
        className={`rounded-2xl border p-5 ${
          state === "connected"
            ? "bg-green-50 border-green-200"
            : state === "rejected"
            ? "bg-amber-50 border-amber-200"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mt-0.5" />
            ) : state === "connected" ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            ) : state === "rejected" ? (
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
            )}
            <div>
              <p
                className={`font-semibold text-sm ${
                  state === "connected"
                    ? "text-green-700"
                    : state === "rejected"
                    ? "text-amber-700"
                    : "text-gray-700"
                }`}
              >
                {loading
                  ? "Checking connection…"
                  : state === "connected"
                  ? "Connected — direct publishing is active"
                  : state === "rejected"
                  ? "Token set, but rejected by LinkedIn"
                  : "Not connected yet"}
              </p>
              {!loading && status && (
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{status.detail}</p>
              )}
            </div>
          </div>
          <Button
            onClick={() => load(true)}
            variant="outline"
            className="gap-1.5 shrink-0 h-10"
            disabled={checking}
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Re-check
          </Button>
        </div>
      </div>

      {/* What happens when connected */}
      <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-2xl p-5">
        <p className="font-medium text-gray-900 mb-1">How it works once connected</p>
        <p className="leading-relaxed">
          When you click <span className="font-medium">Approve</span> on a post, the app publishes it
          straight to your LinkedIn Company Page — text and image. Until LinkedIn is connected, approving
          a post simply marks it <span className="font-medium">approved</span> without posting, so nothing
          breaks in the meantime.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
          Setup steps
        </h2>
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex gap-4">
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                      step.warn ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    {i + 1}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <h3 className="font-semibold text-gray-900 text-sm">{step.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>

                  {step.envVars && (
                    <div className="mt-3 space-y-2">
                      {step.envVars.map((v) => (
                        <button
                          key={v}
                          onClick={() => copy(v)}
                          className="w-full flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 transition-colors"
                        >
                          <span className="truncate">{v}</span>
                          {copied === v ? (
                            <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          )}
                        </button>
                      ))}
                      <p className="text-[11px] text-gray-400">Tap a variable name to copy it.</p>
                    </div>
                  )}

                  {step.action && (
                    <a href={step.action.href} target="_blank" rel="noopener noreferrer" className="block mt-3">
                      <Button variant="outline" className="gap-1.5 w-full sm:w-auto h-10">
                        {step.action.label}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full guide link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-gray-200 rounded-2xl p-5">
        <div>
          <p className="font-medium text-gray-900 text-sm">Need the full written guide?</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Detailed walkthrough with API commands and troubleshooting.
          </p>
        </div>
        <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className="block sm:shrink-0">
          <Button variant="outline" className="gap-1.5 w-full sm:w-auto h-10">
            Open guide
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </a>
      </div>
    </div>
  );
}
