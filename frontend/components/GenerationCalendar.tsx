"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, Post, ScheduleSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// getDay(): 0 = Sunday … 6 = Saturday → schedule day keys
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const APPROVED_STATUSES = ["approved", "published", "scheduled"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-DE", { day: "numeric", month: "short" });
}

export default function GenerationCalendar({ posts }: { posts: Post[] }) {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Supabase Storage reads can lag writes by a few seconds; a refetch right
  // after a save would clobber the fresh local state with stale server data.
  const lastSaveAt = useRef(0);

  const loadSettings = useCallback(() => {
    if (Date.now() - lastSaveAt.current < 15000) return;
    api.getScheduleSettings().then((s) => {
      if (Date.now() - lastSaveAt.current >= 15000) setSettings(s);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Stay in sync when the schedule is changed elsewhere (Schedule page,
  // another tab): re-fetch whenever this tab regains focus/visibility.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") loadSettings();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadSettings]);

  // Posts grouped by local calendar day
  const postsByDay = new Map<string, Post[]>();
  for (const p of posts) {
    if (p.text === "__generating__") continue;
    const key = dateKey(new Date(p.created_at));
    const list = postsByDay.get(key) ?? [];
    list.push(p);
    postsByDay.set(key, list);
  }

  const todayKey = dateKey(new Date());

  const year = month.getFullYear();
  const mon = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  // Monday-first offset: getDay() 0(Sun)…6(Sat) → 6, 0, 1, …
  const firstOffset = (new Date(year, mon, 1).getDay() + 6) % 7;

  const monthLabel = month.toLocaleDateString("en-DE", { month: "long", year: "numeric" });

  const isGenerationDate = (key: string, weekday: string): boolean => {
    if (!settings) return false;
    if ((settings.skip_dates ?? []).includes(key)) return false;
    if ((settings.extra_dates ?? []).includes(key)) return true;
    return settings.days.includes(weekday);
  };

  // Toggle exactly ONE date: weekly day → add skip; skipped → unskip;
  // extra → remove; plain day → add extra.
  const toggleDate = async (key: string, weekday: string) => {
    if (!settings || saving) return;
    const skips = settings.skip_dates ?? [];
    const extras = settings.extra_dates ?? [];
    const isWeekly = settings.days.includes(weekday);
    let next: ScheduleSettings;
    let msg: string;

    if (skips.includes(key)) {
      next = { ...settings, skip_dates: skips.filter((d) => d !== key) };
      msg = `${prettyDate(key)} is a generation day again.`;
    } else if (extras.includes(key)) {
      next = { ...settings, extra_dates: extras.filter((d) => d !== key) };
      msg = `One-off post on ${prettyDate(key)} removed.`;
    } else if (isWeekly) {
      next = { ...settings, skip_dates: [...skips, key] };
      msg = `${prettyDate(key)} skipped — no post that day.`;
    } else {
      next = { ...settings, extra_dates: [...extras, key] };
      msg = `One-off post scheduled for ${prettyDate(key)}.`;
    }

    setSettings(next); // optimistic — exactly this one square changes
    setSaving(true);
    setNote(null);
    lastSaveAt.current = Date.now();
    try {
      const saved = await api.saveScheduleSettings(next);
      lastSaveAt.current = Date.now();
      setSettings({ ...next, extra_dates: saved.extra_dates, skip_dates: saved.skip_dates });
      setNote(msg + (settings.enabled ? "" : " (Schedule is paused — activate it on the Schedule page.)"));
    } catch (e) {
      setSettings(settings); // revert
      setNote(e instanceof Error ? e.message : "Could not update the schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-green-600" />
          Generation Calendar
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </CardTitle>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth(new Date(year, mon - 1, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 w-32 text-center">{monthLabel}</span>
          <button
            onClick={() => setMonth(new Date(year, mon + 1, 1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Weekday headers (Monday first) */}
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-gray-400">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: firstOffset }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const date = new Date(year, mon, dayNum);
            const key = dateKey(date);
            const isToday = key === todayKey;
            const isPast = key < todayKey;
            const weekday = WEEKDAY_KEYS[date.getDay()];
            const genDay = isGenerationDate(key, weekday);
            const isExtra = (settings?.extra_dates ?? []).includes(key);
            const dayPosts = postsByDay.get(key) ?? [];
            const hasApproved = dayPosts.some((p) => APPROVED_STATUSES.includes(p.status));
            const needsAttention = isPast && dayPosts.length > 0 && !hasApproved;

            let cls = "bg-white border-gray-100 text-gray-400"; // plain past day
            let title = "";
            if (needsAttention) {
              cls = "bg-red-100 border-red-300 text-red-700 font-semibold hover:bg-red-200 cursor-pointer";
              title = `${dayPosts.length} post${dayPosts.length !== 1 ? "s" : ""} not approved — click to review`;
            } else if (isPast && dayPosts.length > 0) {
              cls = "bg-green-50 border-green-200 text-green-700";
              title = "Post approved ✓";
            } else if (!isPast && genDay) {
              cls = `${settings?.enabled ? "bg-green-600 border-green-600 text-white font-semibold" : "bg-green-100 border-green-300 text-green-700"} hover:opacity-80 cursor-pointer`;
              title = isExtra
                ? `One-off post on ${prettyDate(key)} — click to remove it`
                : `Generation day — click to skip just ${prettyDate(key)}`;
            } else if (!isPast) {
              cls = "bg-gray-50 border-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600 cursor-pointer";
              title = `Click to schedule a one-off post on ${prettyDate(key)}`;
            }

            const cell = (
              <div
                key={key}
                title={title}
                onClick={() => { if (!isPast && !needsAttention) toggleDate(key, weekday); }}
                className={`aspect-square rounded-lg border flex items-center justify-center text-xs transition-colors select-none ${cls} ${
                  isToday ? "ring-2 ring-green-600 ring-offset-1" : ""
                }`}
              >
                {dayNum}
              </div>
            );

            return needsAttention ? (
              <Link key={key} href="/content" title={title}>{cell}</Link>
            ) : (
              cell
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${settings?.enabled ? "bg-green-600" : "bg-green-100 border border-green-300"}`} />
            Generation day{settings && !settings.enabled ? " (schedule paused)" : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-50 border border-green-200" />
            Posted &amp; approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
            Not approved — click to review
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded ring-2 ring-green-600 ring-offset-1" />
            Today
          </span>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Clicking a future day changes <span className="font-medium">only that date</span> — skip a scheduled day or
          add a one-off post. The weekly pattern itself is set on the Schedule page.
        </p>
        {note && <p className="text-[11px] text-green-700 mt-1 font-medium">{note}</p>}
      </CardContent>
    </Card>
  );
}
