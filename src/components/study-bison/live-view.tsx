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
  Loader2,
  BookOpen,
  RefreshCw,
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
            return rows.map((c): LiveClass => ({
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
            }));
          } catch {
            return [];
          }
        })
      );

      if (!alive) return;
      const all = results.flat();
      // Keep classes that are scheduled today, then sort: live first, then upcoming by time.
      const todays = all.filter((c) => withinToday(c.startTime, c.endTime));
      todays.sort((a, b) => {
        const order = { live: 0, upcoming: 1, ended: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });
      setClasses(todays);
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

  const liveCount = useMemo(() => classes?.filter((c) => c.status === "live").length ?? 0, [classes]);

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
              {loading ? "Loading today's classes..." : `${liveCount} live now · ${classes?.length ?? 0} scheduled today`}
            </p>
          </div>
          <GlassButton variant="glass" size="sm" onClick={() => setAttempt((v) => v + 1)}>
            <RefreshCw size={15} /> Refresh
          </GlassButton>
        </div>

        {/* content */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <GlassSkeleton key={i} className="h-28" />)}
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
          <div className="space-y-4 sb-fade-up">
            {classes.map((c) => (
              <LiveClassCard key={`${c.batchId}:${c.id}`} liveClass={c} onOpen={() => openClass(c)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

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
