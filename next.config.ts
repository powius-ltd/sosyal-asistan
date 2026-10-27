import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Turbopack kökü: `node_modules/next`'i içeren en yakın dizin.
 *
 * Normal kurulumda bu proje dizinidir. Paralel ajanlar `.claude/worktrees/<ad>` altında
 * çalışır ve worktree'nin kendi `node_modules`'ü yoktur (ana repodakini kullanır); kök
 * worktree'ye sabitlenirse Turbopack `next/package.json`'ı bulamayıp derlemeyi reddeder.
 */
function findTurbopackRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, "node_modules", "next", "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

const nextConfig: NextConfig = {
  turbopack: {
    root: findTurbopackRoot(__dirname),
  },
  devIndicators: false,
  // Geliştirme sunucusuna laptoptan Tailscale adresiyle girilir; izin verilmezse istemci betikleri (HMR) engellenir ve düğmeler çalışmaz.
  allowedDevOrigins: [],
};

export default nextConfig;
