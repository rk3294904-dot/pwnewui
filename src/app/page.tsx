"use client";

import { useEffect } from "react";
import { useApp, bindRouter } from "@/lib/store";
import { Sidebar } from "@/components/study-bison/sidebar";
import { HomeView } from "@/components/study-bison/home-view";
import { BatchesView } from "@/components/study-bison/batches-view";
import { EnrolledView } from "@/components/study-bison/enrolled-view";
import { BatchDetail } from "@/components/study-bison/batch-detail";
import { SubjectView } from "@/components/study-bison/subject-view";
import { TopicView } from "@/components/study-bison/topic-view";
import { WatchView } from "@/components/study-bison/player-view";
import { LeaderboardView } from "@/components/study-bison/leaderboard-view";
import { ProfileView } from "@/components/study-bison/profile-view";
import { PdfViewerView } from "@/components/study-bison/pdf-viewer";
import { AuthGate } from "@/components/study-bison/auth-gate";
import { AdsSection } from "@/components/study-bison/ads-section";
import { TelegramPopup } from "@/components/study-bison/telegram-popup";

export default function Page() {
  const { view, batchId, subjectSlug, topicId, contentId } = useApp();

  // Bind hash <-> store once (also restores deep links on load)
  useEffect(() => bindRouter(), []);

  // Keep document.title in sync with the current view
  useEffect(() => {
    const base = "Quantica Digital — Learning Platform"
    const s = useApp.getState();
    const titles: Record<string, string> = {
      home: `Study · Quantica Digital`,
      batches: `Batches · Quantica Digital`,
      enrolled: `Enrolled · Quantica Digital`,
      batch: `${s.batchName ?? "Batch"} · Quantica Digital`,
      subject: `${s.subjectName ?? "Subject"} · Quantica Digital`,
      topic: `${s.topicName ?? "Chapter"} · Quantica Digital`,
      watch: `${s.lectureTitle ?? "Lecture"} · Quantica Digital`,
      leaderboard: `Leaderboard · Quantica Digital`,
      profile: `Profile · Quantica Digital`,
      pdf: `${s.lectureTitle ?? "PDF"} · Quantica Digital`,
    };
    document.title = titles[view] ?? base;
  }, [view]);

  const playerOnlyView = view === "watch" || view === "pdf";

  return (
    <AuthGate>
      <div className="flex min-h-screen w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden lg:flex-row">
        <TelegramPopup />
        {playerOnlyView ? (
          <>
            {view === "pdf" ? (
              <PdfViewerView />
            ) : view === "watch" && batchId && subjectSlug && contentId ? (
              <WatchView
                key={`${batchId}:${subjectSlug}:${contentId}`}
                batchId={batchId}
                subjectSlug={subjectSlug}
                topicId={topicId}
                contentId={contentId}
                playerOnly
              />
            ) : null}
          </>
        ) : (
          <>
            <Sidebar />
            <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden lg:ml-72">
              <AdsSection />
              <div className="min-w-0 flex-1">
                {view === "leaderboard" ? (
                  <LeaderboardView />
                ) : view === "profile" ? (
                  <ProfileView />
                ) : view === "batches" ? (
                  <BatchesView />
                ) : view === "enrolled" ? (
                  <EnrolledView />
                ) : view === "batch" && batchId ? (
                  <BatchDetail key={batchId} batchId={batchId} />
                ) : view === "subject" && batchId && subjectSlug ? (
                  <SubjectView
                    key={`${batchId}:${subjectSlug}`}
                    batchId={batchId}
                    subjectSlug={subjectSlug}
                  />
                ) : view === "topic" && batchId && subjectSlug && topicId ? (
                  <TopicView
                    key={`${batchId}:${subjectSlug}:${topicId}`}
                    batchId={batchId}
                    subjectSlug={subjectSlug}
                    topicId={topicId}
                  />
                ) : (
                  <HomeView />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AuthGate>
  );
}
