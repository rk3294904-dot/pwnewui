"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { GlassButton, GlassCard } from "./glass";

type Test = { id: string; name: string; totalQuestions: number; marks: number; duration: string };
type Question = { id: string; text: string; options: string[]; answer?: number };

export function TestRunner({ test, onClose }: { test: Test; onClose: () => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    fetch(`/api/tests/${encodeURIComponent(test.id)}`).then((response) => response.json()).then((data) => setQuestions(data?.questions ?? [])).catch(() => setQuestions([]));
  }, [test.id]);

  const question = questions?.[current];
  const answered = question ? answers[question.id] !== undefined : false;
  const score = questions?.filter((item) => item.answer !== undefined && answers[item.id] === item.answer).length ?? 0;

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#060b14]/95 p-4 backdrop-blur-md sm:p-8">
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Test mode</p><h1 className="mt-1 text-xl font-extrabold sm:text-2xl">{test.name}</h1></div><button type="button" onClick={onClose} aria-label="Close test" className="rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-white"><X size={20} /></button></div>
      {questions === null ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin" /></div> : questions.length === 0 ? <GlassCard hover={false} className="p-8 text-center"><h2 className="text-lg font-bold">Questions are not available yet</h2><p className="mt-2 text-sm text-muted-foreground">This test is listed, but its question paper could not be loaded.</p><GlassButton variant="glass" className="mt-5" onClick={onClose}>Back to tests</GlassButton></GlassCard> : <GlassCard hover={false} className="p-5 sm:p-8"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Question {current + 1} of {questions.length}</span><span>{score} correct</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e7bd6d] transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} /></div><h2 className="mt-8 text-lg font-bold leading-7 sm:text-xl">{question?.text}</h2><div className="mt-6 grid gap-3">{question?.options.map((option, index) => <button key={option} type="button" onClick={() => setAnswers((old) => ({ ...old, [question.id]: index }))} className={`rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${answers[question.id] === index ? "border-amber-200/60 bg-amber-200/15" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"}`}><span className="mr-3 font-bold text-muted-foreground">{String.fromCharCode(65 + index)}.</span>{option}</button>)}</div><div className="mt-8 flex justify-between gap-3"><GlassButton variant="glass" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}><ChevronLeft size={15} /> Previous</GlassButton>{current === questions.length - 1 ? <GlassButton variant="gold" onClick={onClose} disabled={!answered}><CheckCircle2 size={15} /> Finish test</GlassButton> : <GlassButton variant="gold" onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))} disabled={!answered}>Next <ChevronRight size={15} /></GlassButton>}</div></GlassCard>}
    </div>
  </div>;
}
