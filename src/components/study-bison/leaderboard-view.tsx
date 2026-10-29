"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Clock, Crown, FileText, RefreshCw, Search, Trophy } from "lucide-react";
import { getLeaderboard } from "@/lib/firebase";
import { useApp } from "@/lib/store";
import { GlassButton, SafeImage } from "./glass";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
  rank: number;
  legacy: boolean;
  points: number;
  id: string;
  displayName?: string;
  photoURL?: string;
  lectureMinutesWatched: number;
  pdfsOpened: number;
  hasMinutes: boolean;
  hasPdfs: boolean;
}

const PAGE_SIZE = 15;
const num = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const score = (e: LeaderboardEntry) => (e.legacy ? e.points : e.lectureMinutesWatched);
const hasScore = (e: LeaderboardEntry) => e.legacy || e.hasMinutes;
const unit = (legacy: boolean) => (legacy ? "points" : "min");

function duration(minutes: number) {
  if (minutes < 60) return `${num.format(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${num.format(h)}h ${m}m` : `${num.format(h)}h`;
}

/* ---------- motion helpers ---------- */

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(target: number, delay = 0, ms = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); return; }
    let raf = 0;
    let start = 0;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min((t - start) / ms, 1);
        setValue(target * (1 - Math.pow(1 - p, 4))); // ease-out quart
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, delay, ms]);
  return value;
}

