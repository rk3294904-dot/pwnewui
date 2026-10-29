"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { firebaseAuth, getEnrolledBatchIds } from "@/lib/firebase";
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassSkeleton,
  SafeImage,
  EmptyState,
} from "./glass";
import {
  Radio,
  Play,
  Clock,
  CalendarPlus,
  Loader2,
  BookOpen,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Status = "live" | "upcoming" | "ended";
type Filter = "all" | Status;

interface RawLiveClass {
  id: string;
  batchId: string;
  batchName: string;
  batchImage?: string;
  title: string;
  subject: string;
  startTime: string;
  endTime: string;
  startMs: number;
  endMs: number;
  thumbnail: string;
  duration: string;
  videoId: string;
  subjectSlug: string;
}

interface LiveClass extends RawLiveClass {
  status: Status;
}

interface CatalogBatch {
  _id: string;
  name: string;
  previewImage?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const toMs = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

function getStatus(startMs: number, endMs: number, now: number): Status {
  if (Number.isNaN(startMs)) return "upcoming";
  if (now < startMs) return "upcoming";
  if (Number.isNaN(endMs) || now <= endMs) return "live";
  return "ended";
}

function withinToday(startMs: number, endMs: number): boolean {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  if (!Number.isNaN(startMs) && startMs >= start && startMs < end) return true;
  if (!Number.isNaN(endMs) && endMs >= start && endMs < end) return true;
  return false;
}

function fmtClock(ms: number): string {
  if (Number.isNaN(ms)) return "--:--";
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtSpan(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function countdownLabel(startMs: number, now: number): string {
  const diff = startMs - now;
  if (Number.isNaN(diff)) return "Scheduled today";
  if (diff < 60_000) return "Starting now";
  return `Starts in ${fmtSpan(diff)}`;
}

function progressOf(c: LiveClass, now: number): number | null {
  if (c.status !== "live" || Number.isNaN(c.startMs) || Number.isNaN(c.endMs) || c.endMs <= c.startMs) return null;
  return Math.min(100, Math.max(0, ((now - c.startMs) / (c.endMs - c.startMs)) * 100));
}

function calendarUrl(c: LiveClass): string {
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = Number.isNaN(c.startMs) ? Date.now() : c.startMs;
  const end = Number.isNaN(c.endMs) ? start + 60 * 60 * 1000 : c.endMs;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: c.title,
    details: `${c.subject ? c.subject + " · " : ""}${c.batchName}`,
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const STATUS_STYLE: Record<Status, { stripe: string; label: string }> = {
  live: { stripe: "bg-red-500", label: "Live now" },
  upcoming: { stripe: "bg-[#4a9eff]", label: "Upcoming" },
  ended: { stripe: "bg-white/15", label: "Ended" },
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function LiveView() {
  const { navigate } = useApp();
  const [raw, setRaw] = useState<RawLiveClass[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const [filter, setFilter] = useState<Filter>("all");
  const [subject, setSubject] = useState<string>("all");
  const [query, setQuery] = useState("");

  const hasLoaded = useRef(false);

  /* keep statuses and countdowns fresh without refetching */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* quiet background refetch every two minutes */
  useEffect(() => {
    const t = setInterval(() => setAttempt((v) => v + 1), 120_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    if (!hasLoaded.current) setLoading(true);
    setRefreshing(true);
    setFailed(false);

    const user = firebaseAuth.currentUser;

    const loadAll = async () => {
      let enrolledIds: string[] = [];
      if (user) {
        try {
          enrolledIds = await getEnrolledBatchIds(user.uid);
        } catch {
          enrolledIds = [];
        }
      }

      let catalog: CatalogBatch[] = [];
      try {
        const res = await fetch("/api/batches");
        const d = await res.json();
        if (d?.success && Array.isArray(d.batches)) catalog = d.batches as CatalogBatch[];
      } catch {
        catalog = [];
      }

      // Enrolled batches first; new users see the first few catalog batches.
      const targetIds = enrolledIds.length > 0 ? enrolledIds : catalog.slice(0, 6).map((b) => b._id);

      const results = await Promise.all(
        targetIds.map(async (batchId) => {
          const batch = catalog.find((b) => b._id === batchId);
          try {
            const r = await fetch(`/api/batches/${batchId}/today`);
            const d = await r.json();
            const rows: any[] = d?.classes ?? [];
            return rows.map((c): RawLiveClass => ({
              id: c.id ?? "",
              batchId,
              batchName: batch?.name ?? "Batch",
              batchImage: batch?.previewImage,
              title: c.title ?? "Class",
              subject: c.subject ?? "",
              startTime: c.startTime ?? "",
              endTime: c.endTime ?? "",
              startMs: toMs(c.startTime),
              endMs: toMs(c.endTime),
              thumbnail: c.thumbnail ?? "",
              duration: c.duration ?? "",
              videoId: c.videoId ?? "",
              subjectSlug: c.subjectSlug ?? "",
            }));
          } catch {
            return [] as RawLiveClass[];
          }
        })
      );

      if (!alive) return;
      const todays = results.flat().filter((c) => withinToday(c.startMs, c.endMs));
      setRaw(todays);
      hasLoaded.current = true;
      setNow(Date.now());
    };

    loadAll()
      .catch(() => {
        if (alive && !hasLoaded.current) setFailed(true);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [attempt]);

  /* derive statuses from the clock */
  const classes: LiveClass[] = useMemo(
    () => (raw ?? []).map((c) => ({ ...c, status: getStatus(c.startMs, c.endMs, now) })),
    [raw, now]
  );

  const counts = useMemo(
    () => ({
      all: classes.length,
      live: classes.filter((c) => c.status === "live").length,
      upcoming: classes.filter((c) => c.status === "upcoming").length,
      ended: classes.filter((c) => c.status === "ended").length,
    }),
    [classes]
  );

  const subjects = useMemo(
    () => Array.from(new Set(classes.map((c) => c.subject).filter(Boolean))).sort(),
    [classes]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (subject !== "all" && c.subject !== subject) return false;
      if (q && !`${c.title} ${c.subject} ${c.batchName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [classes, filter, subject, query]);

  const byTime = (a: LiveClass, b: LiveClass) =>
    (Number.isNaN(a.startMs) ? 0 : a.startMs) - (Number.isNaN(b.startMs) ? 0 : b.startMs);

  const liveList = useMemo(() => filtered.filter((c) => c.status === "live").sort(byTime), [filtered]);
  const upcomingList = useMemo(() => filtered.filter((c) => c.status === "upcoming").sort(byTime), [filtered]);
  const endedList = useMemo(() => filtered.filter((c) => c.status === "ended").sort((a, b) => byTime(b, a)), [filtered]);

  const isPristine = filter === "all" && subject === "all" && query.trim() === "";
  const spotlight = isPristine ? liveList[0] : undefined;
  const otherLive = spotlight ? liveList.slice(1) : liveList;

  const nextUpId = useMemo(() => {
    const first = classes.filter((c) => c.status === "upcoming").sort(byTime)[0];
    return first ? `${first.batchId}:${first.id}` : "";
  }, [classes]);

  const openClass = useCallback(
    (c: LiveClass) => {
      if (c.id && c.subjectSlug) {
        navigate({
          view: "watch",
          batchId: c.batchId,
          subjectSlug: c.subjectSlug,
          subjectName: c.subject,
          batchName: c.batchName,
          batchImage: c.batchImage,
          contentId: c.id,
          lectureTitle: c.title,
          videoId: c.videoId,
        });
      } else {
        navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName, batchImage: c.batchImage });
      }
    },
    [navigate]
  );

  const clearFilters = () => {
    setFilter("all");
    setSubject("all");
    setQuery("");
  };

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "live", label: "Live", count: counts.live },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
    { key: "ended", label: "Ended", count: counts.ended },
  ];

  return (
    <main className="flex-1 w-full px-4 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl pt-8 sm:pt-12 space-y-6">
        {/* ---------- header ---------- */}
        <div className="sb-fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Today's classes</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={cn(
                  "inline-flex h-2 w-2 rounded-full",
                  counts.live > 0 ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"
                )}
              />
              {loading
                ? "Loading today's schedule..."
                : `${counts.live} live now, ${counts.upcoming} coming up, ${counts.ended} finished`}
            </p>
          </div>
          <GlassButton variant="glass" size="sm" onClick={() => setAttempt((v) => v + 1)} disabled={refreshing}>
            {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Refresh
          </GlassButton>
        </div>

        {/* ---------- states ---------- */}
        {loading ? (
          <div className="space-y-4">
            <GlassSkeleton className="h-56" />
            {Array.from({ length: 3 }).map((_, i) => (
              <GlassSkeleton key={i} className="h-36" />
            ))}
          </div>
        ) : failed ? (
          <>
            <EmptyState
              icon={<Radio size={22} />}
              title="Couldn't load today's classes"
              hint="Check your connection, then refresh."
            />
            <div className="flex justify-center">
              <GlassButton variant="gold" size="sm" onClick={() => setAttempt((v) => v + 1)}>
                <RefreshCw size={14} /> Try again
              </GlassButton>
            </div>
          </>
        ) : classes.length === 0 ? (
          <EmptyState
            icon={<Radio size={22} />}
            title="No classes scheduled today"
            hint="Enroll in a batch to see its daily schedule here."
          />
        ) : (
          <>
            {/* ---------- toolbar ---------- */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div role="tablist" aria-label="Class status" className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={filter === t.key}
                      onClick={() => setFilter(t.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors",
                        filter === t.key
                          ? "bg-white/15 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t.key === "live" && (
                        <span className={cn("h-1.5 w-1.5 rounded-full", t.count > 0 ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40")} />
                      )}
                      {t.label}
                      <span className="text-xs text-muted-foreground">{t.count}</span>
                    </button>
                  ))}
                </div>

                <label className="relative ml-auto w-full sm:w-72">
                  <span className="sr-only">Search classes</span>
                  <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search class, subject or batch"
                    className="h-10 w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-[#4a9eff]/60"
                  />
                  {query && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
              </div>

              {subjects.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by subject">
                  {["all", ...subjects].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSubject(s)}
                      aria-pressed={subject === s}
                      className={cn(
                        "shrink-0 rounded-full border px-3.5 py-1 text-xs font-semibold transition-colors",
                        subject === s
                          ? "border-[#4a9eff]/60 bg-[#4a9eff]/15 text-[#4a9eff]"
                          : "border-white/10 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {s === "all" ? "All subjects" : s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ---------- results ---------- */}
            {filtered.length === 0 ? (
              <>
                <EmptyState
                  icon={<Search size={22} />}
                  title="No classes match these filters"
                  hint="Clear the filters to see everything scheduled today."
                />
                <div className="flex justify-center">
                  <GlassButton variant="glass" size="sm" onClick={clearFilters}>
                    Clear filters
                  </GlassButton>
                </div>
              </>
            ) : (
              <div className="space-y-8">
                {spotlight && <Spotlight c={spotlight} now={now} onOpen={() => openClass(spotlight)} />}

                <Section title={spotlight ? "Also live" : "Live now"} count={otherLive.length} tone="live">
                  {otherLive.map((c) => (
                    <LectureCard key={`${c.batchId}:${c.id}`} c={c} now={now} onOpen={() => openClass(c)} />
                  ))}
                </Section>

                <Section title="Coming up" count={upcomingList.length} tone="upcoming">
                  {upcomingList.map((c) => (
                    <LectureCard
                      key={`${c.batchId}:${c.id}`}
                      c={c}
                      now={now}
                      isNext={`${c.batchId}:${c.id}` === nextUpId}
                      onOpen={() => openClass(c)}
                    />
                  ))}
                </Section>

                <Section title="Finished" count={endedList.length} tone="ended">
                  {endedList.map((c) => (
                    <LectureCard key={`${c.batchId}:${c.id}`} c={c} now={now} onOpen={() => openClass(c)} />
                  ))}
                </Section>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Section wrapper                                                     */
/* ------------------------------------------------------------------ */

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: Status;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={cn("h-4 w-1 rounded-full", STATUS_STYLE[tone].stripe)} />
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <span className="text-sm text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Spotlight: the class that is on air right now                       */
/* ------------------------------------------------------------------ */

function Spotlight({ c, now, onOpen }: { c: LiveClass; now: number; onOpen: () => void }) {
  const pct = progressOf(c, now);
  const elapsed = Number.isNaN(c.startMs) ? null : now - c.startMs;
  const left = Number.isNaN(c.endMs) ? null : c.endMs - now;

  return (
    <GlassCard hover={false} sheen={false} className="overflow-hidden rounded-3xl ring-1 ring-red-500/30">
      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Join ${c.title}`}
          className="group relative block aspect-video w-full overflow-hidden md:aspect-auto md:min-h-[280px]"
        >
          <SafeImage
            src={c.thumbnail}
            alt={c.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="btn-gold flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110">
              <Play size={24} className="ml-1" />
            </span>
          </span>
        </button>

        <div className="flex flex-col justify-between gap-5 p-5 sm:p-7">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {c.subject && <GlassBadge tone="neutral">{c.subject}</GlassBadge>}
              <GlassBadge tone="neutral">
                <BookOpen size={10} /> {c.batchName}
              </GlassBadge>
            </div>
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight line-clamp-3">{c.title}</h2>
            <p className="text-sm text-muted-foreground">
              {fmtClock(c.startMs)} to {fmtClock(c.endMs)}
              {c.duration ? `, ${c.duration}` : ""}
            </p>
          </div>

          <div className="space-y-4">
            {pct !== null ? (
              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-label="Class progress"
                  className="h-2 overflow-hidden rounded-full bg-white/10"
                >
                  <div className="h-full rounded-full bg-red-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{elapsed !== null ? `${fmtSpan(elapsed)} in` : ""}</span>
                  <span>{left !== null ? `${fmtSpan(left)} left` : ""}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {elapsed !== null ? `Started ${fmtSpan(elapsed)} ago` : "On air now"}
              </p>
            )}
            <GlassButton variant="gold" onClick={onOpen} className="w-full justify-center">
              <Radio size={15} /> Join live class
            </GlassButton>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/* Rectangular lecture card                                            */
/* ------------------------------------------------------------------ */

function LectureCard({
  c,
  now,
  isNext,
  onOpen,
}: {
  c: LiveClass;
  now: number;
  isNext?: boolean;
  onOpen: () => void;
}) {
  const isLive = c.status === "live";
  const isEnded = c.status === "ended";
  const pct = progressOf(c, now);

  const statusLine = isLive
    ? pct !== null
      ? `${fmtSpan(c.endMs - now)} left`
      : "On air now"
    : isEnded
    ? "Recording may be available"
    : countdownLabel(c.startMs, now);

  return (
    <GlassCard hover={false} sheen={false} className={cn("overflow-hidden rounded-2xl", isEnded && "opacity-80")}>
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        {/* status stripe */}
        <span aria-hidden className={cn("h-1 w-full sm:h-auto sm:w-1.5 sm:shrink-0", STATUS_STYLE[c.status].stripe)} />

        {/* thumbnail + details (one clickable region) */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${c.title}`}
          className="group flex min-w-0 flex-1 cursor-pointer flex-col gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4a9eff]/60 sm:flex-row sm:items-center sm:p-5"
        >
          <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-white/10 sm:w-52">
            <SafeImage
              src={c.thumbnail}
              alt=""
              className={cn(
                "h-full w-full object-cover transition-transform duration-500 group-hover:scale-105",
                isEnded && "grayscale-[40%]"
              )}
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="btn-gold flex h-10 w-10 items-center justify-center rounded-full opacity-95 transition-transform group-hover:scale-110">
                {isEnded ? <CheckCircle2 size={16} /> : <Play size={15} className="ml-0.5" />}
              </span>
            </span>
            {c.duration && (
              <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {c.duration}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {isLive ? (
                <GlassBadge tone="red">
                  <Radio size={10} /> Live now
                </GlassBadge>
              ) : isEnded ? (
                <GlassBadge tone="neutral">Ended</GlassBadge>
              ) : (
                <GlassBadge tone="gold">
                  <Clock size={10} /> {isNext ? "Next up" : "Upcoming"}
                </GlassBadge>
              )}
              {c.subject && <GlassBadge tone="neutral">{c.subject}</GlassBadge>}
            </div>

            <h3 className="line-clamp-2 text-base font-bold leading-snug">{c.title}</h3>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BookOpen size={12} className="shrink-0" />
              <span className="truncate">{c.batchName}</span>
            </p>

            {pct !== null && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
                aria-label="Class progress"
                className="h-1.5 overflow-hidden rounded-full bg-white/10"
              >
                <div className="h-full rounded-full bg-red-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </button>

        {/* time + actions panel */}
        <div className="flex items-center justify-between gap-4 border-t border-white/10 px-4 py-3 sm:w-56 sm:shrink-0 sm:flex-col sm:items-stretch sm:justify-center sm:border-l sm:border-t-0 sm:p-5">
          <div className="sm:text-center">
            <p className="text-xl font-extrabold leading-none tabular-nums">{fmtClock(c.startMs)}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {Number.isNaN(c.endMs) ? "End time not set" : `to ${fmtClock(c.endMs)}`}
            </p>
            <p
              className={cn(
                "mt-2 text-xs font-semibold",
                isLive ? "text-red-400" : isEnded ? "text-muted-foreground" : "text-[#4a9eff]"
              )}
            >
              {statusLine}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
            <GlassButton variant={isLive ? "gold" : "glass"} size="sm" onClick={onOpen} className="justify-center">
              {isLive ? <Radio size={14} /> : <Play size={14} />}
              {isLive ? "Join live" : isEnded ? "Watch again" : "Open class"}
            </GlassButton>
            {c.status === "upcoming" && (
              <a
                href={calendarUrl(c)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4a9eff]/60"
              >
                <CalendarPlus size={13} /> Add to calendar
              </a>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
