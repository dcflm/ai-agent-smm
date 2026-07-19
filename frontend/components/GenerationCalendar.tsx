"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, Post, ScheduleSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, X,
  SkipForward, RotateCcw, Sparkles, Zap, Pause,
} from "lucide-react";

// getDay(): 0 = Sunday … 6 = Saturday → schedule day keys
const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const APPROVED_STATUSES = ["approved", "published", "scheduled"];

const STATUS_CHIP: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-700",
  changes_requested: "bg-orange-100 text-orange-700",
  approved: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending_review: "Pending Review", changes_requested: "Changes Requested",
  approved: "Approved", scheduled: "Scheduled", published: "Published", rejected: "Rejected",
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-DE", { weekday: "long", day: "numeric", month: "long" });
}

function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-DE", { day: "numeric", month: "short" });
}

export default function GenerationCalendar() {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  // Supabase Storage reads can lag writes by a few seconds; a refetch right
  // after a save would clobber the fresh local state with stale server data.
  const lastSaveAt = useRef(0);
  // Latest-wins save chain: rapid clicks never get dropped — the newest
  // settings object always gets persisted once the in-flight save finishes.
  const savingRef = useRef(false);
  const pendingRef = useRef<ScheduleSettings | null>(null);

  const loadSettings = useCallback(() => {
    if (Date.now() - lastSaveAt.current < 15000) return;
    api.getScheduleSettings().then((s) => {
      if (Date.now() - lastSaveAt.current >= 15000) setSettings(s);
    }).catch(() => {});
  }, []);

  const loadPosts = useCallback(() => {
    api.getPosts(undefined, 200)
      .then((ps) => setPosts(ps.filter((p) => p.text !== "__generating__")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
    loadPosts();
  }, [loadSettings, loadPosts]);

  // Stay in sync when the schedule or post statuses change elsewhere.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      loadSettings();
      loadPosts();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadSettings, loadPosts]);

  const runSaveChain = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      while (pendingRef.current) {
        const toSave = pendingRef.current;
        pendingRef.current = null;
        try {
          const saved = await api.saveScheduleSettings(toSave);
          lastSaveAt.current = Date.now();
          setSettings((cur) =>
            cur ? { ...cur, extra_dates: saved.extra_dates, skip_dates: saved.skip_dates } : cur
          );
        } catch (e) {
          setNote(e instanceof Error ? e.message : "Could not save — please try again.");
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const applyOverride = (next: ScheduleSettings, msg: string) => {
    lastSaveAt.current = Date.now();
    setSettings(next);
    setNote(msg + (next.enabled ? "" : " (Schedule is paused — nothing generates until it's activated.)"));
    pendingRef.current = next;
    void runSaveChain();
  };

  const skipDay = (key: string) => {
    if (!settings) return;
    applyOverride(
      { ...settings, skip_dates: [...(settings.skip_dates ?? []), key] },
      `${shortDate(key)} skipped — no post that day.`
    );
  };
  const restoreDay = (key: string) => {
    if (!settings) return;
    applyOverride(
      { ...settings, skip_dates: (settings.skip_dates ?? []).filter((d) => d !== key) },
      `${shortDate(key)} is a generation day again.`
    );
  };
  const addOneOff = (key: string) => {
    if (!settings) return;
    applyOverride(
      { ...settings, extra_dates: [...(settings.extra_dates ?? []), key] },
      `One-off post scheduled for ${shortDate(key)}.`
    );
  };
  const removeOneOff = (key: string) => {
    if (!settings) return;
    applyOverride(
      { ...settings, extra_dates: (settings.extra_dates ?? []).filter((d) => d !== key) },
      `One-off post on ${shortDate(key)} removed.`
    );
  };

  const generateNow = async () => {
    setTriggering(true);
    try {
      await api.triggerScheduleNow();
      setNote("Generation started — the post will appear on the Content page in ~1–2 minutes.");
    } catch {
      setNote("Could not start generation — please try again.");
    } finally {
      setTriggering(false);
    }
  };

  // ── Derived day info ─────────────────────────────────────────────────────
  const postsByDay = new Map<string, Post[]>();
  for (const p of posts) {
    const key = dateKey(new Date(p.created_at));
    const list = postsByDay.get(key) ?? [];
    list.push(p);
    postsByDay.set(key, list);
  }

  const todayKey = dateKey(new Date());

  const dayInfo = (key: string, weekdayIdx: number) => {
    const weekday = WEEKDAY_KEYS[weekdayIdx];
    const isSkipped = (settings?.skip_dates ?? []).includes(key);
    const isExtra = (settings?.extra_dates ?? []).includes(key);
    const isWeekly = !!settings?.days.includes(weekday);
    const genDay = !isSkipped && (isExtra || isWeekly);
    const dayPosts = postsByDay.get(key) ?? [];
    const hasApproved = dayPosts.some((p) => APPROVED_STATUSES.includes(p.status));
    return {
      key, weekday, isSkipped, isExtra, isWeekly, genDay, dayPosts, hasApproved,
      isToday: key === todayKey,
      isPast: key < todayKey,
      needsAttention: key < todayKey && dayPosts.length > 0 && !hasApproved,
    };
  };

  const timePassedToday = (() => {
    if (!settings?.time) return false;
    const [h, m] = settings.time.split(":").map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  })();

  const year = month.getFullYear();
  const mon = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const firstOffset = (new Date(year, mon, 1).getDay() + 6) % 7; // Monday-first
  const monthLabel = month.toLocaleDateString("en-DE", { month: "long", year: "numeric" });

  const selected = selectedKey
    ? dayInfo(selectedKey, new Date(
        Number(selectedKey.slice(0, 4)), Number(selectedKey.slice(5, 7)) - 1, Number(selectedKey.slice(8, 10))
      ).getDay())
    : null;

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
        {/* Paused banner */}
        {settings && !settings.enabled && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
            <Pause className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">
              The schedule is <span className="font-semibold">paused</span> — no posts will be generated.{" "}
              <Link href="/schedule" className="underline font-medium">Activate it on the Schedule page</Link>.
            </p>
          </div>
        )}

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
            const d = dayInfo(key, date.getDay());
            const isSelected = key === selectedKey;

            let cls = "bg-white border-gray-100 text-gray-400"; // plain past day
            if (d.needsAttention) {
              cls = "bg-red-100 border-red-300 text-red-700 font-semibold hover:bg-red-200";
            } else if (d.isPast && d.dayPosts.length > 0) {
              cls = "bg-green-50 border-green-200 text-green-700 hover:bg-green-100";
            } else if (d.isSkipped && !d.isPast) {
              cls = "bg-white border-green-300 text-green-600/60 line-through hover:bg-green-50";
            } else if (!d.isPast && d.genDay) {
              cls = `${settings?.enabled ? "bg-green-600 border-green-600 text-white font-semibold" : "bg-green-100 border-green-300 text-green-700"} hover:opacity-85`;
            } else if (!d.isPast) {
              cls = "bg-gray-50 border-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600";
            } else {
              cls += " hover:bg-gray-50";
            }

            return (
              <button
                key={key}
                onClick={() => setSelectedKey(isSelected ? null : key)}
                className={`relative aspect-square rounded-lg border flex items-center justify-center text-xs transition-all select-none cursor-pointer ${cls} ${
                  isSelected ? "ring-2 ring-blue-500 ring-offset-1" : d.isToday ? "ring-2 ring-green-600 ring-offset-1" : ""
                }`}
              >
                {dayNum}
                {d.isExtra && !d.isPast && (
                  <span className="absolute top-0 right-0.5 text-[9px] leading-none">✦</span>
                )}
                {d.dayPosts.length > 0 && (
                  <span className="absolute bottom-0.5 flex gap-0.5">
                    {Array.from({ length: Math.min(d.dayPosts.length, 3) }).map((_, j) => (
                      <span key={j} className={`w-1 h-1 rounded-full ${d.needsAttention ? "bg-red-400" : "bg-green-400"}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Day details panel ── */}
        {selected && (
          <div className="mt-4 border border-blue-100 bg-blue-50/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-gray-800">{prettyDate(selected.key)}</p>
              <button
                onClick={() => setSelectedKey(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition-colors"
                aria-label="Close day details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Past day content */}
            {selected.isPast ? (
              selected.dayPosts.length === 0 ? (
                <p className="text-xs text-gray-500">No posts were generated on this day.</p>
              ) : (
                <div className="space-y-1.5">
                  {selected.needsAttention && (
                    <p className="text-xs font-medium text-red-600 mb-1">
                      {selected.dayPosts.filter((p) => !APPROVED_STATUSES.includes(p.status)).length} post(s) waiting for a decision:
                    </p>
                  )}
                  {selected.dayPosts.map((p) => (
                    <Link key={p.id} href="/content"
                      className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2 hover:border-green-300 transition-colors">
                      <span className="text-xs text-gray-700 truncate">
                        {(p.news_title || p.text).slice(0, 60)}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CHIP[p.status] ?? ""}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )
            ) : (
              /* Today / future day content */
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  {selected.isSkipped
                    ? "Skipped — no post will be generated on this day."
                    : selected.genDay
                    ? selected.isExtra
                      ? `One-off post scheduled at ${settings?.time ?? ""}.`
                      : `Post scheduled at ${settings?.time ?? ""} (weekly ${selected.weekday} slot).`
                    : selected.isToday && timePassedToday
                    ? `Today's generation time (${settings?.time}) has already passed.`
                    : "No post scheduled for this day."}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.isSkipped ? (
                    <button onClick={() => restoreDay(selected.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Restore this day
                    </button>
                  ) : selected.isExtra ? (
                    <button onClick={() => removeOneOff(selected.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                      <X className="w-3.5 h-3.5" /> Remove one-off post
                    </button>
                  ) : selected.genDay ? (
                    <button onClick={() => skipDay(selected.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                      <SkipForward className="w-3.5 h-3.5" /> Skip this day
                    </button>
                  ) : !(selected.isToday && timePassedToday) ? (
                    <button onClick={() => addOneOff(selected.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">
                      <Sparkles className="w-3.5 h-3.5" /> Add one-off post
                    </button>
                  ) : null}
                  {selected.isToday && (
                    <button onClick={generateNow} disabled={triggering}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Generate now
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded ${settings?.enabled ? "bg-green-600" : "bg-green-100 border border-green-300"}`} />
            Generation day
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-600 text-white text-[7px] leading-3 text-center">✦</span>
            One-off
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white border border-green-300 text-green-600/60 text-[8px] leading-3 text-center line-through">1</span>
            Skipped
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-50 border border-green-200" />
            Approved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
            Needs review
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded ring-2 ring-green-600 ring-offset-1" />
            Today
          </span>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Click any day to see details and actions — skip a scheduled day, add a one-off post, or review that
          day&apos;s posts. The weekly pattern is set on the Schedule page.
        </p>
        {note && <p className="text-[11px] text-green-700 mt-1 font-medium">{note}</p>}
      </CardContent>
    </Card>
  );
}
