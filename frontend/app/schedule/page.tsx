"use client";

import { useEffect, useState } from "react";
import { api, ScheduleSettings, NextRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    Promise.all([api.getScheduleSettings(), api.getNextRuns()])
      .then(([s, runs]) => {
        setSettings(s);
        setNextRuns(runs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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
    setSaved(false);
  };

  const toggleDay = (day: string) => {
    setSettings((s) => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day],
    }));
    setSaved(false);
  };

  const applyPreset = (days: string[]) => {
    setSettings((s) => ({ ...s, days }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.saveScheduleSettings(settings);
      const runs = await api.getNextRuns();
      setNextRuns(runs);
      setSaved(true);
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
    setSaved(false);
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
              onChange={(e) => { setSettings((s) => ({ ...s, time: e.target.value })); setSaved(false); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <p className="text-xs text-gray-400 mt-1">Post is generated then sent to Notion for review</p>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e) => { setSettings((s) => ({ ...s, timezone: e.target.value })); setSaved(false); }}
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
            <button
              onClick={toggleNotify}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                settings.notify_enabled
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {settings.notify_enabled ? "On" : "Off"}
            </button>
          </div>
        </CardHeader>
        {settings.notify_enabled && (
          <CardContent>
            <label className="text-xs text-gray-500 mb-1 block">Notification email</label>
            <input
              type="email"
              value={settings.notify_email ?? ""}
              onChange={(e) => { setSettings((s) => ({ ...s, notify_email: e.target.value })); setSaved(false); }}
              placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              After each scheduled generation you&apos;ll get an email listing the new drafts, with a link to review them.
              With the default sender, delivery is limited to your own Resend account email (verify a domain in Resend to send elsewhere).
            </p>
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
                  <div key={r.day} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
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
              ({settings.timezone}) and submitted to Notion + web app for review.
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
