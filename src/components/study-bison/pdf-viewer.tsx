"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize,
  Minimize,
  AlertCircle,
  FileText,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { GlassButton } from "./glass";

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: unknown) => { promise: Promise<void>; cancel: () => void };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };
type RenderTask = { promise: Promise<void>; cancel: () => void };

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const PAGE_PAD = 16;

export function PdfViewerView() {
  const { back } = useApp();
  const appState = useApp();
  const url = appState.videoId || "";
  const title = appState.lectureTitle || "PDF Document";

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const pdfDocRef = useRef<PdfDoc | null>(null);
  const pageBaseWidthRef = useRef(0);
  const userZoomedRef = useRef(false);

  const [loading, setLoading] = useState(() => !!url);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const renderPage = useCallback(async (page: PdfPage, desiredScale: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewport = page.getViewport({ scale: desiredScale });
    pageBaseWidthRef.current = viewport.width / desiredScale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
    });
    renderTaskRef.current = renderTask;
    await renderTask.promise;
  }, []);

  /** Scale that fits one page width inside the current container. */
  const fitScale = useCallback(() => {
    const el = containerRef.current;
    const base = pageBaseWidthRef.current;
    if (!el || !base) return null;
    const avail = Math.max(0, el.clientWidth - PAGE_PAD * 2);
    if (avail <= 0) return null;
    return Math.max(MIN_SCALE, Math.min(avail / base, MAX_SCALE));
  }, []);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    userZoomedRef.current = false;

    const proxyUrl = url.startsWith("/") ? url : `/api/pdf?url=${encodeURIComponent(url)}`;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.mjs",
          import.meta.url
        ).toString();
        const loadingTask = pdfjsLib.getDocument({ url: proxyUrl });
        const pdf = (await loadingTask.promise) as unknown as PdfDoc;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setPageNum(1);

        const page = await pdf.getPage(1);
        if (cancelled) return;
        // Probe width at scale 1 so we can fit to the viewport on any device.
        pageBaseWidthRef.current = page.getViewport({ scale: 1 }).width;
        const fit = fitScale() ?? 1.2;
        setScale(fit);
        await renderPage(page, fit);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Could not load this PDF. It may be blocked by CORS or unavailable.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* noop */
        }
      }
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy();
        } catch {
          /* noop */
        }
        pdfDocRef.current = null;
      }
    };
  }, [url]);

  // Re-render when page or scale changes.
  useEffect(() => {
    const pdf = pdfDocRef.current;
    if (!pdf || loading) return;

    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        await renderPage(page, scale);
      } catch {
        /* noop */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageNum, scale, loading, renderPage]);

  // Keep the page fitting its container on resize / orientation change
  // unless the user has chosen a custom zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (userZoomedRef.current) return;
        const fit = fitScale();
        if (fit) setScale(fit);
      });
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("orientationchange", onResize);
    };
  }, [fitScale]);

  const goPrev = () => pageNum > 1 && setPageNum(pageNum - 1);
  const goNext = () => pageNum < numPages && setPageNum(pageNum + 1);
  const zoomIn = () => {
    userZoomedRef.current = true;
    setScale((s) => Math.min(s + 0.25, MAX_SCALE));
  };
  const zoomOut = () => {
    userZoomedRef.current = true;
    setScale((s) => Math.max(s - 0.25, MIN_SCALE));
  };
  const refit = () => {
    userZoomedRef.current = false;
    const fit = fitScale();
    if (fit) setScale(fit);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  };

  if (!url) {
    return (
      <main className="flex-1 px-4 pb-20 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl pt-10">
          <GlassButton variant="glass" size="sm" onClick={back}>
            <ArrowLeft size={15} /> Back
          </GlassButton>
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="text-muted-foreground" size={32} />
            <p className="text-sm text-muted-foreground">No document was provided to display.</p>
          </div>
        </div>
      </main>
    );
  }

  const downloadHref = url.startsWith("/") ? url : `/api/pdf?url=${encodeURIComponent(url)}`;

  return (
    <main className="flex-1 flex flex-col w-full">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-5 sm:py-3 bg-[#060a14]/90 backdrop-blur-md border-b border-white/5">
        <GlassButton variant="glass" size="sm" onClick={back} className="shrink-0">
          <ArrowLeft size={15} /> <span className="hidden xs:inline sm:inline">Back</span>
        </GlassButton>
        <p className="min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold text-foreground/90 order-3 sm:order-none basis-full sm:basis-auto">{title}</p>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={zoomOut} disabled={loading || !!error} className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40" aria-label="Zoom out">
            <ZoomOut size={16} />
          </button>
          <button
            onClick={refit}
            disabled={loading || !!error}
            className="min-w-[3rem] sm:min-w-[3.5rem] text-center text-[11px] sm:text-xs font-semibold tabular-nums text-muted-foreground hover:text-foreground disabled:opacity-40 px-1"
            aria-label="Fit to width"
            title="Fit to width"
          >
            {Math.round(scale * 100)}%
          </button>
          <button onClick={zoomIn} disabled={loading || !!error} className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-40" aria-label="Zoom in">
            <ZoomIn size={16} />
          </button>
        </div>

        <a href={downloadHref} target="_blank" rel="noreferrer" download className="shrink-0">
          <GlassButton variant="glass" size="sm">
            <Download size={15} /> <span className="hidden sm:inline">Download</span>
          </GlassButton>
        </a>
        <button onClick={toggleFullscreen} className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>

      {/* PDF canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto sb-scroll bg-[#1a1a24] flex flex-col items-center py-3 sm:py-4 px-2 sm:px-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <Loader2 className="animate-spin text-[#4a9eff]" size={32} />
            <p className="text-sm text-muted-foreground">Loading document...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
            <AlertCircle className="text-red-400" size={32} />
            <p className="max-w-md text-sm text-white/85">{error}</p>
            <a href={downloadHref} target="_blank" rel="noreferrer">
              <GlassButton variant="gold" size="sm">
                <FileText size={14} /> Open in new tab
              </GlassButton>
            </a>
          </div>
        )}

        {!loading && !error && (
          <canvas ref={canvasRef} className="rounded-lg shadow-2xl bg-white max-w-full" />
        )}
      </div>

      {/* Page navigation */}
      {!loading && !error && numPages > 0 && (
        <div className="sticky bottom-0 z-20 flex items-center justify-center gap-3 bg-[#060a14]/90 backdrop-blur-md border-t border-white/5 px-3 py-2 sm:py-2.5">
          <button onClick={goPrev} disabled={pageNum <= 1} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30" aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs font-semibold tabular-nums text-foreground/80">
            Page {pageNum} <span className="text-muted-foreground">of {numPages}</span>
          </span>
          <button onClick={goNext} disabled={pageNum >= numPages} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30" aria-label="Next page">
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </main>
  );
}
