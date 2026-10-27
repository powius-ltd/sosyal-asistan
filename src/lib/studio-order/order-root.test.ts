import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { orderRootOf, SAAS_ORDERS_DIR } from "@/lib/studio-order/order-root";

describe("orderRootOf", () => {
  it("anahtar tanımsızken eski sabit klasör", () => {
    expect(orderRootOf({}, "/x")).toBe("/opt/panel/siparisler");
    expect(orderRootOf({ PANEL_EDITION: "saas" }, "/x")).toBe(SAAS_ORDERS_DIR);
  });
  it("kopyada repo içi siparisler/", () => {
    expect(orderRootOf({ PANEL_EDITION: "kopya" }, "/proje")).toBe(join("/proje", "siparisler"));
  });
  it("SIPARIS_KOK her ikisinde de kazanır; boşluk yok sayılır", () => {
    expect(orderRootOf({ SIPARIS_KOK: " /d/s " }, "/x")).toBe("/d/s");
    expect(orderRootOf({ SIPARIS_KOK: "/d/s", PANEL_EDITION: "kopya" }, "/x")).toBe("/d/s");
    expect(orderRootOf({ SIPARIS_KOK: "  " }, "/x")).toBe(SAAS_ORDERS_DIR);
  });
});