function CountUp({ value, format, delay }: { value: number; format: (n: number) => string; delay?: number }) {
  const v = useCountUp(value, delay);
  return <>{format(v)}</>;
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([hit]) => {
      if (hit.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/* ---------- pieces ---------- */

function Avatar({ entry, size }: { entry: LeaderboardEntry; size: "sm" | "lg" }) {
  return (
    <span className={cn("lb3-avatar", size === "lg" ? "lb3-avatar-lg" : "lb3-avatar-sm")}>
      {entry.photoURL ? (
        <SafeImage src={entry.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        (entry.displayName?.trim().slice(0, 1) || "L").toUpperCase()
      )}
    </span>
  );
}

const SPARKS = [
  { x: "-3.6rem", y: "-2.6rem", d: "0s" },
  { x: "3.8rem", y: "-1.8rem", d: ".7s" },
  { x: "-4rem", y: "1.2rem", d: "1.4s" },
  { x: "3.4rem", y: "2.8rem", d: "2.1s" },
  { x: "0rem", y: "-4.2rem", d: "2.8s" },
];

function PodiumColumn({ entry, top, order }: { entry: LeaderboardEntry; top: number; order: number }) {
  const name = entry.displayName || "Learner";
  const labels = ["Champion", "Runner-up", "Third place"];
  const delay = 250 + order * 160;
  return (
    <article className={cn("lb3-col", `lb3-col-${entry.rank}`)} style={{ "--d": `${delay}ms` } as CSSProperties} aria-label={`Rank ${entry.rank}: ${name}`}>
      <div className="lb3-col-head">
        {entry.rank === 1 && <Crown size={24} className="lb3-crown" aria-hidden="true" />}
        <div className="lb3-ring-wrap">
          {entry.rank === 1 && SPARKS.map((s, i) => (
            <span key={i} className="lb3-spark" style={{ "--sx": s.x, "--sy": s.y, animationDelay: s.d } as CSSProperties} aria-hidden="true" />
          ))}
          <div className="lb3-ring"><Avatar entry={entry} size="lg" /></div>
        </div>
        <p className="lb3-col-name" title={name}>{name}</p>
        <p className="lb3-col-label">{labels[entry.rank - 1]}</p>
      </div>
      <div className="lb3-plinth">
        <span className="lb3-shine" aria-hidden="true" />
        <span className="lb3-plinth-rank" aria-hidden="true">{entry.rank}</span>
        <p className="lb3-plinth-score">
          {hasScore(entry)
            ? entry.legacy
              ? <CountUp value={score(entry)} format={(n) => num.format(Math.round(n))} delay={delay + 300} />
              : <CountUp value={score(entry)} format={duration} delay={delay + 300} />
            : "—"}
        </p>
        <p className="lb3-plinth-sub">
          {entry.legacy ? "Learning points" : entry.hasPdfs ? `${num.format(entry.pdfsOpened)} PDFs opened` : "PDFs not recorded"}
        </p>
        {entry.rank > 1 && top > 0 && hasScore(entry) && (
          <p className="lb3-plinth-gap">{num.format(Math.max(top - score(entry), 0))} {unit(entry.legacy)} behind #1</p>
        )}
      </div>
    </article>
  );
}

function Row({ entry, entries, index }: { entry: LeaderboardEntry; entries: LeaderboardEntry[]; index: number }) {
  const [ref, seen] = useInView<HTMLLIElement>();
  const top = entries[0] ? score(entries[0]) : 0;
  const ahead = entries[entry.rank - 2];
  const pct = top > 0 && hasScore(entry) ? Math.max((score(entry) / top) * 100, 2) : 0;
  const gap = ahead && hasScore(entry) ? Math.max(score(ahead) - score(entry), 0) : 0;
  const stagger = (index % PAGE_SIZE) * 45;

  return (
    <li ref={ref} className={cn("lb3-row", seen && "is-in")} style={{ "--rd": `${stagger}ms` } as CSSProperties}>
      <span className="lb3-row-rank">{entry.rank}</span>
      <Avatar entry={entry} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold">{entry.displayName || "Learner"}</p>
          <p className="lb3-row-value shrink-0">
            {hasScore(entry) ? (entry.legacy ? `${num.format(score(entry))} pts` : duration(score(entry))) : "No activity yet"}
          </p>
        </div>
        <div className="lb3-bar" aria-hidden="true"><span style={{ width: seen ? `${pct}%` : "0%" }} /></div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <FileText size={11} aria-hidden="true" />
            {entry.legacy ? "Previous rankings" : entry.hasPdfs ? `${num.format(entry.pdfsOpened)} PDFs` : "PDFs not recorded"}
          </span>
          {gap > 0 && <span>{num.format(gap)} {unit(entry.legacy)} to pass #{ahead.rank}</span>}
        </div>
      </div>
    </li>
  );
}

/* ---------- page ---------- */

export function LeaderboardView() {
  const { back, navigate } = useApp();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    let alive = true;
    getLeaderboard()
      .then((next) => { if (alive) setEntries(next); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);

  const legacy = entries[0]?.legacy ?? false;
  const top = entries[0] ? score(entries[0]) : 0;
  const podium = [entries[1], entries[0], entries[2]].filter((e): e is LeaderboardEntry => !!e);

  const totals = useMemo(() => ({
    minutes: entries.reduce((s, e) => s + (e.legacy ? 0 : e.lectureMinutesWatched), 0),
    pdfs: entries.reduce((s, e) => s + (e.legacy ? 0 : e.pdfsOpened), 0),
  }), [entries]);

  const q = query.trim().toLowerCase();
  const list = q ? entries.filter((e) => (e.displayName || "learner").toLowerCase().includes(q)) : entries.slice(3);
  const shown = list.slice(0, visible);

  // spotlight follows the pointer across the stage
  const onStageMove = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <main className="lb3-page min-w-0 flex-1 px-3 pb-16 sm:px-8 lg:px-12">
      <style>{css}</style>
      <div className="mx-auto max-w-5xl pt-6 sm:pt-10">
        <GlassButton variant="glass" size="sm" onClick={back}><ArrowLeft size={15} /> Back</GlassButton>

        <header className="lb3-hero">
          <div>
            <h1 className="lb3-title">Leaderboard</h1>
            <p className="lb3-intro">Ranked by lecture minutes watched, then PDFs opened. Every lecture you finish moves you up.</p>
          </div>
          {!loading && !failed && entries.length > 0 && !legacy && (
            <dl className="lb3-stats">
              <div>
                <dt><Clock size={13} aria-hidden="true" /> Total watched</dt>
                <dd><CountUp value={totals.minutes} format={(n) => duration(Math.round(n))} delay={200} /></dd>
              </div>
              <div>
                <dt><FileText size={13} aria-hidden="true" /> PDFs opened</dt>
                <dd><CountUp value={totals.pdfs} format={(n) => num.format(Math.round(n))} delay={350} /></dd>
              </div>
            </dl>
          )}
        </header>

        {!loading && !failed && legacy && (
          <p role="status" className="mb-6 rounded-xl border border-amber-200/20 bg-amber-200/5 px-5 py-4 text-sm leading-6 text-amber-100">
            Showing previous points rankings until watched-minute or PDF activity is available.
          </p>
        )}

        {loading ? (
          <div role="status" aria-label="Loading leaderboard" className="space-y-6">
            <span className="sr-only">Loading leaderboard</span>
            <div className="flex items-end justify-center gap-3 sm:gap-5">
              {[200, 270, 170].map((h, i) => <div key={i} className="sb-skeleton w-full max-w-[220px] rounded-2xl" style={{ height: h }} />)}
            </div>
            <div className="sb-skeleton h-56 rounded-2xl" />
          </div>
        ) : failed ? (
          <section role="alert" className="lb3-panel px-6 py-14 text-center">
            <RefreshCw size={26} className="mx-auto text-[var(--lb-gold)]" />
            <h2 className="mt-5 text-xl font-bold">Leaderboard didn’t load</h2>
            <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
            <GlassButton variant="glass" className="mt-6" onClick={() => { setLoading(true); setFailed(false); setAttempt((v) => v + 1); }}>Reload leaderboard</GlassButton>
          </section>
        ) : entries.length === 0 ? (
          <section className="lb3-panel px-6 py-14 text-center">
            <Trophy size={36} className="mx-auto text-[var(--lb-gold)]" />
            <h2 className="mt-5 text-2xl font-extrabold">No rankings yet</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Sign in and watch a lecture to take the first place on the podium.</p>
            <GlassButton variant="gold" className="mt-6" onClick={() => navigate({ view: "home" })}>Browse lectures <ArrowUpRight size={16} /></GlassButton>
          </section>
        ) : (
          <>
            {!q && podium.length > 0 && (
              <section aria-label="Top three learners" className="lb3-stage" onMouseMove={onStageMove}>
                <span className="lb3-beam" aria-hidden="true" />
                <span className="lb3-cursor-light" aria-hidden="true" />
                <div className="lb3-podium">
                  {podium.map((e) => <PodiumColumn key={e.id} entry={e} top={top} order={e.rank === 1 ? 2 : e.rank === 2 ? 0 : 1} />)}
                </div>
              </section>
            )}

            {(list.length > 0 || q) && (
              <section className="lb3-panel mt-6" aria-labelledby="lb3-all">
                <div className="lb3-panel-head">
                  <h2 id="lb3-all" className="text-base font-bold">{q ? "Search results" : "Everyone else"}</h2>
                  <label className="lb3-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
                      placeholder="Find a learner"
                      aria-label="Find a learner"
                    />
                  </label>
                </div>

                {shown.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-muted-foreground">No learner matches “{query.trim()}”. Check the spelling.</p>
                ) : (
                  <ol className="lb3-list">{shown.map((e, i) => <Row key={e.id} entry={e} entries={entries} index={i} />)}</ol>
                )}

                {list.length > shown.length && (
                  <div className="px-5 pb-5 text-center">
                    <GlassButton variant="glass" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                      Show {Math.min(PAGE_SIZE, list.length - shown.length)} more
                    </GlassButton>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        <footer className="mt-6 flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <BookOpen size={18} className="mt-0.5 shrink-0 text-[var(--lb-gold)]" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Your next lecture counts.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {legacy
                ? "Previous points rankings stay visible until watched-minute or PDF activity is available. Points are not converted into minutes."
                : "Rankings use saved lecture minutes, then PDF opens. Older points are not converted into minutes."}
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap');

.lb3-page{
  --lb-gold:#e7bd6d; --lb-gold-soft:rgba(231,189,109,.14);
  --lb-silver:#aebbd0; --lb-bronze:#d49a76;
  --lb-card:#101f36; --lb-line:rgba(255,255,255,.08);
  --mute:var(--muted-foreground,#8da2bf);
}
.lb3-title{
  font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;
  font-weight:800; letter-spacing:-.035em; line-height:.95;
  font-size:clamp(3rem,9vw,6rem);
  background:linear-gradient(100deg,#fff 20%,#e7bd6d 45%,#fff 55%,#9fb4d1 80%);
  background-size:250% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.lb3-intro{margin-top:.9rem;max-width:28rem;font-size:.875rem;line-height:1.5rem;color:var(--mute)}
.lb3-hero{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1.75rem;padding:2.5rem 0 2rem}
.lb3-stats{display:flex;gap:.75rem;margin:0}
.lb3-stats>div{min-width:7rem;padding:.7rem .95rem;border:1px solid var(--lb-line);border-radius:.9rem;background:rgba(255,255,255,.025);backdrop-filter:blur(6px)}
.lb3-stats dt{display:flex;align-items:center;gap:.35rem;font-size:11px;color:var(--mute)}
.lb3-stats dd{margin:.25rem 0 0;font-family:'Bricolage Grotesque',ui-sans-serif,sans-serif;font-weight:700;font-size:1.4rem;letter-spacing:-.02em;font-variant-numeric:tabular-nums}

/* stage */
.lb3-stage{
  --mx:50%; --my:0%;
  position:relative;padding:3rem .75rem 0;border-radius:1.5rem;overflow:hidden;isolation:isolate;
  border:1px solid var(--lb-line);
  background:linear-gradient(180deg,#0f1d33,#0a1424);
}
.lb3-beam{
  position:absolute;z-index:-1;left:50%;top:-10%;width:60%;height:120%;transform:translateX(-50%);
  background:conic-gradient(from 180deg at 50% 0%,transparent 160deg,rgba(231,189,109,.20) 180deg,transparent 200deg);
  filter:blur(18px);transform-origin:top center;
}
.lb3-cursor-light{
  position:absolute;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(18rem circle at var(--mx) var(--my),rgba(231,189,109,.12),transparent 60%);
}
.lb3-podium{display:flex;align-items:flex-end;justify-content:center;gap:.5rem;max-width:44rem;margin:0 auto}
.lb3-col{display:flex;flex:1 1 0;min-width:0;flex-direction:column;align-items:center}
.lb3-col-head{display:flex;flex-direction:column;align-items:center;width:100%;padding:0 .25rem 1rem;position:relative}
.lb3-col-1{color:var(--lb-gold)} .lb3-col-2{color:var(--lb-silver)} .lb3-col-3{color:var(--lb-bronze)}
.lb3-crown{color:var(--lb-gold);margin-bottom:.35rem;filter:drop-shadow(0 0 10px rgba(231,189,109,.6))}
.lb3-ring-wrap{position:relative}
.lb3-ring{position:relative;padding:4px;border-radius:9999px}
.lb3-ring::before{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:2px;
  background:conic-gradient(from 0deg,currentColor,transparent 40%,currentColor 70%,transparent);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;
}
.lb3-col-1 .lb3-ring{box-shadow:0 0 0 6px var(--lb-gold-soft),0 0 44px rgba(231,189,109,.35)}
.lb3-spark{position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:9999px;background:var(--lb-gold);box-shadow:0 0 10px 2px rgba(231,189,109,.8);opacity:0;transform:translate(var(--sx),var(--sy))}
.lb3-col-name{margin-top:.75rem;width:100%;text-align:center;color:#fff;font-weight:700;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb3-col-label{font-size:11px;color:currentColor;opacity:.9;margin-top:.15rem}
.lb3-plinth{
  position:relative;overflow:hidden;width:100%;display:flex;flex-direction:column;align-items:center;
  padding:1.1rem .5rem 1.25rem;text-align:center;color:#fff;
  border-radius:1rem 1rem 0 0;border:1px solid var(--lb-line);border-bottom:0;
  background:linear-gradient(180deg,color-mix(in srgb,currentColor 24%,#13243d),#0e1c31 85%);
  box-shadow:inset 0 2px 0 currentColor;transform-origin:bottom;
}
.lb3-col-1 .lb3-plinth{min-height:15rem} .lb3-col-2 .lb3-plinth{min-height:11.5rem} .lb3-col-3 .lb3-plinth{min-height:9.5rem}
.lb3-shine{position:absolute;inset:0;pointer-events:none;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.14) 50%,transparent 65%);transform:translateX(-120%)}
.lb3-plinth-rank{position:absolute;right:.6rem;bottom:.2rem;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:5rem;line-height:1;color:currentColor;opacity:.12;pointer-events:none}
.lb3-col-1 .lb3-plinth-rank{font-size:7rem}
.lb3-plinth-score{font-family:'Bricolage Grotesque',ui-sans-serif,sans-serif;font-weight:800;letter-spacing:-.03em;font-size:1.5rem;line-height:1.1;font-variant-numeric:tabular-nums}
.lb3-col-1 .lb3-plinth-score{font-size:2rem}
.lb3-plinth-sub{margin-top:.35rem;font-size:11px;color:var(--mute)}
.lb3-plinth-gap{margin-top:.35rem;font-size:10px;color:var(--mute);opacity:.85}

/* list */
.lb3-panel{border:1px solid var(--lb-line);border-radius:1.25rem;background:var(--lb-card);overflow:hidden}
.lb3-panel-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;padding:1rem 1.25rem;border-bottom:1px solid var(--lb-line)}
.lb3-search{display:flex;align-items:center;gap:.5rem;padding:.45rem .8rem;border:1px solid var(--lb-line);border-radius:9999px;background:rgba(255,255,255,.03);color:var(--mute);transition:border-color .2s,box-shadow .2s,width .3s}
.lb3-search:focus-within{border-color:var(--lb-gold);box-shadow:0 0 0 3px var(--lb-gold-soft)}
.lb3-search input{background:transparent;outline:none;border:0;font-size:.8rem;color:#fff;width:9.5rem;transition:width .3s}
.lb3-search:focus-within input{width:12.5rem}
.lb3-list{list-style:none;margin:0;padding:.5rem}
.lb3-row{display:flex;align-items:flex-start;gap:.8rem;padding:.8rem .75rem;border-radius:.9rem;position:relative;transition:background .25s,transform .25s}
.lb3-row+.lb3-row{border-top:1px solid rgba(255,255,255,.04)}
.lb3-row::before{content:"";position:absolute;left:0;top:18%;bottom:18%;width:3px;border-radius:9999px;background:var(--lb-gold);transform:scaleY(0);transition:transform .25s}
.lb3-row:hover{background:rgba(255,255,255,.03);transform:translateX(4px)}
.lb3-row:hover::before{transform:scaleY(1)}
.lb3-row-rank{width:1.75rem;padding-top:.55rem;text-align:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;color:var(--mute);font-variant-numeric:tabular-nums}
.lb3-row-value{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.9rem;font-variant-numeric:tabular-nums}
.lb3-bar{height:5px;margin-top:.5rem;border-radius:9999px;background:rgba(255,255,255,.06);overflow:hidden}
.lb3-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#9a7a3c,var(--lb-gold));transition:width 1.1s cubic-bezier(.2,.8,.2,1) calc(var(--rd,0ms) + 150ms)}
.lb3-row:hover .lb3-bar span{box-shadow:0 0 12px rgba(231,189,109,.7)}

/* avatar */
.lb3-avatar{position:relative;display:flex;flex-shrink:0;align-items:center;justify-content:center;overflow:hidden;border-radius:9999px;background:#14233a;color:#b7cde9;font-weight:700}
.lb3-avatar-sm{width:2.5rem;height:2.5rem;font-size:.9rem}
.lb3-avatar-lg{width:4rem;height:4rem;font-size:1.5rem}
@media (min-width:640px){
  .lb3-podium{gap:1rem}
  .lb3-avatar-lg{width:5.25rem;height:5.25rem;font-size:1.9rem}
  .lb3-col-name{font-size:.95rem}
  .lb3-stage{padding:3.5rem 2rem 0}
}

/* motion (skipped entirely for reduced-motion visitors) */
@media (prefers-reduced-motion:no-preference){
  .lb3-title{animation:lb3-sheen 6s ease-in-out infinite alternate}
  .lb3-beam{animation:lb3-sweep 7s ease-in-out infinite alternate}
  .lb3-col-head{animation:lb3-drop .7s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:calc(var(--d) + 350ms)}
  .lb3-plinth{animation:lb3-rise .85s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d)}
  .lb3-shine{animation:lb3-shine 3.8s ease-in-out infinite;animation-delay:calc(var(--d) + 1.4s)}
  .lb3-crown{animation:lb3-float 3s ease-in-out infinite}
  .lb3-ring::before{animation:lb3-spin 6s linear infinite}
  .lb3-spark{animation:lb3-twinkle 3.5s ease-in-out infinite}
  .lb3-row{opacity:0;transform:translateY(14px)}
  .lb3-row.is-in{opacity:1;transform:none;transition:opacity .5s ease var(--rd,0ms),transform .5s cubic-bezier(.2,.8,.2,1) var(--rd,0ms),background .25s}
  .lb3-row.is-in:hover{transform:translateX(4px);transition-delay:0ms}
  @keyframes lb3-sheen{to{background-position:100% 0}}
  @keyframes lb3-sweep{from{transform:translateX(-50%) rotate(-5deg)}to{transform:translateX(-50%) rotate(5deg)}}
  @keyframes lb3-rise{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
  @keyframes lb3-drop{from{transform:translateY(-28px);opacity:0}to{transform:none;opacity:1}}
  @keyframes lb3-shine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
  @keyframes lb3-float{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-6px) rotate(4deg)}}
  @keyframes lb3-spin{to{transform:rotate(360deg)}}
  @keyframes lb3-twinkle{0%,100%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(.4)}50%{opacity:1;transform:translate(var(--sx),calc(var(--sy) - 8px)) scale(1)}}
}
`;
