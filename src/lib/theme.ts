export type Theme = "light" | "dark";

const STORAGE_KEY = "family-finance-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    return "light";
  }
  return "light";
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable inside embedded mobile previews.
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
}
