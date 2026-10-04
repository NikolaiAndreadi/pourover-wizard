import { useCallback, useEffect, useState } from "react";
import { createThemeMemory, type ThemePreference } from "@/platform/theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];
const memory = createThemeMemory();
export interface ThemeModel {
  theme: ThemePreference;
  cycleTheme(): void;
}
export function useTheme(): ThemeModel {
  const [theme, setTheme] = useState<ThemePreference>(() => memory.load());
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const paint = () => {
      const isDark = theme === "dark" || (theme === "system" && dark.matches);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", isDark ? "#20251f" : "#f6f3ed");
    };
    paint();
    dark.addEventListener("change", paint);
    return () => dark.removeEventListener("change", paint);
  }, [theme]);
  const cycleTheme = useCallback(() => {
    setTheme((current) => {
      const next =
        ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";
      memory.save(next);
      return next;
    });
  }, []);
  return { theme, cycleTheme };
}
