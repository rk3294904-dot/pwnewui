"use client";

import { useEffect, useMemo, useState } from "react";
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
  CalendarDays,
  BookOpen,
  RefreshCw,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveClass {
  id: string;
  batchId: string;
  batchName: string;
  batchImage?: string;
  title: string;
  subject: string;
  startTime: string;
  endTime: string;
  thumbnail: string;
  duration: string;
  videoId: string;
  subjectSlug: string;
  status: "live" | "upcoming" | "ended";
}

interface CatalogBatch {
  _id: string;
  name: string;
  previewImage?: string;
}

function classStatus(start: string, end: string): "live" | "upcoming" | "ended" {
  const now = Date.now();
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(s)) return "upcoming";
  if (now < s) return "upcoming";
  if (Number.isNaN(e) || now <= e) return "live";
  return "ended";
}

function withinToday(start: string, end: string): boolean {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (!Number.isNaN(s) && s >= startOfToday && s < endOfToday) return true;
  if (!Number.isNaN(e) && e >= startOfToday && e < endOfToday) return true;
  return false;
}

export function LiveView() {
  const { navigate } = useApp();
  const [classes, setClasses] = useState<LiveClass[] | null>(null);
  const [batchOptions, setBatchOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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

      // Fetch the catalog so we can map batch ids to names/images.
      let catalog: CatalogBatch[] = [];
      try {
        const res = await fetch("/api/batches");
        const d = await res.json();
        if (d?.success && Array.isArray(d.batches)) catalog = d.batches as CatalogBatch[];
      } catch {
        catalog = [];
      }

      // Use enrolled batches when available; otherwise fall back to the first
      // few catalog batches so the page is never empty for a new user.
      const targetIds = enrolledIds.length > 0 ? enrolledIds : catalog.slice(0, 6).map((b) => b._id);

      const results = await Promise.all(
        targetIds.map(async (batchId) => {
          const batch = catalog.find((b) => b._id === batchId);
          try {
            const r = await fetch(`/api/batches/${batchId}/today`);
            const d = await r.json();
            const rows: any[] = d?.classes ?? [];
            return {
              batchId,
              batchName: batch?.name ?? "Batch",
              classes: rows.map((c): LiveClass => ({
                id: c.id ?? "",
                batchId,
                batchName: batch?.name ?? "Batch",
                batchImage: batch?.previewImage,
                title: c.title ?? "Class",
                subject: c.subject ?? "",
                startTime: c.startTime ?? "",
                endTime: c.endTime ?? "",
                thumbnail: c.thumbnail ?? "",
                duration: c.duration ?? "",
                videoId: c.videoId ?? "",
                subjectSlug: c.subjectSlug ?? "",
                status: classStatus(c.startTime ?? "", c.endTime ?? ""),
              })),
            };
          } catch {
            return { batchId, batchName: batch?.name ?? "Batch", classes: [] as LiveClass[] };
          }
        })
      );

      if (!alive) return;
      const all = results.flatMap((r) => r.classes);
      // Keep classes that are scheduled today, then sort: live first, then upcoming by time.
      const todays = all.filter((c) => withinToday(c.startTime, c.endTime));
      todays.sort((a, b) => {
        const order = { live: 0, upcoming: 1, ended: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });
      setClasses(todays);
      // Batch dropdown options: every batch we looked at, in catalog order.
      setBatchOptions(
        results.map((r) => ({ id: r.batchId, name: r.batchName })).filter(
          (o, i, arr) => arr.findIndex((x) => x.id === o.id) === i
        )
      );
      setLoading(false);
    };

    loadAll().catch(() => {
      if (alive) {
        setFailed(true);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
    };
  }, [attempt]);

  const visible = useMemo(() => {
    if (!classes) return [];
    return selectedBatch === "all" ? classes : classes.filter((c) => c.batchId === selectedBatch);
  }, [classes, selectedBatch]);

  const liveCount = useMemo(() => visible.filter((c) => c.status === "live").length, [visible]);

  const openClass = (c: LiveClass) => {
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
  };

  return (
    <main className="flex-1 w-full px-4 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl pt-8 sm:pt-12 space-y-6">
        {/* header */}
        <div className="sb-fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.22em] text-[#4a9eff]">Live & Today</p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Live Classes</h1>
            <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
              <span className={cn("inline-flex h-2 w-2 rounded-full", liveCount > 0 ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40")} />
              {loading
                ? "Loading today's classes..."
                : `${liveCount} live now · ${visible.length} scheduled today`}
            </p>
          </div>
          <GlassButton variant="glass" size="sm" onClick={() => setAttempt((v) => v + 1)}>
            <RefreshCw size={15} /> Refresh
          </GlassButton>
        </div>

        {/* batch selector — no schedule date picker */}
        {!loading && !failed && batchOptions.length > 0 && (
          <div className="sb-fade-up">
            <BatchSelect
              value={selectedBatch}
              options={[{ id: "all", name: "All batches" }, ...batchOptions]}
              onChange={(id) => {
                setSelectedBatch(id);
                setShowAll(false);
              }}
            />
          </div>
        )}

        {/* content */}
        {loading ? (
          <div className="space-y-4">
            <div className="h-8 w-52 rounded-lg bg-white/5" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <GlassSkeleton key={i} className="h-64 min-w-[220px] flex-1 rounded-2xl" />
              ))}
            </div>
          </div>
        ) : failed ? (
          <EmptyState
            icon={<Radio size={22} />}
            title="Couldn't load live classes"
            hint="Please try again in a moment."
          />
        ) : !classes || classes.length === 0 ? (
          <EmptyState
            icon={<Radio size={22} />}
            title="No live classes today"
            hint="Enroll in a batch to see today's scheduled classes here."
          />
        ) : (
          <div className="sb-fade-up space-y-6">
            {/* compact schedule row */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">Today&apos;s Schedule</h2>
              {visible.length === 0 ? (
                <EmptyState
                  icon={<Radio size={22} />}
                  title="No classes in this batch today"
                  hint="Pick another batch or view all classes below."
                />
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible xl:grid-cols-5">
                  {visible.map((c) => (
                    <ScheduleCard
                      key={`${c.batchId}:${c.id}`}
                      liveClass={c}
                      onOpen={() => openClass(c)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* view all toggle */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#111827] shadow-lg transition hover:bg-white/90 cursor-pointer"
              >
                View All Batches/Classes
                <ChevronDown size={16} className={cn("transition-transform", showAll && "rotate-180")} />
              </button>
            </div>

            {showAll && (
              <div className="space-y-4">
                {visible.map((c) => (
                  <LiveClassCard key={`${c.batchId}:${c.id}`} liveClass={c} onOpen={() => openClass(c)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/* ---------- batch dropdown ---------- */

function BatchSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-white/30 cursor-pointer"
      >
        <BookOpen size={15} className="text-[#4a9eff]" />
        <span className="max-w-[220px] truncate">{current?.name ?? "All batches"}</span>
        <ChevronDown size={15} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0e1420] p-1.5 shadow-2xl">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition cursor-pointer",
                  o.id === value
                    ? "bg-white/10 font-semibold text-white"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
              >
                <span className="truncate">{o.name}</span>
                {o.id === value && <Check size={14} className="shrink-0 text-[#4a9eff]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- compact schedule card ---------- */

function ScheduleCard({ liveClass, onOpen }: { liveClass: LiveClass; onOpen: () => void }) {
  const isLive = liveClass.status === "live";
  const isEnded = liveClass.status === "ended";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-[220px] max-w-[260px] shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:border-white/30 lg:min-w-0 lg:max-w-none"
    >
      {/* thumbnail */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/40">
        <SafeImage
          src={liveClass.thumbnail}
          alt={liveClass.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-10 w-10 items-center justify-center rounded-full btn-gold opacity-95 transition-transform group-hover:scale-110">
            <Play size={14} className="ml-0.5" />
          </span>
        </span>
        {isLive && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
          </span>
        )}
      </div>

      {/* batch name banner */}
      <div className="bg-white px-2 py-1.5 text-center">
        <span className="block truncate text-[13px] font-bold text-[#111827]">{liveClass.batchName}</span>
      </div>

      {/* status + time */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <StatusPill status={liveClass.status} />
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Clock size={11} />
          {fmtTimeOnly(liveClass.startTime)}
        </span>
      </div>

      {/* title + date */}
      <div className="flex flex-1 flex-col px-3 pb-3 pt-1.5">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
          {liveClass.title}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <CalendarDays size={10} className="shrink-0" />
          <span className="truncate">{fmtTime(liveClass.startTime)}</span>
        </p>
      </div>
    </button>
  );
}

function StatusPill({ status }: { status: LiveClass["status"] }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        <span className="h-1 w-1 rounded-full bg-white animate-pulse" /> Live
      </span>
    );
  }
  if (status === "ended") {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        Ended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      Upcoming
    </span>
  );
}

/* ---------- detailed list card (kept from the original design) ---------- */

function LiveClassCard({ liveClass, onOpen }: { liveClass: LiveClass; onOpen: () => void }) {
  const isLive = liveClass.status === "live";
  const isEnded = liveClass.status === "ended";

  return (
    <GlassCard hover={false} sheen={false} className="overflow-hidden rounded-3xl">
      <button type="button" onClick={onOpen} className="group block w-full text-left cursor-pointer">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-5">
          <div className="relative w-full sm:w-44 aspect-video rounded-2xl overflow-hidden shrink-0 border border-white/10">
            <SafeImage src={liveClass.thumbnail} alt={liveClass.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="flex h-11 w-11 items-center justify-center rounded-full btn-gold opacity-95 transition-transform group-hover:scale-110">
                <Play size={16} className="ml-0.5" />
              </span>
            </span>
            {isLive && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {isLive ? (
                <GlassBadge tone="red"><Radio size={10} /> Live now</GlassBadge>
              ) : isEnded ? (
                <GlassBadge tone="neutral">Ended</GlassBadge>
              ) : (
                <GlassBadge tone="gold"><Clock size={10} /> Upcoming</GlassBadge>
              )}
              {liveClass.subject && <GlassBadge tone="neutral">{liveClass.subject}</GlassBadge>}
              <GlassBadge tone="neutral"><BookOpen size={10} /> {liveClass.batchName}</GlassBadge>
            </div>
            <h3 className="font-bold text-base leading-snug line-clamp-2">{liveClass.title}</h3>
            <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarDays size={12} />
              {fmtTime(liveClass.startTime)}
              {liveClass.duration ? ` · ${liveClass.duration}` : ""}
            </p>
          </div>
          <GlassButton
            variant={isLive ? "gold" : "glass"}
            onClick={onOpen}
            className="shrink-0"
            disabled={false}
          >
            {isLive ? <Radio size={14} /> : <Play size={14} />}
            {isLive ? "Join live" : isEnded ? "Watch again" : "Open class"}
          </GlassButton>
        </div>
      </button>
    </GlassCard>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTimeOnly(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
