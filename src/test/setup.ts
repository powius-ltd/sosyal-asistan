import { afterEach } from "vitest";

// Bileşen testleri (jsdom) için: jest-dom eşleştiricileri + her testten sonra
// DOM temizliği + jsdom eksiklerinin TEK yamaları. Node ortamındaki testlerde hiçbir şey yapmaz.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup, configure } = await import("@testing-library/react");
  afterEach(() => cleanup());

  // `waitFor`/`findBy*` varsayılanı 1 sn: dialog/popover açan bileşen testleri yoğun makinede (tam süit) yalancı hata verir.
  // Test başına süre sınırı `vitest.config.mts`'te (`testTimeout`).
  configure({ asyncUtilTimeout: 5_000 });

  // jsdom 26'da `PointerEvent` yok; Base UI `Switch`/`Select`/`Checkbox` tıklamada onu kurar ve "is not a constructor"
  // ile düşer. Tarayıcılarda sorun yoktur. Bileşen testleri kendi yamasını YAZMAZ, bu yama herkese uygulanır.
  const win = document.defaultView as (Window & typeof globalThis) | null;
  if (win && typeof win.PointerEvent === "undefined") {
    class PointerEventPolyfill extends win.MouseEvent {}
    win.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
    globalThis.PointerEvent = win.PointerEvent;
  }
}
