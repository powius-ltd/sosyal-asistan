import { describe, expect, it } from "vitest";

import { agentBudget, canAfford, DISCOVER_ESTIMATE_USD, estimateAgentStepUsd, estimateCollectUsd } from "@/lib/agents/director/budget";

describe("agentBudget", () => {
  it("tavan onaysızken kalan hak 0 ve harcatmaz", () => {
    const budget = agentBudget({ spentUsd: 0 });
    expect(budget).toEqual({ approved: false, spentUsd: 0, remainingUsd: 0 });
    expect(canAfford(budget, 0.01)).toBe(false);
  });

  it("kalan = tavan − harcanan; aşım 0'a iner (eksiye düşmez)", () => {
    expect(agentBudget({ capUsd: 3, spentUsd: 1.25 }).remainingUsd).toBe(1.75);
    expect(agentBudget({ capUsd: 3, spentUsd: 3.5 }).remainingUsd).toBe(0);
  });

  it("kayan nokta artığı yuvarlanır", () => {
    expect(agentBudget({ capUsd: 0.3, spentUsd: 0.1 + 0.1 }).remainingUsd).toBe(0.1);
  });

  it("tavan 0 onaylıdır ama harcatmaz", () => {
    const budget = agentBudget({ capUsd: 0, spentUsd: 0 });
    expect(budget.approved).toBe(true);
    expect(canAfford(budget, 0)).toBe(false);
  });

  it("tahmin yoksa ya da kalanı aşıyorsa sığmaz; tam eşitlik sığar", () => {
    const budget = agentBudget({ capUsd: 1, spentUsd: 0.5 });
    expect(canAfford(budget, undefined)).toBe(false);
    expect(canAfford(budget, Number.NaN)).toBe(false);
    expect(canAfford(budget, 0.51)).toBe(false);
    expect(canAfford(budget, 0.5)).toBe(true);
  });
});

describe("tahmin", () => {
  it("toplama: hesap × video × yedek birim fiyat; boş girdi undefined", () => {
    expect(estimateCollectUsd({ accounts: 4, videosPerAccount: 25 })).toBe(0.5);
    expect(estimateCollectUsd({ accounts: 0, videosPerAccount: 25 })).toBeUndefined();
    expect(estimateCollectUsd({ accounts: 4, videosPerAccount: 0 })).toBeUndefined();
  });

  it("rakip bulma sabit tahmin; ücretsiz / bilinmeyen tür undefined", () => {
    const input = { accounts: 4, videosPerAccount: 25 };
    expect(estimateAgentStepUsd("discover", input)).toBe(DISCOVER_ESTIMATE_USD);
    expect(estimateAgentStepUsd("collect", input)).toBe(0.5);
    expect(estimateAgentStepUsd("analyze", input)).toBeUndefined();
  });
});
