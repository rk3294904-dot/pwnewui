"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useApp } from "@/lib/store";
import { firebaseAuth, getEnrolledBatchIds } from "@/lib/firebase";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import {
  Radio,
  ChevronRight,
  Play,
  Clock,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CatalogBatch {
  _id: string;
  name: string;
  byName: string;
  startDate?: string;
  language?: string;
  previewImage?: string;
  type?: string;
}

interface LiveClass {
  id: string;
  batchId: string;
  batchName: string;
  title: string;
  subject: string;
  startTime: string;
  endTime: string;
  thumbnail: string;
  duration: string;
  videoId: string;
  subjectSlug: string;
  subjectId: string;
  status: "live" | "upcoming" | "ended";
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

export function HomeView() {
  const { navigate } = useApp();
  const [enrolledBatches, setEnrolledBatches] = useState<CatalogBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [loadingLive, setLoadingLive] = useState(true);

  useEffect(() => {
    let alive = true;
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      setLoadingLive(true);
      try {
        const [catalogResponse, enrolledIds] = await Promise.all([
          fetch("/api/batches"),
          user ? getEnrolledBatchIds(user.uid) : Promise.resolve([] as string[]),
        ]);
        const data = await catalogResponse.json() as { success?: boolean; batches?: CatalogBatch[] };
        const catalog = data.success && Array.isArray(data.batches) ? data.batches : [];
        const enrolled = enrolledIds.map((id) => catalog.find((batch) => batch._id === id) ?? {
          _id: id,
          name: "Enrolled batch",
          byName: "",
        });
        if (!alive) return;
        setEnrolledBatches(enrolled);
        setSelectedBatchId((current) => enrolled.some((batch) => batch._id === current) ? current : enrolled[0]?._id ?? "");
      } catch {
        if (alive) {
          setEnrolledBatches([]);
          setSelectedBatchId("");
        }
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loadLive = async () => {
      if (!selectedBatchId || enrolledBatches.length === 0) {
        setLiveClasses([]);
        setLoadingLive(false);
        return;
      }
      setLoadingLive(true);
      const batch = enrolledBatches.find((item) => item._id === selectedBatchId);
      try {
        const response = await fetch(`/api/batches/${selectedBatchId}/today`);
        const data = await response.json() as { classes?: Array<Record<string, unknown>> };
        const rows = Array.isArray(data.classes) ? data.classes : [];
        const classes = rows.map((item): LiveClass => ({
            id: typeof item.id === "string" ? item.id : "",
            batchId: selectedBatchId,
            batchName: batch?.name ?? "Enrolled batch",
            title: typeof item.title === "string" ? item.title : "Class",
            subject: typeof item.subject === "string" ? item.subject : "",
            startTime: typeof item.startTime === "string" ? item.startTime : "",
            endTime: typeof item.endTime === "string" ? item.endTime : "",
            thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "",
            duration: typeof item.duration === "string" ? item.duration : "",
            videoId: typeof item.videoId === "string" ? item.videoId : "",
            subjectSlug: typeof item.subjectSlug === "string" ? item.subjectSlug : typeof item.subjectId === "string" ? item.subjectId : typeof item.batchSubjectId === "string" ? item.batchSubjectId : "",
            subjectId: typeof item.subjectId === "string" ? item.subjectId : typeof item.batchSubjectId === "string" ? item.batchSubjectId : "",
            status: classStatus(typeof item.startTime === "string" ? item.startTime : "", typeof item.endTime === "string" ? item.endTime : ""),
          }));
        classes.sort((a, b) => {
          const order = { live: 0, upcoming: 1, ended: 2 };
          if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
        if (alive) setLiveClasses(classes);
      } catch {
        if (alive) setLiveClasses([]);
      } finally {
        if (alive) setLoadingLive(false);
      }
    };
    void loadLive();
    return () => {
      alive = false;
    };
  }, [enrolledBatches, selectedBatchId]);

  const liveCount = liveClasses.filter((c) => c.status === "live").length;

  const openLive = async (c: LiveClass) => {
    if (!c.id || !c.subjectSlug) {
      navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName });
      return;
    }
    if (c.videoId) {
      navigate({ view: "watch", batchId: c.batchId, subjectSlug: c.subjectSlug, subjectName: c.subject, batchName: c.batchName, contentId: c.id, lectureTitle: c.title, videoId: c.videoId });
      return;
    }
    try {
      const response = await fetch(`/api/batches/${c.batchId}/subjects/${encodeURIComponent(c.subjectSlug)}/schedule/${c.id}`);
      const data = await response.json() as { success?: boolean; lecture?: { videoId?: string; videoUrl?: string; urlType?: string; title?: string } };
      if (data.success && data.lecture) {
        navigate({ view: "watch", batchId: c.batchId, subjectSlug: c.subjectSlug, subjectName: c.subject, batchName: c.batchName, contentId: c.id, lectureTitle: data.lecture.title || c.title, videoId: data.lecture.videoId || data.lecture.videoUrl || "", videoType: data.lecture.urlType || "youtube" });
      }
    } catch {
      navigate({ view: "batch", batchId: c.batchId, batchName: c.batchName });
    }
  };


  return (
    <main className="w-full min-w-0 flex-1 px-4 pb-20 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl pt-8 sm:pt-12 space-y-10">
        <section className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[#4a9eff]">Learning schedule</p>
              <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
                <span className={cn("inline-flex h-2 w-2 rounded-full", liveCount > 0 ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40")} />
                Today's classes
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {liveCount > 0 ? `${liveCount} live now` : "All scheduled classes for the selected batch."}
              </p>
            </div>
            {selectedBatchId && (
              <GlassButton variant="glass" size="sm" onClick={() => navigate({ view: "batch", batchId: selectedBatchId, batchName: enrolledBatches.find((batch) => batch._id === selectedBatchId)?.name, tab: "today" })}>
                View all classes <ChevronRight size={14} />
              </GlassButton>
            )}
          </div>

          {enrolledBatches.length > 0 && (
            <label className="block max-w-full sm:max-w-md">
              <span className="mb-2 block text-sm font-bold text-foreground">Choose a batch to see its classes</span>
              <select
                value={selectedBatchId}
                onChange={(event) => setSelectedBatchId(event.target.value)}
                className="h-14 w-full appearance-none rounded-2xl border border-[#4a9eff]/35 bg-[#0c172b] px-4 text-sm font-bold text-foreground shadow-[0_10px_30px_rgba(0,0,0,0.16)] outline-none transition-colors focus:border-[#4a9eff]"
              >
                {enrolledBatches.map((batch) => <option key={batch._id} value={batch._id}>{batch.name}</option>)}
              </select>
            </label>
          )}

          {loadingLive ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <GlassSkeleton key={i} className="h-24" />)}
            </div>
          ) : liveClasses.length === 0 ? (
            <EmptyState icon={<Radio size={22} />} title={enrolledBatches.length === 0 ? "No enrolled batches yet" : "No classes scheduled today"} hint={enrolledBatches.length === 0 ? "Enroll in a batch to see its classes here." : "Try another enrolled batch or check back later."} />
          ) : (
            <div className="space-y-3 sb-fade-up">
              {liveClasses.map((item) => <LivePreviewCard key={`${item.batchId}:${item.id}`} liveClass={item} onOpen={() => openLive(item)} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LivePreviewCard({ liveClass, onOpen }: { liveClass: LiveClass; onOpen: () => void }) {
  const isLive = liveClass.status === "live";
  const isEnded = liveClass.status === "ended";
  return (
    <GlassCard hover={false} sheen={false} className="overflow-hidden rounded-2xl">
      <button type="button" onClick={onOpen} className="group flex w-full items-center gap-4 p-3 sm:p-4 text-left cursor-pointer">
        <div className="relative w-24 sm:w-32 aspect-video rounded-xl overflow-hidden shrink-0 border border-white/10">
          <SafeImage src={liveClass.thumbnail} alt={liveClass.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="flex h-8 w-8 items-center justify-center rounded-full btn-gold opacity-95 group-hover:scale-110 transition-transform">
              <Play size={13} className="ml-0.5" />
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {isLive ? (
              <GlassBadge tone="red"><Radio size={9} /> LIVE</GlassBadge>
            ) : isEnded ? (
              <GlassBadge tone="neutral">Ended</GlassBadge>
            ) : (
              <GlassBadge tone="gold"><Clock size={9} /> Upcoming</GlassBadge>
            )}
            <span className="truncate text-[11px] text-muted-foreground">{liveClass.batchName}</span>
          </div>
          <p className="font-bold text-sm leading-snug line-clamp-2">{liveClass.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <CalendarDays size={11} /> {fmtTime(liveClass.startTime)}
          </p>
        </div>
      </button>
    </GlassCard>
  );
}

function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
