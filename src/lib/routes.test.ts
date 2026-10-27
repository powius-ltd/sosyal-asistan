import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ANATOMY_VIDEO_PARAM, anatomyFor, API_ROUTES, JOBS_STATUS_ID_PARAM, jobsStatusUrl, ROUTES } from "@/lib/routes";

describe("ROUTES ↔ scripts/smoke-routes.mjs", () => {
  it("duman testinin statik rota listesi ROUTES'taki statik yollarla birebir aynı (mjs TS içe aktaramaz: iki liste elle senkron)", () => {
    const smoke = readFileSync(fileURLToPath(new URL("../../scripts/smoke-routes.mjs", import.meta.url)), "utf8");
    const block = /const STATIC_ROUTES = \[([\s\S]*?)\];/.exec(smoke)?.[1];
    if (block === undefined) throw new Error("smoke-routes.mjs içinde STATIC_ROUTES bulunamadı");
    const listed = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    // `video` bir işlevdir (dinamik yol); yalnız statik (metin) yollar smoke listesinde olur.
    const declared = Object.values(ROUTES)
      .flatMap((value) => (typeof value === "string" ? [value] : []))
      .sort();
    expect(listed).toEqual(declared);
  });

  it("yeni rotalar: /bu-hafta, /rakipler/karsilastirma ve /anatomi", () => {
    expect(ROUTES.thisWeek).toBe("/bu-hafta");
    expect(ROUTES.comparison).toBe("/rakipler/karsilastirma");
    expect(ROUTES.anatomy).toBe("/anatomi");
  });

  it("API yolları ROUTES'tan ayrı (duman testi yalnız sayfalara GET atar)", () => {
    expect(API_ROUTES.chat).toBe("/api/sohbet");
    expect(API_ROUTES.jobs).toBe("/api/isler");
    for (const api of Object.values(API_ROUTES)) expect(Object.values(ROUTES)).not.toContain(api);
  });

  it("işler: sayfa /isler; durum ucu adresi tek yerden üretilir ve iş kimliği kodlanır", () => {
    expect(ROUTES.jobs).toBe("/isler");
    expect(JOBS_STATUS_ID_PARAM).toBe("id");
    expect(jobsStatusUrl()).toBe("/api/isler");
    expect(jobsStatusUrl("")).toBe("/api/isler");
    expect(jobsStatusUrl("job_01")).toBe("/api/isler?id=job_01");
    expect(jobsStatusUrl("a b&c")).toBe("/api/isler?id=a+b%26c");
  });

  it("anatomyFor: video parametresi tek yerden üretilir ve kodlanır", () => {
    expect(ANATOMY_VIDEO_PARAM).toBe("video");
    expect(anatomyFor()).toBe("/anatomi");
    expect(anatomyFor("")).toBe("/anatomi");
    expect(anatomyFor("ci_001")).toBe("/anatomi?video=ci_001");
    expect(anatomyFor("a b&c")).toBe("/anatomi?video=a+b%26c");
  });
});
