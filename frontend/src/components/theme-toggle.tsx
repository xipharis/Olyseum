"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "osyleum-theme";
type Theme = "light" | "dark";

const systemTheme = (): Theme => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Light / dark switch. Starts from the saved choice, else the system setting, and remembers a pick. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>();
  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setTheme(saved === "light" || saved === "dark" ? saved : systemTheme());
    // Without a saved pick, keep following the system as it changes.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => { if (!document.documentElement.dataset.theme) setTheme(systemTheme()); };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice lasts this page only */ }
    setTheme(next);
  };
  const dark = theme === "dark";
  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel text-fg-2 transition-colors hover:bg-hover hover:text-fg">
      {theme === undefined ? <span className="h-4 w-4" aria-hidden /> : dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
