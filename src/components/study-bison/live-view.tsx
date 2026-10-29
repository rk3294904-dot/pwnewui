"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { firebaseAuth, getEnrolledBatchIds } from "@/lib/firebase";
import { GlassSkeleton, SafeImage, EmptyState } from "./glass";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Radio,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Status = "live" | "upcoming" | "ended";

interface RawClass {
  id: string;
  batchId: string;
  batchName: string;
  batchImage?: string;
  title: string;
  subject: string;
  startMs: number;
  endMs: number;
  thumbnail: string;
  duration: string;
  videoId: string;
  subjectSlug: string;
}

interface ScheduleClass extends RawClass {
  status: Status;
}

interface BatchInfo {
  id: string;
  name: string;
  image?: string;
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

function localDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function onDate(ms: number, dateStr: string): boolean {
  return !Number.isNaN(ms) && localDateStr(new Date(ms)) === dateStr;
}

function getStatus(startMs: number, endMs: number, now: number): Status {
  if (Number.isNaN(startMs)) return "upcoming";
  if (now < startMs) return "upcoming";
  if (Number.isNaN(endMs) || now <= endMs) return "live";
  return "ended";
}

function fmtClock(ms: number): string {
  if (Number.isNaN(ms)) return "--:--";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function progressOf(c: ScheduleClass, now: number): number | null {
  if (c.status !== "live" || Number.isNaN(c.startMs) || Number.isNaN(c.endMs) || c.endMs <= c.startMs) return null;
  return Math.min(100, Math.max(0, ((now - c.startMs) / (c.endMs - c.startMs)) * 100));
}

const PILL: Record<Status, { label: string; cls: string }> = {
  ended: { label: "ENDED", cls: "bg-emerald-500" },
  live: { label: "LIVE", cls: "bg-red-600" },
  upcoming: { label: "UPCOMING", cls: "bg-purple-600" },
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function LiveView() {
  const { navigate } = useApp();

  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [raw, setRaw] = useState<RawClass[]>([]);
  const [batchId, setBatchId] = useState("");
  const [dateStr, setDateStr] = useState(() => localDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);

  const hasLoaded = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  /* statuses tick without refetching */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* quiet background refetch */
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

      const targetIds = enrolledIds.length > 0 ? enrolledIds : catalog.slice(0, 6).map((b) => b._id);
      const infos: BatchInfo[] = targetIds.map((id) => {
        const b = catalog.find((x) => x._id === id);
        return { id, name: b?.name ?? "Batch", image: b?.previewImage };
      });

      // NOTE: assumes /today accepts an optional ?date=YYYY-MM-DD. If it ignores
      // the param it returns today's classes, and the date filter below hides
      // anything that doesn't fall on the chosen day.
      const results = await Promise.all(
        infos.map(async (batch) => {
          try {
            const r = await fetch(`/api/batches/${batch.id}/today?date=${dateStr}`);
            const d = await r.json();
            const rows: any[] = d?.classes ?? [];
            return rows.map((c): RawClass => ({
              id: c.id ?? "",
              batchId: batch.id,
              batchName: batch.name,
              batchImage: batch.image,
              title: c.title ?? "Class",
              subject: c.subject ?? "",
              startMs: toMs(c.startTime),
              endMs: toMs(c.endTime),
              thumbnail: c.thumbnail ?? "",
              duration: c.duration ?? "",
              videoId: c.videoId ?? "",
              subjectSlug: c.subjectSlug ?? "",
            }));
          } catch {
            return [] as RawClass[];
          }
        })
      );

      if (!alive) return;
      setBatches(infos);
      setRaw(results.flat().filter((c) => onDate(c.startMs, dateStr) || onDate(c.endMs, dateStr)));
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
  }, [attempt, dateStr]);

  /* pick a sensible default batch: first one that has classes on this date */
  useEffect(() => {
    if (batches.length === 0) return;
    if (batchId && batches.some((b) => b.id === batchId)) return;
    const withClasses = batches.find((b) => raw.some((c) => c.batchId === b.id));
    setBatchId((withClasses ?? batches[0]).id);
  }, [batches, raw, batchId]);

  const classes: ScheduleClass[] = useMemo(
    () =>
      raw
        .map((c) => ({ ...c, status: getStatus(c.startMs, c.endMs, now) }))
        .sort((a, b) => (Number.isNaN(a.startMs) ? 0 : a.startMs) - (Number.isNaN(b.startMs) ? 0 : b.startMs)),
    [raw, now]
  );

  const batchClasses = useMemo(() => classes.filter((c) => c.batchId === batchId), [classes, batchId]);

  const grouped = useMemo(
    () =>
      batches
        .map((b) => ({ batch: b, items: classes.filter((c) => c.batchId === b.id) }))
        .filter((g) => g.items.length > 0),
    [batches, classes]
  );

  const liveCount = classes.filter((c) => c.status === "live").length;

  /* the card the row should scroll to: first live, else first upcoming */
  const focusKey = useMemo(() => {
    const f = batchClasses.find((c) => c.status === "live") ?? batchClasses.find((c) => c.status === "upcoming");
    return f ? `${f.batchId}:${f.id}` : "";
  }, [batchClasses]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || !focusKey) return;
    const el = row.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
    if (el) row.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: "smooth" });
  }, [focusKey, batchId, dateStr]);

  const scrollRow = (dir: 1 | -1) => {
    rowRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  const openClass = useCallback(
    (c: ScheduleClass) => {
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

  return (
    <main className="flex-1 w-full px-4 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl pt-8 sm:pt-12">
        <section
          aria-label="Class schedule"
          className="rounded-2xl border border-white/10 bg-[#0a0e13] p-4 sm:p-8"
        >
          {/* ---------- controls ---------- */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="relative">
              <label htmlFor="batch-select" className="sr-only">
                Batch
              </label>
              <select
                id="batch-select"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                disabled={batches.length === 0}
                className="h-12 min-w-[220px] max-w-[320px] cursor-pointer appearance-none truncate rounded-xl border border-white/15 bg-transparent pl-5 pr-11 text-sm font-semibold outline-none transition-colors hover:border-white/30 focus-visible:ring-2 focus-visible:ring-purple-500/60"
              >
                {batches.length === 0 && <option value="">No batches</option>}
                {batches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-[#0a0e13]">
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" />
            </div>

            <label className="relative flex min-w-[250px] cursor-pointer items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.03] to-white/[0.07] px-4 py-3 transition-colors hover:border-white/25 focus-within:ring-2 focus-within:ring-purple-500/60">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                <CalendarDays size={18} />
              </span>
              <span className="flex-1">
                <span className="block text-[11px] font-bold tracking-wider text-slate-400">SCHEDULE DATE</span>
                <span className="block text-base font-bold">{fmtDateLabel(dateStr)}</span>
              </span>
              <ChevronDown size={16} className="text-slate-400" />
              <input
                type="date"
                aria-label="Schedule date"
                value={dateStr}
                onChange={(e) => e.target.value && setDateStr(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {
                    /* some browsers only open on the native icon */
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>

          {/* ---------- heading ---------- */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight">Class Schedule</h1>
              {liveCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/15 px-2.5 py-1 text-xs font-bold text-red-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  {liveCount} live now
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAttempt((v) => v + 1)}
                disabled={refreshing}
                aria-label="Refresh schedule"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-60"
              >
                {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              </button>
              <button
                type="button"
                onClick={() => scrollRow(-1)}
                aria-label="Scroll classes left"
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-white/30 hover:text-white sm:flex"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollRow(1)}
                aria-label="Scroll classes right"
                className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-white/30 hover:text-white sm:flex"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* ---------- cards row ---------- */}
          <div className="mt-5">
            {loading ? (
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 4 }).map((_, i) => (
                  <GlassSkeleton key={i} className="h-[256px] w-[274px] shrink-0 rounded-xl" />
                ))}
              </div>
            ) : failed ? (
              <>
                <EmptyState
                  icon={<Radio size={22} />}
                  title="Couldn't load the schedule"
                  hint="Check your connection, then refresh."
                />
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setAttempt((v) => v + 1)}
                    className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
                  >
                    <RefreshCw size={14} /> Try again
                  </button>
                </div>
              </>
            ) : batchClasses.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={22} />}
                title="No classes on this date"
                hint={
                  classes.length > 0
                    ? "Other batches have classes today. Open View All Batches/Classes to see them."
                    : "Pick another date or batch to see its schedule."
                }
              />
            ) : (
              <div
                ref={rowRef}
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]"
              >
                {batchClasses.map((c) => (
                  <ClassCard
                    key={`${c.batchId}:${c.id}`}
                    c={c}
                    now={now}
                    onOpen={() => openClass(c)}
                    className="w-[274px] shrink-0 snap-start"
                  />
                ))}
              </div>
            )}
          </div>

          {/* ---------- view all ---------- */}
          {!loading && !failed && classes.length > 0 && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="inline-flex items-center gap-2.5 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                View All Batches/Classes
                <ChevronDown size={16} className={cn("transition-transform", showAll && "rotate-180")} />
              </button>
            </div>
          )}

          {showAll && grouped.length > 0 && (
            <div className="mt-8 space-y-8 border-t border-white/10 pt-8">
              {grouped.map(({ batch, items }) => (
                <div key={batch.id} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-bold">{batch.name}</h2>
                    <span className="text-sm text-slate-400">
                      {items.length} {items.length === 1 ? "class" : "classes"}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((c) => (
                      <ClassCard key={`${c.batchId}:${c.id}`} c={c} now={now} onOpen={() => openClass(c)} className="w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Lecture card                                                        */
/* ------------------------------------------------------------------ */

function ClassCard({
  c,
  now,
  onOpen,
  className,
}: {
  c: ScheduleClass;
  now: number;
  onOpen: () => void;
  className?: string;
}) {
  const pill = PILL[c.status];
  const pct = progressOf(c, now);
  const isLive = c.status === "live";
  const isEnded = c.status === "ended";

  return (
    <button
      type="button"
      onClick={onOpen}
      data-key={`${c.batchId}:${c.id}`}
      aria-label={`${pill.label.toLowerCase()}: ${c.title}, ${fmtClock(c.startMs)}`}
      className={cn(
        "group rounded-xl border bg-white/[0.02] p-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/70",
        isLive ? "border-red-500/50 hover:border-red-500" : "border-white/10 hover:border-white/30",
        className
      )}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-white/5">
        <SafeImage
          src={c.thumbnail}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]",
            isEnded && "opacity-80"
          )}
        />
        {pct !== null && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label="Class progress"
            className="absolute inset-x-0 bottom-0 h-1 bg-black/40"
          >
            <div className="h-full bg-red-500 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white",
            pill.cls
          )}
        >
          {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
          {pill.label}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 tabular-nums">
          <Clock size={14} />
          {fmtClock(c.startMs)}
        </span>
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <h3 className="truncate text-[15px] font-bold" title={c.title}>
          {c.title}
        </h3>
      </div>
    </button>
  );
}
