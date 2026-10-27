import { useSyncExternalStore } from "react";

import type { ThemeChoice } from "@/lib/theme/theme-script";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const read = (): ThemeChoice => (document.documentElement.classList.contains("dark") ? "dark" : "light");

/** Sayfada o an uygulanan tema (`<html class="dark">`); sunucuda "light" (ilk çizimle uyumlu, sonra istemcide düzelir). Yalnız istemci bileşenlerinde. */
export function useColorScheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "light");
}
