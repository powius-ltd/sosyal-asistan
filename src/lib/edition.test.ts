import { describe, expect, it } from "vitest";

import { isCopyEdition, panelEdition } from "@/lib/edition";

describe("panelEdition", () => {
  it("tanımsızken saas", () => {
    expect(panelEdition(undefined)).toBe("saas");
  });
  it("yalnız `kopya` kopya sürümüdür", () => {
    expect(panelEdition("kopya")).toBe("kopya");
    expect(panelEdition(" kopya ")).toBe("kopya");
    expect(isCopyEdition("kopya")).toBe(true);
  });
  it("başka her değer saas", () => {
    for (const value of ["", "saas", "Kopya", "copy", "1"]) {
      expect(panelEdition(value)).toBe("saas");
      expect(isCopyEdition(value)).toBe(false);
    }
  });
  it("değer verilmezse ortam değişkenini okur", () => {
    const previous = process.env.PANEL_EDITION;
    process.env.PANEL_EDITION = "kopya";
    expect(isCopyEdition()).toBe(true);
    delete process.env.PANEL_EDITION;
    expect(isCopyEdition()).toBe(false);
    if (previous !== undefined) process.env.PANEL_EDITION = previous;
  });
});
