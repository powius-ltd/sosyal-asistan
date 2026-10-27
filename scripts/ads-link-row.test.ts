import { describe, expect, it } from "vitest";

import { parseAdsArgs } from "./ads-args";
import { buildLinkRow, linkProblem, type LinkCommand } from "./ads-link-row";

const link = (...args: string[]) => parseAdsArgs(["link", "--ad-account=act_123456", ...args]) as LinkCommand;

describe("link kaydı: hedef türü değişince karşı sütun açıkça null", () => {
  it("getiri hedefi: maliyet hedefi null", () => {
    const row = buildLinkRow(link("--goal=value", "--result=satın alma", "--target=2"), "w");
    expect(row).toMatchObject({ goal_kind: "value", target_return: 2, target_cost_per_result: null, result_label: "satın alma" });
    expect(row).not.toHaveProperty("gross_margin");
  });
  it("maliyet hedefi: getiri hedefi ve marj null (value → cost geçişi eski değeri bırakmaz)", () => {
    const row = buildLinkRow(link("--goal=cost", "--result=form", "--target=30"), "w");
    expect(row).toMatchObject({ goal_kind: "cost", target_cost_per_result: 30, target_return: null, gross_margin: null });
  });
  it("marj: değer yazılır, none null yazar, bayrak yoksa dokunulmaz", () => {
    expect(buildLinkRow(link("--goal=value", "--result=x", "--target=2", "--margin=0.35"), "w")).toMatchObject({ gross_margin: 0.35 });
    expect(buildLinkRow(link("--margin=none"), "w")).toMatchObject({ gross_margin: null });
    expect(buildLinkRow(link("--currency=try"), "w")).not.toHaveProperty("gross_margin");
    expect(buildLinkRow(link("--currency=try"), "w")).not.toHaveProperty("goal_kind");
  });
  it("hedefsiz çağrı hedef sütunlarına dokunmaz; kimlik alanları dolu", () => {
    const row = buildLinkRow(link("--zernio-account=z1"), "ws");
    expect(row).toEqual({ workspace_id: "ws", provider: "zernio", external_account_id: "act_123456", provider_account_id: "z1" });
  });
});

describe("link ön kontrolü", () => {
  it("yeni hesapta para birimi şart; kayıtlı para birimi değişmez", () => {
    expect(linkProblem(link(), null)).toMatch(/--currency/);
    expect(linkProblem(link("--currency=TRY"), null)).toBeUndefined();
    expect(linkProblem(link("--currency=USD"), { currency: "TRY", goal_kind: null })).toMatch(/TRY/);
    expect(linkProblem(link("--currency=TRY"), { currency: "TRY", goal_kind: null })).toBeUndefined();
  });
  it("hedefsiz --margin yalnız getiri hedefli kayıtlı hesapta", () => {
    expect(linkProblem(link("--margin=0.4"), { currency: "TRY", goal_kind: "cost" })).toMatch(/getiri hedefi/);
    expect(linkProblem(link("--margin=0.4"), { currency: "TRY", goal_kind: null })).toMatch(/getiri hedefi/);
    expect(linkProblem(link("--margin=0.4", "--currency=TRY"), null)).toMatch(/getiri hedefi/);
    expect(linkProblem(link("--margin=0.4"), { currency: "TRY", goal_kind: "value" })).toBeUndefined();
    expect(linkProblem(link("--margin=none"), { currency: "TRY", goal_kind: "cost" })).toBeUndefined();
    expect(linkProblem(link("--goal=value", "--result=x", "--target=2", "--margin=0.4", "--currency=TRY"), null)).toBeUndefined();
  });
});
