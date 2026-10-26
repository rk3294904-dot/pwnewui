import { NextRequest, NextResponse } from "next/server";
import { apiGet, TTL } from "@/lib/study-api";

type RawQuestion = { _id?: string; id?: string; question?: string; text?: string; questionText?: string; options?: string[] | { text?: string }[]; choices?: string[]; answer?: number; correctAnswer?: number };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const paths = [`/v3/test-service/tests/${encodeURIComponent(testId)}`, `/v3/test-service/test/${encodeURIComponent(testId)}`, `/v2/tests/${encodeURIComponent(testId)}`];
  for (const path of paths) {
    const response = await apiGet<unknown>(path, { ttl: TTL.misc, timeoutMs: 20000 });
    const root = response.data as { data?: unknown; questions?: unknown[] } | unknown[] | null;
    const data = Array.isArray(root) ? root : Array.isArray(root?.questions) ? root.questions : Array.isArray(root?.data) ? root.data : [];
    if (data.length) {
      const questions = (data as RawQuestion[]).map((item, index) => ({ id: item._id ?? item.id ?? String(index), text: item.question ?? item.questionText ?? item.text ?? "Question", options: (item.options ?? item.choices ?? []).map((option) => typeof option === "string" ? option : option.text ?? ""), answer: item.answer ?? item.correctAnswer })).filter((item) => item.options.length > 0);
      return NextResponse.json({ success: true, questions });
    }
  }
  return NextResponse.json({ success: true, questions: [] });
}
