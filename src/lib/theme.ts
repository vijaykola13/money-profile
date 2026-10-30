import * as React from "react";

// Day and night mode. The choice is a device preference (not tied to an account); with no choice it follows the system.
const KEY = "theme.v1";

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function stored(): "light" | "dark" | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark"));

  // Follow the system until the user picks a side.
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (stored()) return;
      apply(media.matches);
      setDark(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = React.useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    apply(next);
    setDark(next);
    try {
      window.localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* blocked storage: the choice lasts for this visit only */
    }
  }, []);

  return { dark, toggle, followsSystem: stored() === null && systemDark() === dark };
}
