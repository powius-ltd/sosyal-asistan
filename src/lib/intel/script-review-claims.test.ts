import { describe, expect, it } from "vitest";

import type { ScriptReview } from "@/lib/domain/script-review";
import { claimsStillInHooksOrOutline, correctedFactLines, wrongClaimsOf } from "@/lib/intel/script-review-claims";

const review = (claims: ScriptReview["claims"]): ScriptReview => ({ revised: true, changes: [], claims, corrections: claims.length, verifyBeforePublish: [], promptVersion: "v" });
const wrong = { text: "İstanbul 1452 yılında fethedildi", verdict: "wrong" as const, note: "Doğrusu 1453." };
const ok = { text: "Surlar hâlâ ayakta", verdict: "ok" as const, note: "Doğru." };

describe("script-review-claims", () => {
  it("yalnız wrong iddialar 'Düzeltilen olgu: <eski> → <not>' satırı olur", () => {
    expect(wrongClaimsOf(review([wrong, ok]))).toEqual([wrong]);
    expect(correctedFactLines(review([wrong, ok]))).toEqual(['Düzeltilen olgu: "İstanbul 1452 yılında fethedildi" → Doğrusu 1453.']);
    expect(correctedFactLines(review([ok]))).toEqual([]);
  });

  it("yanlış iddia hook'ta ya da adımlarda geçiyorsa işaretlenir: birebir parça, ortak kelime dizisi ya da aynı yıl", () => {
    const r = review([wrong, ok]);
    expect(claimsStillInHooksOrOutline(r, ["Biliyor muydun? İstanbul 1452 yılında fethedildi!", "b", "c"], [])).toEqual([wrong.text]);
    expect(claimsStillInHooksOrOutline(r, ["x", "y", "z"], ["Sahne 2: İstanbul 1452 yılında kuşatıldı"])).toEqual([wrong.text]);
    expect(claimsStillInHooksOrOutline(r, ["Tarih 1452 ile başlar"], [])).toEqual([wrong.text]);
  });

  it("geçmiyorsa ya da iddia ok ise işaret yok (1452, 14520 ile karışmaz)", () => {
    const r = review([wrong, ok]);
    expect(claimsStillInHooksOrOutline(r, ["Erteleme hakkında", "Surlar hâlâ ayakta"], ["Sahne 1: sorular", "Sahne 2: 14520 sayısı"])).toEqual([]);
    expect(claimsStillInHooksOrOutline(review([ok]), ["Surlar hâlâ ayakta"], [])).toEqual([]);
  });
});
