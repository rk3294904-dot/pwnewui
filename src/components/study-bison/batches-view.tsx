"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { firebaseAuth, enrollInBatch, getEnrolledBatchIds, signInWithGoogle } from "@/lib/firebase";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import { BookOpen, ChevronDown, Search, Check, Loader2, ArrowRight, Circle } from "lucide-react";

interface CatalogBatch {
  _id: string;
  name: string;
  byName: string;
  startDate?: string;
  endDate?: string;
  language?: string;
  previewImage?: string;
  feeTotal?: number;
  type?: string;
  slug?: string;
}

const PAGE_SIZE = 24;

export function BatchesView() {
  const { navigate, searchQuery, setSearchQuery } = useApp();
  const [batches, setBatches] = useState<CatalogBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    fetch("/api/batches", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { success?: boolean; batches?: CatalogBatch[]; error?: string }) => {
        if (!alive) return;
        if (data.success && Array.isArray(data.batches)) {
          setBatches(data.batches);
        } else {
          setError(data.error ?? "Unable to load courses");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("Unable to connect to the course catalog");
        setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    getEnrolledBatchIds(user.uid).then((ids) => setEnrolledIds(new Set(ids))).catch(() => {});
  }, []);

  const saveEnrollment = async (batch: CatalogBatch) => {
    if (enrolledIds.has(batch._id)) return;
    setSavingId(batch._id);
    try {
      let user = firebaseAuth.currentUser;
      if (!user) {
        await signInWithGoogle();
        user = firebaseAuth.currentUser;
      }
      if (!user) return;
      await enrollInBatch({ userId: user.uid, batch: { id: batch._id, name: batch.name, image: batch.previewImage, byName: batch.byName } });
      setEnrolledIds((current) => new Set(current).add(batch._id));
    } catch {
      setError("Sign in is required to enroll in a batch.");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return batches;
    return batches.filter((batch) =>
      `${batch.name} ${batch.byName} ${batch.language ?? ""}`.toLowerCase().includes(query)
    );
  }, [batches, searchQuery]);

  const openBatch = (batch: CatalogBatch) =>
    navigate({
      view: "batch",
      batchId: batch._id,
      batchName: batch.name,
      batchImage: batch.previewImage,
    });

  return (
    <main className="flex-1 px-4 pb-20 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl pt-8 sm:pt-12">
        <div className="mb-8 sb-fade-up">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.22em] text-[#4a9eff]">Catalog</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">All Batches</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loading ? "Loading courses..." : `${batches.length.toLocaleString()} batches available`} · Find your course and start learning
          </p>
        </div>

        <label className="mb-6 flex h-12 items-center gap-3 rounded-2xl glass-soft px-4 text-muted-foreground focus-within:border-[#4a9eff]/50">
          <Search size={19} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search batches by name or category..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            aria-label="Search batches"
          />
        </label>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="glass overflow-hidden rounded-3xl">
                <GlassSkeleton className="aspect-[1.7] rounded-none" />
                <div className="space-y-3 p-4"><GlassSkeleton className="h-4 w-4/5" /><GlassSkeleton className="h-3 w-1/2" /><GlassSkeleton className="h-10 w-full" /></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState icon={<Search size={22} />} title="Courses are unavailable" hint={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<BookOpen size={22} />} title="No batches found" hint="Try a different search term." />
        ) : (
          <BatchGrid batches={filtered} onOpen={openBatch} onEnroll={saveEnrollment} enrolledIds={enrolledIds} savingId={savingId} />
        )}
      </div>
    </main>
  );
}

function BatchGrid({ batches, onOpen, onEnroll, enrolledIds, savingId }: { batches: CatalogBatch[]; onOpen: (batch: CatalogBatch) => void; onEnroll: (batch: CatalogBatch) => void; enrolledIds: Set<string>; savingId: string | null }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {batches.slice(0, visible).map((batch) => <BatchCard key={batch._id} batch={batch} onOpen={() => onOpen(batch)} onEnroll={() => onEnroll(batch)} enrolled={enrolledIds.has(batch._id)} saving={savingId === batch._id} />)}
      </div>
      {visible < batches.length && <div className="mt-8 flex justify-center"><GlassButton variant="glass" onClick={() => setVisible((value) => value + PAGE_SIZE)}>Load more <ChevronDown size={16} /></GlassButton></div>}
    </>
  );
}

function BatchCard({ batch, onOpen, onEnroll, enrolled, saving }: { batch: CatalogBatch; onOpen: () => void; onEnroll: () => void; enrolled: boolean; saving: boolean }) {
  const fee = typeof batch.feeTotal === "number" && batch.feeTotal > 0 ? batch.feeTotal : 1799;
  const originalFee = Math.ceil(fee * 1.95 / 100) * 100;
  const discount = Math.max(1, Math.round((1 - fee / originalFee) * 100));

  return (
    <article className="group overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#101b2d] dark:shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[1.72] overflow-hidden bg-slate-100 dark:bg-black/30">
          <SafeImage src={batch.previewImage} alt={batch.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
        <div className="space-y-3 p-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-300">{batch.byName || "Class 12 JEE"}</p>
            <span className="rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 dark:border-white/20 dark:text-slate-200">{batch.language ?? "Hinglish"}</span>
          </div>
          <h2 className="line-clamp-2 min-h-12 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{batch.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><BookOpen size={15} /> {batch.type ?? "JEE 2027"}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1.5"><Circle size={10} className="fill-red-500 text-red-500" /> Ongoing</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Started on {batch.startDate ?? "28th Sep’26"}</p>
        </div>
      </button>
      <div className="flex items-end justify-between gap-3 px-4 pb-4">
        <div>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white">₹{fee.toLocaleString("en-IN")} <span className="text-sm font-medium text-slate-400 line-through">₹{originalFee.toLocaleString("en-IN")}</span></p>
          <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">{discount}% OFF</p>
        </div>
        <div className="flex gap-2">
          <GlassButton type="button" variant={enrolled ? "glass" : "gold"} size="sm" disabled={enrolled || saving} onClick={onEnroll}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : enrolled ? <Check size={15} /> : null}
            {saving ? "Saving..." : enrolled ? "Enrolled" : "Buy Now"}
          </GlassButton>
          <button type="button" aria-label={`Open ${batch.name}`} onClick={onOpen} className="flex h-9 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-800 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-white dark:hover:bg-white/10"><ArrowRight size={17} /></button>
        </div>
      </div>
    </article>
  );
}
