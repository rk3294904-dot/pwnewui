"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Clock, Crown, FileText, RefreshCw, Search, Trophy, Users } from "lucide-react";
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

function Avatar({ entry, size }: { entry: LeaderboardEntry; size: "sm" | "lg" }) {
  return (
    <span className={cn("lb2-avatar", size === "lg" ? "lb2-avatar-lg" : "lb2-avatar-sm")}>
      {entry.photoURL ? (
        <SafeImage src={entry.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        (entry.displayName?.trim().slice(0, 1) || "L").toUpperCase()
      )}
    </span>
  );
}

function PodiumColumn({ entry, top }: { entry: LeaderboardEntry; top: number }) {
  const name = entry.displayName || "Learner";
  const labels = ["Champion", "Runner-up", "Third place"];
  return (
    <article className={cn("lb2-col", `lb2-col-${entry.rank}`)} aria-label={`Rank ${entry.rank}: ${name}`}>
      <div className="lb2-col-head">
        {entry.rank === 1 && <Crown size={22} className="lb2-crown" aria-hidden="true" />}
        <div className="lb2-ring">
          <Avatar entry={entry} size="lg" />
        </div>
        <p className="lb2-col-name" title={name}>{name}</p>
        <p className="lb2-col-label">{labels[entry.rank - 1]}</p>
      </div>
      <div className="lb2-plinth">
        <span className="lb2-plinth-rank" aria-hidden="true">{entry.rank}</span>
        <p className="lb2-plinth-score">{hasScore(entry) ? (entry.legacy ? num.format(score(entry)) : duration(score(entry))) : "—"}</p>
        <p className="lb2-plinth-sub">
          {entry.legacy ? "Learning points" : entry.hasPdfs ? `${num.format(entry.pdfsOpened)} PDFs opened` : "PDFs not recorded"}
        </p>
        {entry.rank > 1 && top > 0 && hasScore(entry) && (
          <p className="lb2-plinth-gap">{num.format(Math.max(top - score(entry), 0))} {unit(entry.legacy)} behind #1</p>
        )}
      </div>
    </article>
  );
}

function Row({ entry, entries }: { entry: LeaderboardEntry; entries: LeaderboardEntry[] }) {
  const top = entries[0] ? score(entries[0]) : 0;
  const ahead = entries[entry.rank - 2];
  const pct = top > 0 && hasScore(entry) ? Math.max((score(entry) / top) * 100, 2) : 0;
  const gap = ahead && hasScore(entry) ? Math.max(score(ahead) - score(entry), 0) : 0;

  return (
    <li className="lb2-row">
      <span className="lb2-row-rank">{entry.rank}</span>
      <Avatar entry={entry} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold">{entry.displayName || "Learner"}</p>
          <p className="lb2-row-value shrink-0">
            {hasScore(entry) ? (entry.legacy ? `${num.format(score(entry))} pts` : duration(score(entry))) : "No activity yet"}
          </p>
        </div>
        <div className="lb2-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
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
    learners: entries.length,
    minutes: entries.reduce((s, e) => s + (e.legacy ? 0 : e.lectureMinutesWatched), 0),
    pdfs: entries.reduce((s, e) => s + (e.legacy ? 0 : e.pdfsOpened), 0),
  }), [entries]);

  const q = query.trim().toLowerCase();
  const list = q
    ? entries.filter((e) => (e.displayName || "learner").toLowerCase().includes(q))
    : entries.slice(3);
  const shown = list.slice(0, visible);

  return (
    <main className="lb2-page min-w-0 flex-1 px-3 pb-16 sm:px-8 lg:px-12">
      <style>{css}</style>
      <div className="mx-auto max-w-5xl pt-6 sm:pt-10">
        <GlassButton variant="glass" size="sm" onClick={back}><ArrowLeft size={15} /> Back</GlassButton>

        <header className="lb2-hero">
          <div>
            <h1 className="lb2-title">Leaderboard</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Ranked by lecture minutes watched, then PDFs opened. Every lecture you finish moves you up.
            </p>
          </div>
          {!loading && !failed && entries.length > 0 && (
            <dl className="lb2-stats">
              <div><dt><Users size={13} aria-hidden="true" /> Learners</dt><dd>{num.format(totals.learners)}</dd></div>
              {!legacy && <div><dt><Clock size={13} aria-hidden="true" /> Watched</dt><dd>{duration(totals.minutes)}</dd></div>}
              {!legacy && <div><dt><FileText size={13} aria-hidden="true" /> PDFs opened</dt><dd>{num.format(totals.pdfs)}</dd></div>}
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
          <section role="alert" className="lb2-panel px-6 py-14 text-center">
            <RefreshCw size={26} className="mx-auto text-[var(--lb-gold)]" />
            <h2 className="mt-5 text-xl font-bold">Leaderboard didn’t load</h2>
            <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again.</p>
            <GlassButton variant="glass" className="mt-6" onClick={() => { setLoading(true); setFailed(false); setAttempt((v) => v + 1); }}>Reload leaderboard</GlassButton>
          </section>
        ) : entries.length === 0 ? (
          <section className="lb2-panel px-6 py-14 text-center">
            <Trophy size={36} className="mx-auto text-[var(--lb-gold)]" />
            <h2 className="mt-5 text-2xl font-extrabold">No rankings yet</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              Sign in and watch a lecture to take the first place on the podium.
            </p>
            <GlassButton variant="gold" className="mt-6" onClick={() => navigate({ view: "home" })}>Browse lectures <ArrowUpRight size={16} /></GlassButton>
          </section>
        ) : (
          <>
            {!q && podium.length > 0 && (
              <section aria-label="Top three learners" className="lb2-stage">
                <div className="lb2-podium">
                  {podium.map((e) => <PodiumColumn key={e.id} entry={e} top={top} />)}
                </div>
              </section>
            )}

            {(list.length > 0 || q) && (
              <section className="lb2-panel mt-6" aria-labelledby="lb2-all">
                <div className="lb2-panel-head">
                  <h2 id="lb2-all" className="text-base font-bold">{q ? "Search results" : "Everyone else"}</h2>
                  <label className="lb2-search">
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
                  <ol className="lb2-list">{shown.map((e) => <Row key={e.id} entry={e} entries={entries} />)}</ol>
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

.lb2-page{
  --lb-gold:#e7bd6d; --lb-gold-soft:rgba(231,189,109,.14);
  --lb-silver:#aebbd0; --lb-bronze:#d49a76;
  --lb-ink:#0b1626; --lb-card:#101f36; --lb-line:rgba(255,255,255,.08);
}
.lb2-title{
  font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;
  font-weight:800; letter-spacing:-.035em; line-height:.95;
  font-size:clamp(3rem,9vw,6rem);
  background:linear-gradient(180deg,#fff 30%,#9fb4d1);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.lb2-hero{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1.75rem;padding:2.5rem 0 2rem}
.lb2-stats{display:flex;gap:.75rem;margin:0}
.lb2-stats>div{min-width:6.5rem;padding:.7rem .95rem;border:1px solid var(--lb-line);border-radius:.9rem;background:rgba(255,255,255,.025)}
.lb2-stats dt{display:flex;align-items:center;gap:.35rem;font-size:11px;color:var(--muted-foreground,#8da2bf)}
.lb2-stats dd{margin:.25rem 0 0;font-family:'Bricolage Grotesque',ui-sans-serif,sans-serif;font-weight:700;font-size:1.35rem;letter-spacing:-.02em}

/* podium */
.lb2-stage{
  position:relative;padding:2.5rem .75rem 0;border-radius:1.5rem;overflow:hidden;
  border:1px solid var(--lb-line);
  background:
    radial-gradient(60% 70% at 50% 0%,rgba(231,189,109,.16),transparent 70%),
    linear-gradient(180deg,#0f1d33,#0b1626);
}
.lb2-podium{display:flex;align-items:flex-end;justify-content:center;gap:.5rem;max-width:44rem;margin:0 auto}
.lb2-col{display:flex;flex:1 1 0;min-width:0;flex-direction:column;align-items:center}
.lb2-col-head{display:flex;flex-direction:column;align-items:center;width:100%;padding:0 .25rem 1rem;position:relative}
.lb2-crown{color:var(--lb-gold);margin-bottom:.35rem;filter:drop-shadow(0 0 10px rgba(231,189,109,.55))}
.lb2-ring{padding:4px;border-radius:9999px;border:2px solid currentColor}
.lb2-col-1{color:var(--lb-gold)} .lb2-col-2{color:var(--lb-silver)} .lb2-col-3{color:var(--lb-bronze)}
.lb2-col-1 .lb2-ring{box-shadow:0 0 0 6px var(--lb-gold-soft),0 0 40px rgba(231,189,109,.35)}
.lb2-col-name{margin-top:.75rem;width:100%;text-align:center;color:#fff;font-weight:700;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb2-col-label{font-size:11px;color:currentColor;opacity:.9;margin-top:.15rem}
.lb2-plinth{
  position:relative;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
  padding:1.1rem .5rem 1.25rem;text-align:center;color:#fff;
  border-radius:1rem 1rem 0 0;border:1px solid var(--lb-line);border-bottom:0;
  background:linear-gradient(180deg,color-mix(in srgb,currentColor 22%,#13243d),#0e1c31 85%);
  box-shadow:inset 0 2px 0 currentColor;
  transform-origin:bottom;
}
.lb2-col-1 .lb2-plinth{min-height:15rem} .lb2-col-2 .lb2-plinth{min-height:11.5rem} .lb2-col-3 .lb2-plinth{min-height:9.5rem}
.lb2-plinth-rank{position:absolute;right:.6rem;bottom:.2rem;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:5rem;line-height:1;color:currentColor;opacity:.12;pointer-events:none}
.lb2-col-1 .lb2-plinth-rank{font-size:7rem}
.lb2-plinth-score{font-family:'Bricolage Grotesque',ui-sans-serif,sans-serif;font-weight:800;letter-spacing:-.03em;font-size:1.5rem;line-height:1.1}
.lb2-col-1 .lb2-plinth-score{font-size:2rem}
.lb2-plinth-sub{margin-top:.35rem;font-size:11px;color:var(--muted-foreground,#8da2bf)}
.lb2-plinth-gap{margin-top:.35rem;font-size:10px;color:var(--muted-foreground,#8da2bf);opacity:.85}

/* list */
.lb2-panel{border:1px solid var(--lb-line);border-radius:1.25rem;background:var(--lb-card);overflow:hidden}
.lb2-panel-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;padding:1rem 1.25rem;border-bottom:1px solid var(--lb-line)}
.lb2-search{display:flex;align-items:center;gap:.5rem;padding:.45rem .8rem;border:1px solid var(--lb-line);border-radius:9999px;background:rgba(255,255,255,.03);color:var(--muted-foreground,#8da2bf)}
.lb2-search:focus-within{border-color:var(--lb-gold);box-shadow:0 0 0 3px var(--lb-gold-soft)}
.lb2-search input{background:transparent;outline:none;border:0;font-size:.8rem;color:#fff;width:9.5rem}
.lb2-list{list-style:none;margin:0;padding:.5rem}
.lb2-row{display:flex;align-items:flex-start;gap:.8rem;padding:.8rem .75rem;border-radius:.9rem}
.lb2-row+.lb2-row{border-top:1px solid rgba(255,255,255,.04)}
.lb2-row:hover{background:rgba(255,255,255,.025)}
.lb2-row-rank{width:1.75rem;padding-top:.55rem;text-align:center;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.95rem;color:var(--muted-foreground,#8da2bf);font-variant-numeric:tabular-nums}
.lb2-row-value{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:.9rem;font-variant-numeric:tabular-nums}
.lb2-bar{height:5px;margin-top:.5rem;border-radius:9999px;background:rgba(255,255,255,.06);overflow:hidden}
.lb2-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#9a7a3c,var(--lb-gold))}

/* avatar */
.lb2-avatar{position:relative;display:flex;flex-shrink:0;align-items:center;justify-content:center;overflow:hidden;border-radius:9999px;background:#14233a;color:#b7cde9;font-weight:700}
.lb2-avatar-sm{width:2.5rem;height:2.5rem;font-size:.9rem}
.lb2-avatar-lg{width:4rem;height:4rem;font-size:1.5rem}
@media (min-width:640px){
  .lb2-podium{gap:1rem}
  .lb2-avatar-lg{width:5.25rem;height:5.25rem;font-size:1.9rem}
  .lb2-col-name{font-size:.95rem}
  .lb2-stage{padding:3rem 2rem 0}
}

/* one orchestrated moment: plinths rise once on load */
@media (prefers-reduced-motion:no-preference){
  .lb2-plinth{animation:lb2-rise .8s cubic-bezier(.2,.8,.2,1) both}
  .lb2-col-2 .lb2-plinth{animation-delay:.05s} .lb2-col-3 .lb2-plinth{animation-delay:.12s} .lb2-col-1 .lb2-plinth{animation-delay:.2s}
  @keyframes lb2-rise{from{transform:scaleY(.35);opacity:0}to{transform:scaleY(1);opacity:1}}
}
`;
