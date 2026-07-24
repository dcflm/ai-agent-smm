"use client";

import { useEffect, useState, useRef } from "react";
import { api, ScheduleSettings, NextRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Clock, Calendar, CheckCircle, Play, Pause, Zap, Mail } from "lucide-react";

const DAYS = [
  { key: "monday",    label: "Mon" },
  { key: "tuesday",   label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday",  label: "Thu" },
  { key: "friday",    label: "Fri" },
  { key: "saturday",  label: "Sat" },
  { key: "sunday",    label: "Sun" },
];

const TIMEZONES = [
  "Europe/Zurich",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "UTC",
];

const PRESETS = [
  { label: "Mon / Wed / Fri", days: ["monday", "wednesday", "friday"] },
  { label: "Tue / Thu",       days: ["tuesday", "thursday"] },
  { label: "Every weekday",   days: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
  { label: "Daily",           days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
];

function formatNextRun(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-DE", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SchedulePage() {
  const [settings, setSettings] = useState<ScheduleSettings>({
    enabled: false,
    days: ["monday", "wednesday", "friday"],
    time: "08:00",
    timezone: "Europe/Zurich",
    notify_enabled: false,
    notify_email: "",
  });
  const [nextRuns, setNextRuns] = useState<NextRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastEmail, setLastEmail] = useState<{ at: string; event: string; to: string; detail: string } | null>(null);
  // Supabase Storage reads can lag writes; don't let a refetch right after
  // saving clobber the fresh local state with stale server data.
  const lastSaveAt = useRef(0);

  useEffect(() => {
    Promise.all([api.getScheduleSettings(), api.getNextRuns()])
      .then(([s, runs]) => {
        setSettings(s);
        setNextRuns(runs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    api.getEmailLog(1).then((l) => setLastEmail(l[0] ?? null)).catch(() => setLastEmail(null));
  }, []);

  // Stale-tab protection: when the user returns to this tab, re-sync from the
  // server (unless they have unsaved edits) so an old tab can never silently
  // write outdated settings back on Save.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      setDirty((isDirty) => {
        if (!isDirty && Date.now() - lastSaveAt.current >= 15000) {
          api.getScheduleSettings().then(setSettings).catch(() => {});
          api.getEmailLog(1).then((l) => setLastEmail(l[0] ?? null)).catch(() => {});
        }
        return isDirty;
      });
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const handleTestEmail = async () => {
    const email = (settings.notify_email || "").trim();
    if (!email) { setTestResult({ ok: false, detail: "Enter an email address first." }); return; }
    setTestingEmail(true);
    setTestResult(null);
    try {
      const r = await api.sendTestEmail(email);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, detail: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTestingEmail(false);
    }
  };

  const toggleNotify = () => {
    // Flip the on/off flag ONLY — never touch the saved address, so it
    // persists across turning notifications off and back on.
    setSettings((s) => ({ ...s, notify_enabled: !s.notify_enabled }));
    setSaved(false); setDirty(true);
  };

  const toggleDay = (day: string) => {
    setSettings((s) => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day],
    }));
    setSaved(false); setDirty(true);
  };

  const applyPreset = (days: string[]) => {
    setSettings((s) => ({ ...s, days }));
    setSaved(false); setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved_ = await api.saveScheduleSettings(settings);
      lastSaveAt.current = Date.now();
      // Sync local state to the server's canonical response
      setSettings({
        enabled: saved_.enabled,
        days: saved_.days,
        time: saved_.time,
        timezone: saved_.timezone,
        notify_enabled: saved_.notify_enabled,
        notify_email: saved_.notify_email,
        extra_dates: saved_.extra_dates,
        skip_dates: saved_.skip_dates,
      });
      const runs = await api.getNextRuns();
      setNextRuns(runs);
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerNow = async () => {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      await api.triggerScheduleNow();
      setTriggerMsg("Pipeline triggered! A post will appear in 1-3 minutes.");
      setTimeout(() => setTriggerMsg(null), 6000);
    } catch (e) {
      setTriggerMsg(e instanceof Error ? e.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  };

  const toggleEnabled = () => {
    setSettings((s) => ({ ...s, enabled: !s.enabled }));
    setSaved(false); setDirty(true);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Post Schedule</h1>
          <p className="text-sm text-gray-500 mt-1">
            The AI agent will automatically generate and submit posts for review on your chosen days.
          </p>
        </div>
        <button
          onClick={toggleEnabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            settings.enabled
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {settings.enabled
            ? <><Play className="w-4 h-4" /> Active</>
            : <><Pause className="w-4 h-4" /> Paused</>
          }
        </button>
      </div>

      {/* Day selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-600" />
            Publishing Days
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Presets */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const active =
                  p.days.length === settings.days.length &&
                  p.days.every((d) => settings.days.includes(d));
                return (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.days)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-600"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day toggles */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Or pick manually</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map(({ key, label }) => {
                const selected = settings.days.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleDay(key)}
                    className={`py-3 rounded-xl text-xs font-semibold transition-all ${
                      selected
                        ? "bg-green-600 text-white shadow-sm"
                        : "bg-gray-50 text-gray-400 hover:bg-gray-100 border border-gray-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time + timezone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-green-600" />
            Time &amp; Timezone
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Generation time</label>
            <input
              type="time"
              value={settings.time}
              onChange={(e) => { setSettings((s) => ({ ...s, time: e.target.value })); setSaved(false); setDirty(true); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">Post is generated and waits for your review in the app</p>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e) => { setSettings((s) => ({ ...s, timezone: e.target.value })); setSaved(false); setDirty(true); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Email review notifications */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Mail className="w-4 h-4 text-green-600" />
              Email me for review
            </CardTitle>
            <Switch
              checked={!!settings.notify_enabled}
              onCheckedChange={toggleNotify}
              ariaLabel="Email notifications"
            />
          </div>
          <p className={`text-xs mt-2 ${settings.notify_enabled ? "text-green-700" : "text-gray-500"}`}>
            {settings.notify_enabled ? (
              <>
                <span className="font-semibold">Email notifications are on</span>
                {" — you'll get an email after each generated post."}
              </>
            ) : (
              <>
                <span className="font-semibold">Email notifications are off</span>
                {" — no emails will be sent."}
              </>
            )}
          </p>
        </CardHeader>
        {!settings.notify_enabled && (settings.notify_email || "").trim() && (
          <CardContent className="pt-0">
            <p className="text-xs text-gray-400">
              Saved address: <span className="font-medium text-gray-500">{settings.notify_email}</span> — flip the switch to resume notifications.
            </p>
          </CardContent>
        )}
        {settings.notify_enabled && (
          <CardContent>
            <label className="text-xs text-gray-500 mb-1 block">Notification email</label>
            <input
              type="email"
              value={settings.notify_email ?? ""}
              onChange={(e) => { setSettings((s) => ({ ...s, notify_email: e.target.value })); setSaved(false); setDirty(true); }}
              placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              We&apos;ll email you here right after each new post is generated — nothing else.
            </p>
            {lastEmail && (() => {
              const delivered = lastEmail.event === "delivery" && lastEmail.detail.includes("delivered");
              const undelivered = lastEmail.event === "delivery" && !delivered;
              const good = delivered || lastEmail.event === "sent";
              let text: string;
              // Never echo the stored `detail` verbatim — older log rows may
              // contain raw provider text. Use fixed, user-friendly phrasing.
              if (delivered) text = `✓ delivered to ${lastEmail.to}`;
              else if (undelivered) text = `⚠ couldn't be delivered to ${lastEmail.to} — check the address`;
              else if (lastEmail.event === "sent") text = `✓ sent to ${lastEmail.to}`;
              else if (lastEmail.event === "failed") text = `✗ couldn't be sent${lastEmail.to ? ` to ${lastEmail.to}` : ""} — try again`;
              else text = "no email sent yet";
              return (
                <p className={`text-xs mt-2 ${good ? "text-gray-400" : "text-amber-600"}`}>
                  Last notification: {text}{" "}
                  ({new Date(lastEmail.at).toLocaleString("en-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})
                </p>
              );
            })()}
            <div className="mt-3 flex items-center gap-3">
              <Button
                onClick={handleTestEmail}
                disabled={testingEmail || !(settings.notify_email || "").trim()}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                {testingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Send test email
              </Button>
              {testResult && (
                <span className={`text-xs font-medium ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                  {testResult.ok ? "✓ Sent — check your inbox" : `✗ ${testResult.detail}`}
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Upcoming runs preview */}
      {settings.days.length > 0 && settings.enabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-600" />
              Upcoming Generations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextRuns.length === 0 ? (
              <p className="text-xs text-gray-400">Save settings to see upcoming runs.</p>
            ) : (
              <div className="space-y-2">
                {nextRuns.map((r) => (
                  <div key={r.next_run ?? r.day} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm font-medium text-gray-700">{r.day}</span>
                    <span className="text-xs text-gray-400">{formatNextRun(r.next_run)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 flex items-start gap-3">
        <Calendar className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        <div>
          {settings.days.length === 0 ? (
            <span>No days selected. Pick at least one day to enable automatic posting.</span>
          ) : (
            <>
              <span className="font-medium">
                {settings.enabled ? "Active:" : "When enabled:"}
              </span>{" "}
              Posts will be generated every{" "}
              <span className="font-medium text-green-700">
                {settings.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}
              </span>{" "}
              at <span className="font-medium text-green-700">{settings.time}</span>{" "}
              ({settings.timezone}) and will wait for your review on the Content page.
            </>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={handleSave}
          disabled={saving || settings.days.length === 0}
          className="bg-green-600 hover:bg-green-700 text-white gap-2 px-6"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : saved ? (
            <><CheckCircle className="w-4 h-4" /> Saved!</>
          ) : (
            "Save Schedule"
          )}
        </Button>
        <Button
          onClick={handleTriggerNow}
          disabled={triggering}
          variant="outline"
          className="gap-2 border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600"
        >
          {triggering ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Triggering…</>
          ) : (
            <><Zap className="w-4 h-4" /> Trigger Now</>
          )}
        </Button>
        {settings.days.length === 0 && (
          <span className="text-xs text-red-400">Select at least one day</span>
        )}
        {dirty && !saving && settings.days.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            Unsaved changes
          </span>
        )}
      </div>
      {saveError && (
        <p className="text-sm text-red-500 mt-1">{saveError}</p>
      )}
      {triggerMsg && (
        <p className={`text-sm mt-1 ${triggerMsg.includes("failed") || triggerMsg.includes("Failed") ? "text-red-500" : "text-green-600"}`}>
          {triggerMsg}
        </p>
      )}
    </div>
  );
}
