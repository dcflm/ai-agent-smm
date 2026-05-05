"use client";

import { useEffect, useState } from "react";
import { api, CreditsUsage, ApiStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, RefreshCw, ExternalLink, RotateCcw,
  Zap, Search, Image as ImageIcon, Brain,
  CheckCircle2, XCircle, AlertCircle, WifiOff,
} from "lucide-react";

const SERVICE_META: Record<string, { label: string; color: string; icon: React.ElementType; note: string }> = {
  anthropic:   { label: "Anthropic Claude",    color: "bg-orange-500", icon: Brain,      note: "Post generation, chat, prompt refining" },
  openai:      { label: "OpenAI Embeddings",   color: "bg-green-500",  icon: Zap,        note: "Knowledge base & similar post retrieval" },
  tavily:      { label: "Tavily News Search",  color: "bg-blue-500",   icon: Search,     note: "News search for post topics" },
  nano_banana: { label: "Nano Banana Images",  color: "bg-purple-500", icon: ImageIcon,  note: "AI image generation for posts" },
};

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtCost(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `< $0.01`;
  return `$${n.toFixed(4)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-DE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function UsageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

type StatusValue = "ok" | "no_credits" | "invalid_key" | "error" | "loading" | "unknown";

function StatusBadge({ status, detail }: { status: StatusValue; detail?: string }) {
  if (status === "loading") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking...
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span title={detail} className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> Connected
      </span>
    );
  }
  if (status === "no_credits") {
    return (
      <span title={detail} className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
        <XCircle className="w-3.5 h-3.5" /> No credits
      </span>
    );
  }
  if (status === "invalid_key") {
    return (
      <span title={detail} className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
        <XCircle className="w-3.5 h-3.5" /> Invalid key
      </span>
    );
  }
  if (status === "error") {
    return (
      <span title={detail} className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
        <AlertCircle className="w-3.5 h-3.5" /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <WifiOff className="w-3.5 h-3.5" /> Unknown
    </span>
  );
}

export default function CreditsPage() {
  const [data, setData] = useState<CreditsUsage | null>(null);
  const [statusData, setStatusData] = useState<ApiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setStatusLoading(true);
    setError(null);

    // Run usage + status checks in parallel
    const [usageResult, statusResult] = await Promise.allSettled([
      api.getCreditsUsage(),
      api.getApiStatus(),
    ]);

    if (usageResult.status === "fulfilled") {
      setData(usageResult.value);
    } else {
      setError(usageResult.reason instanceof Error ? usageResult.reason.message : "Failed to load usage data");
    }

    if (statusResult.status === "fulfilled") {
      setStatusData(statusResult.value);
    }
    // status errors are non-fatal - page still works without live status

    setLoading(false);
    setStatusLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleReset = async () => {
    if (!confirm("Reset all usage counters to zero? This cannot be undone.")) return;
    setResetting(true);
    try {
      await api.resetCreditsUsage();
      await load();
    } finally {
      setResetting(false);
    }
  };

  const getStatus = (service: keyof ApiStatus): StatusValue => {
    if (statusLoading) return "loading";
    if (!statusData) return "unknown";
    return statusData[service].status as StatusValue;
  };

  const getDetail = (service: keyof ApiStatus): string => {
    if (!statusData) return "";
    return statusData[service].detail || "";
  };

  if (loading) return (
    <div className="p-4 sm:p-8 flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  if (error) return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
    </div>
  );

  if (!data) return null;

  const s = data.services;
  const maxCost = Math.max(
    s.anthropic.estimated_cost_usd,
    s.openai.estimated_cost_usd,
    s.tavily.estimated_cost_usd,
    s.nano_banana.estimated_cost_usd,
    0.01,
  );

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Credits & Usage</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live connection status + estimated costs. Last updated: {fmtDate(data.last_updated)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} className="gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetting}
            className="gap-2 text-sm text-red-500 hover:text-red-600 border-red-200 hover:border-red-300"
          >
            {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset
          </Button>
        </div>
      </div>

      {/* Total cost banner */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <p className="text-sm font-medium opacity-80">Total Estimated Spend</p>
        <p className="text-4xl font-bold mt-1">{fmtCost(data.total_estimated_cost_usd)}</p>
        <p className="text-xs opacity-60 mt-2">
          Prices are estimates based on public pricing. Check each provider&apos;s dashboard for exact billing.
        </p>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Anthropic */}
        {(() => {
          const svc = s.anthropic;
          const meta = SERVICE_META.anthropic;
          return (
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-900 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={getStatus("anthropic")} detail={getDetail("anthropic")} />
                    <a href={svc.dashboard_url} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-gray-600 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </CardTitle>
                <p className="text-xs text-gray-400">{meta.note}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold text-gray-900">{fmtCost(svc.estimated_cost_usd)}</span>
                  <span className="text-xs text-gray-400">{svc.total_calls} calls</span>
                </div>
                <UsageBar value={svc.estimated_cost_usd} max={maxCost} color={meta.color} />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">Input tokens</p>
                    <p className="text-sm font-semibold text-gray-800">{fmt(svc.total_input_tokens)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-400">Output tokens</p>
                    <p className="text-sm font-semibold text-gray-800">{fmt(svc.total_output_tokens)}</p>
                  </div>
                </div>
                {Object.keys(svc.by_type).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">By call type</p>
                    {Object.entries(svc.by_type).map(([type, t]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 capitalize">{type.replace(/_/g, " ")}</span>
                        <span className="text-gray-400">{t.calls} calls · {fmt(t.input_tokens + t.output_tokens)} tokens</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
                  $3.00 / 1M input · $15.00 / 1M output
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* OpenAI */}
        {(() => {
          const svc = s.openai;
          const meta = SERVICE_META.openai;
          return (
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-900 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={getStatus("openai")} detail={getDetail("openai")} />
                    <a href={svc.dashboard_url} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-gray-600 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </CardTitle>
                <p className="text-xs text-gray-400">{meta.note}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold text-gray-900">{fmtCost(svc.estimated_cost_usd)}</span>
                  <span className="text-xs text-gray-400">{svc.total_calls} calls</span>
                </div>
                <UsageBar value={svc.estimated_cost_usd} max={maxCost} color={meta.color} />
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Total tokens embedded</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(svc.total_tokens)}</p>
                </div>
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
                  $0.02 / 1M tokens (text-embedding-3-small)
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Tavily */}
        {(() => {
          const svc = s.tavily;
          const meta = SERVICE_META.tavily;
          return (
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-900 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={getStatus("tavily")} detail={getDetail("tavily")} />
                    <a href={svc.dashboard_url} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-gray-600 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </CardTitle>
                <p className="text-xs text-gray-400">{meta.note}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold text-gray-900">{fmtCost(svc.estimated_cost_usd)}</span>
                  <span className="text-xs text-gray-400">{svc.total_searches} searches</span>
                </div>
                <UsageBar value={svc.estimated_cost_usd} max={maxCost} color={meta.color} />
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Total searches made</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(svc.total_searches)}</p>
                </div>
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
                  Free tier: 1,000 searches / month
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Nano Banana */}
        {(() => {
          const svc = s.nano_banana;
          const meta = SERVICE_META.nano_banana;
          const successRate = svc.total_attempted > 0
            ? Math.round((svc.total_succeeded / svc.total_attempted) * 100)
            : 100;
          return (
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-900 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${meta.color}`} />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={getStatus("nano_banana")} detail={getDetail("nano_banana")} />
                    <a href={svc.dashboard_url} target="_blank" rel="noopener noreferrer"
                       className="text-gray-400 hover:text-gray-600 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </CardTitle>
                <p className="text-xs text-gray-400">{meta.note}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-end">
                  <span className="text-2xl font-bold text-gray-900">{fmtCost(svc.estimated_cost_usd)}</span>
                  <span className="text-xs text-gray-400">{svc.total_succeeded} images</span>
                </div>
                <UsageBar value={svc.estimated_cost_usd} max={maxCost} color={meta.color} />
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-gray-50 rounded-lg px-2 py-2 text-center">
                    <p className="text-xs text-gray-400">Attempted</p>
                    <p className="text-sm font-semibold text-gray-800">{svc.total_attempted}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg px-2 py-2 text-center">
                    <p className="text-xs text-green-500">Succeeded</p>
                    <p className="text-sm font-semibold text-green-700">{svc.total_succeeded}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg px-2 py-2 text-center">
                    <p className="text-xs text-red-400">Failed</p>
                    <p className="text-sm font-semibold text-red-600">{svc.total_failed}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-2">
                  ~$0.04 / image · Success rate: {successRate}%
                </p>
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {/* Footer note */}
      <p className="text-xs text-center text-gray-400 pb-4">
        Estimates only — verify actual charges on each provider&apos;s billing dashboard.
      </p>
    </div>
  );
}
