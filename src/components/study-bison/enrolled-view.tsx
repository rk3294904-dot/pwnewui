"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { firebaseAuth, getEnrolledBatchIds, signInWithGoogle } from "@/lib/firebase";
import { GlassBadge, GlassButton, GlassCard, GlassSkeleton, SafeImage, EmptyState } from "./glass";
import { GraduationCap, BookOpen, Loader2 } from "lucide-react";

interface EnrolledBatch {
  id: string;
  name: string;
  image?: string;
  byName?: string;
}

export function EnrolledView() {
  const { navigate } = useApp();
  const [batches, setBatches] = useState<EnrolledBatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = async () => {
    setLoading(true);
    const user = firebaseAuth.currentUser;
    if (!user) {
      setBatches([]);
      setNeedsAuth(true);
      setLoading(false);
      return;
    }
    try {
      const ids = await getEnrolledBatchIds(user.uid);
      // Fetch catalog to enrich names/images when possible.
      let catalog: { _id: string; name: string; previewImage?: string; byName?: string }[] = [];
      try {
        const res = await fetch("/api/batches");
        const d = await res.json();
        if (d?.success && Array.isArray(d.batches)) catalog = d.batches;
      } catch {
        catalog = [];
      }
      const enriched = ids.map((id) => {
        const match = catalog.find((b) => b._id === id);
        return {
          id,
          name: match?.name ?? "Batch",
          image: match?.previewImage,
          byName: match?.byName,
        };
      });
      setBatches(enriched);
      setNeedsAuth(false);
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openBatch = (b: EnrolledBatch) =>
    navigate({ view: "batch", batchId: b.id, batchName: b.name, batchImage: b.image });

  return (
    <main className="flex-1 px-4 pb-20 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl pt-8 sm:pt-12">
        <div className="mb-8 sb-fade-up">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.22em] text-[#4a9eff]">My Learning</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Enrolled Batches</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loading ? "Loading your batches..." : batches && batches.length > 0 ? `${batches.length} enrolled batches` : "Pick a batch from the catalog to begin"}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="glass overflow-hidden rounded-3xl">
                <GlassSkeleton className="aspect-[1.7] rounded-none" />
                <div className="space-y-3 p-4"><GlassSkeleton className="h-4 w-4/5" /><GlassSkeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : needsAuth ? (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title="Sign in to see your enrolled batches"
            hint="Your enrollments are tied to your account."
          />
        ) : !batches || batches.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title="No enrolled batches yet"
            hint="Enroll in a batch from the catalog to start learning."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 sb-fade-up">
            {batches.map((b) => (
              <GlassCard key={b.id} className="overflow-hidden rounded-3xl" hover={false} sheen={false}>
                <button type="button" onClick={() => openBatch(b)} className="group block w-full text-left">
                  <div className="relative aspect-[1.7] overflow-hidden bg-black/30">
                    <SafeImage src={b.image} alt={b.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <GlassBadge className="absolute left-3 top-3 bg-black/70 text-white" tone="green"><GraduationCap size={10} /> Enrolled</GlassBadge>
                  </div>
                  <div className="space-y-3 p-4">
                    <h2 className="line-clamp-2 min-h-11 text-base font-bold text-white">{b.name}</h2>
                    <p className="line-clamp-1 text-sm text-muted-foreground">For {b.byName || "serious learners"}</p>
                  </div>
                </button>
                <div className="px-4 pb-4">
                  <GlassButton variant="gold" size="sm" className="w-full" onClick={() => openBatch(b)}>
                    <BookOpen size={15} /> Continue learning
                  </GlassButton>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
