"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useApp, type ViewName } from "@/lib/store";
import { firebaseAuth, signInWithGoogle } from "@/lib/firebase";
import {
  Trophy,
  LogIn,
  BookOpen,
  GraduationCap,
  Menu,
  X,
  Home,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  view: ViewName;
  label: string;
  icon: React.ReactNode;
}

const PRIMARY_NAV: NavItem[] = [
  { view: "home", label: "Study", icon: <Home size={18} /> },
  { view: "batches", label: "Batches", icon: <BookOpen size={18} /> },
  { view: "enrolled", label: "Enrolled Batches", icon: <GraduationCap size={18} /> },
  { view: "leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
];

export function Sidebar() {
  const { view, navigate, sidebarOpen, setSidebarOpen } = useApp();
  const [user, setUser] = useState<User | null>(null);
  const [darkMode, setDarkMode] = useState(() => typeof window === "undefined" || window.localStorage.getItem("quantica-theme") !== "light");

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser), []);

  useEffect(() => {
    const saved = window.localStorage.getItem("quantica-theme");
    const dark = saved !== "light";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    window.localStorage.setItem("quantica-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
  };

  const go = (target: ViewName) => {
    navigate({ view: target });
    setSidebarOpen(false);
  };

  const isActive = (target: ViewName) => {
    if (target === "home") return view === "home";
    if (target === "batches") return view === "batches" || view === "batch" || view === "subject" || view === "topic";
    if (target === "enrolled") return view === "enrolled";
    if (target === "leaderboard") return view === "leaderboard";
    return false;
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex h-14 w-full max-w-[100vw] items-center gap-3 overflow-hidden px-4 sb-sidebar-surface">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="flex h-10 w-10 items-center justify-center rounded-xl btn-glass text-foreground cursor-pointer"
        >
          <Menu size={18} />
        </button>
        <button
          onClick={() => go("home")}
          className="flex min-w-0 items-center gap-2 cursor-pointer"
          aria-label="Quantica Digital home"
        >
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black">
            <img src="/logo.png" alt="Quantica Digital logo" className="h-full w-full object-cover" />
          </span>
          <span className="truncate text-sm font-extrabold tracking-[0.08em] text-gold">QUANTICA DIGITAL</span>
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed z-50 top-0 left-0 h-dvh w-72 sb-sidebar-surface flex flex-col transition-transform duration-300 ease-out",
          "lg:translate-x-0 lg:z-50 lg:h-dvh lg:w-72 lg:min-h-screen",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/8 shrink-0">
          <button
            onClick={() => go("home")}
            className="group flex min-w-0 items-center gap-2.5 cursor-pointer"
            aria-label="Quantica Digital home"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black shadow-[0_0_24px_rgba(74,158,255,0.25)] transition-shadow group-hover:shadow-[0_0_32px_rgba(74,158,255,0.45)]">
              <img src="/logo.png" alt="Quantica Digital logo" className="h-full w-full object-cover" />
            </span>
            <span className="hidden min-w-0 flex-col text-left leading-none sm:flex">
              <span className="truncate text-sm font-extrabold tracking-[0.08em] text-gold">QUANTICA DIGITAL</span>
              <span className="mt-1 text-[9px] font-semibold tracking-[0.2em] text-muted-foreground">DIGITAL LEARNING</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg btn-glass text-foreground cursor-pointer lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto sb-scroll px-3 py-4">
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Menu</p>
          <ul className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(item.view);
              return (
                <li key={item.view}>
                  <button
                    type="button"
                    onClick={() => go(item.view)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 h-11 text-sm font-semibold transition-all cursor-pointer",
                      active
                        ? "sb-nav-active text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    <span className={cn("shrink-0", active ? "text-[#7cc0ff]" : "")}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: theme + auth */}
        <div className="border-t border-white/8 px-3 py-4 space-y-2 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => go("profile")}
              aria-label="Open profile"
              title={user.displayName ?? "Your profile"}
              className="flex w-full items-center gap-3 rounded-xl px-3 h-12 text-left transition-colors hover:bg-white/5 cursor-pointer"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-bold text-foreground ring-1 ring-white/10">
                {user.photoURL ? <img src={user.photoURL} alt="" className="h-full w-full object-cover" /> : (user.displayName?.[0] ?? "U").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{user.displayName ?? "Learner"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">View profile</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="flex w-full items-center gap-3 rounded-xl px-3 h-12 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15">
                <LogIn size={15} />
              </span>
              Sign in with Google
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl px-3 h-11 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer"
            aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5">
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </span>
            {darkMode ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>
    </>
  );
}
