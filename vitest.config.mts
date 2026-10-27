import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `import "server-only"` vitest içinde fırlatmasın (Next dışında çalışıyoruz).
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    // Varsayılan ortam node; bileşen testleri dosya başına
    // `// @vitest-environment jsdom` ile jsdom'a geçer.
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // Dialog/popover açan jsdom bileşen testleri (userEvent) yoğun makinede (tam süit) varsayılan 5 sn'yi aşabiliyor;
    // dosya başına `vi.setConfig` yerine tek genel sınır. (`waitFor` süresi `src/test/setup.ts`'te.)
    testTimeout: 20_000,
    // Paralel ajanların worktree'leri kendi dallarında test edilir.
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
    env: {
      // Tarih/saat testleri sistem TZ'sinden bağımsız olmalı; workspace
      // saat dilimi (Europe/Istanbul) testlerde açıkça verilir.
      TZ: "UTC",
    },
  },
});
