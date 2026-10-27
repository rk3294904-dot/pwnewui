"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Send } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase";
import { GlassButton } from "./glass";

const TELEGRAM_URL = "https://t.me/quanticaofficial";
const joinedKey = (uid: string) => `quantica:telegram-joined:${uid}`;

// Blocks every signed-in learner until they tap "Join".
export function TelegramPopup() {
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser);

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser), []);

  if (!user) return null;
  if (localStorage.getItem(joinedKey(user.uid))) return null;
  return <TelegramDialog key={user.uid} uid={user.uid} />;
}

function TelegramDialog({ uid }: { uid: string }) {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  const join = () => {
    localStorage.setItem(joinedKey(uid), "1");
    window.open(TELEGRAM_URL, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="telegram-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section className="glass relative w-full max-w-sm rounded-[2rem] p-7 text-center sb-fade-up">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#229ED9] text-white shadow-[0_0_35px_rgba(34,158,217,0.35)]">
          <Send size={28} />
        </div>
        <h2 id="telegram-title" className="mt-5 text-2xl font-extrabold tracking-tight">Join our Telegram</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Joining the official Quantica channel is required to get batch updates, new lectures and announcements first.
        </p>
        <GlassButton variant="gold" size="lg" className="mt-6 w-full" onClick={join}>
          <Send size={18} /> Join @quanticaofficial
        </GlassButton>
      </section>
    </div>
  );
}
