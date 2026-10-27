import { describe, expect, it } from "vitest";

import { createCallBudget, DEFAULT_MAX_AGY_CALLS, readMaxAgyCalls, runBudgetedQueue } from "@/lib/intel/call-budget";

describe("readMaxAgyCalls", () => {
  it("varsayılan 40; geçerli pozitif tam sayı okunur; bozuk değer varsayılana döner", () => {
    expect(readMaxAgyCalls({})).toBe(DEFAULT_MAX_AGY_CALLS);
    expect(readMaxAgyCalls({ AGY_MAX_CALLS_PER_RUN: "12" })).toBe(12);
    for (const bad of ["", "0", "-3", "abc", "2.5"]) expect(readMaxAgyCalls({ AGY_MAX_CALLS_PER_RUN: bad })).toBe(DEFAULT_MAX_AGY_CALLS);
  });
});

describe("runBudgetedQueue", () => {
  it("çağrı sayacı tavana ulaşınca yeni iş başlamaz, kalanlar atlanır", async () => {
    const budget = createCallBudget(3);
    const started: number[] = [];
    const outcome = await runBudgetedQueue([1, 2, 3, 4, 5], budget, async (n) => {
      started.push(n);
      return { result: n, calls: 2 }; // her iş 2 çağrı
    }, 1);
    expect(started).toEqual([1, 2]); // 0→2 (<3 başlar) →4 (≥3 durur)
    expect(outcome.done.map((d) => d.item)).toEqual([1, 2]);
    expect(outcome.skipped).toEqual([3, 4, 5]);
    expect(budget.used).toBe(4);
  });

  it("en çok `concurrency` iş eşzamanlı çalışır", async () => {
    let running = 0;
    let peak = 0;
    const outcome = await runBudgetedQueue([1, 2, 3, 4, 5, 6], createCallBudget(100), async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return { result: n, calls: 1 };
    }, 2);
    expect(peak).toBe(2);
    expect(outcome.done.map((d) => d.item)).toEqual([1, 2, 3, 4, 5, 6]); // girdi sırası korunur
  });

  it("iş fırlatırsa hata yukarı gider (yazma hatası yutulmaz)", async () => {
    await expect(runBudgetedQueue([1], createCallBudget(5), async () => Promise.reject(new Error("yazılamadı")))).rejects.toThrow("yazılamadı");
  });

  it("bir iş hata verince kuyruk durur: diğer işçi yeni iş almaz, yoldaki iş biter, sonra hata yukarı gider", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const run = runBudgetedQueue([1, 2, 3, 4, 5, 6], createCallBudget(100), async (n) => {
      started.push(n);
      if (n === 1) throw new Error("yazılamadı");
      await new Promise((resolve) => setTimeout(resolve, 30));
      finished.push(n);
      return { result: n, calls: 1 };
    }, 2);
    await expect(run).rejects.toThrow("yazılamadı");
    expect(started).toEqual([1, 2]); // 3+ hiç başlamadı
    expect(finished).toEqual([2]); // yoldaki iş hata yukarı gitmeden ÖNCE bitti
  });

  it("halt sonrası kalan işler başlamaz (kota dolu / arka uç yok)", async () => {
    const budget = createCallBudget(100);
    const outcome = await runBudgetedQueue([1, 2, 3], budget, async (n) => {
      if (n === 1) budget.halt();
      return { result: n, calls: 1 };
    }, 1);
    expect(outcome.done.map((d) => d.item)).toEqual([1]);
    expect(outcome.skipped).toEqual([2, 3]);
    expect(budget.halted).toBe(true);
  });

  it("negatif/ondalık çağrı sayısı sayacı bozmaz", () => {
    const budget = createCallBudget(10);
    budget.add(-4);
    budget.add(2.9);
    expect(budget.used).toBe(2);
  });
});
