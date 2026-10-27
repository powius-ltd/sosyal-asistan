import { describe, expect, it } from "vitest";

import { jobsAvailability } from "@/lib/job-control/availability";
import { jobsGate } from "@/lib/job-control/gate";

const present = { workerScriptExists: () => true };
const SUPABASE = { DATA_SOURCE: "supabase" };

describe("işler kullanılabilirliği (ortam + dosya varlığı)", () => {
  it("barındırılan ortamda (VERCEL) kapalı: veri kaynağı ve betik uygun olsa da", () => {
    expect(jobsAvailability({ env: { ...SUPABASE, VERCEL: "1" }, ...present })).toEqual({ available: false, reason: "hosted" });
  });

  it("veri kaynağı supabase değilse kapalı: boş (varsayılan örnek veri), mock ve geçersiz değer", () => {
    for (const DATA_SOURCE of [undefined, "", "mock", "uydurma"]) {
      expect(jobsAvailability({ env: { DATA_SOURCE }, ...present }), String(DATA_SOURCE)).toEqual({ available: false, reason: "data_source" });
    }
  });

  it("işçi betiği yoksa kapalı; varsa açık (boşluk / büyük harf hoş görülür)", () => {
    expect(jobsAvailability({ env: SUPABASE, workerScriptExists: () => false })).toEqual({ available: false, reason: "worker_missing" });
    expect(jobsAvailability({ env: SUPABASE, ...present })).toEqual({ available: true });
    expect(jobsAvailability({ env: { DATA_SOURCE: " Supabase " }, ...present })).toEqual({ available: true });
  });

  it("betik denetimi veri kaynağından SONRA yapılır (örnek veride diske bakılmaz)", () => {
    let looked = false;
    jobsAvailability({
      env: { DATA_SOURCE: "mock" },
      workerScriptExists: () => {
        looked = true;
        return true;
      },
    });
    expect(looked).toBe(false);
  });

  it("varsayılan denetim gerçek dosyaya bakar: depo kökünde işçi betiği var", () => {
    expect(jobsAvailability({ env: SUPABASE })).toEqual({ available: true });
  });
});

describe("iş başlatma kapısı (kullanılabilirlik + yönetici modu)", () => {
  it("ortam uygun ve yönetici modu açıkken açık (OPERATOR_MODE boş = yerelde açık)", () => {
    expect(jobsGate({ env: SUPABASE, ...present })).toEqual({ open: true });
    expect(jobsGate({ env: { ...SUPABASE, OPERATOR_MODE: "local" }, ...present })).toEqual({ open: true });
  });

  it("yönetici modu kapalıyken kapalı (müşteri görünümü)", () => {
    expect(jobsGate({ env: { ...SUPABASE, OPERATOR_MODE: "off" }, ...present })).toEqual({ open: false, reason: "operator_off" });
  });

  it("ortam uygun değilse neden kullanılabilirlikten gelir", () => {
    expect(jobsGate({ env: { ...SUPABASE, VERCEL: "1" }, ...present })).toEqual({ open: false, reason: "hosted" });
    expect(jobsGate({ env: { DATA_SOURCE: "mock" }, ...present })).toEqual({ open: false, reason: "data_source" });
    expect(jobsGate({ env: SUPABASE, workerScriptExists: () => false })).toEqual({ open: false, reason: "worker_missing" });
  });
});
