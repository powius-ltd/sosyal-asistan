// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompliancePanel } from "@/components/publish/compliance-panel";
import { checkCompliance } from "@/lib/compliance";
import type { ComplianceResult } from "@/lib/domain/compliance";

const panel = () => screen.getByRole("region", { name: "Uyum denetimi" });

describe("CompliancePanel", () => {
  it("fail: 'Onaylanamaz' başlığı, her bulgu (mesaj + ipucu) ve bölge etiketi; kural kodu yalnız yönetici modunda", () => {
    const result = checkCompliance({ caption: "Merhaba", isPaidPartnership: true, isAiGenerated: true, region: "TR" });
    const { rerender } = render(<CompliancePanel result={result} region="TR" />);

    expect(panel()).toHaveAttribute("data-status", "fail");
    expect(within(panel()).getByText("Onaylanamaz")).toBeInTheDocument();
    expect(within(panel()).getByText("Bölge: TR")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(result.findings.length);
    expect(screen.getByText(/ibaresi olmalı/)).toBeInTheDocument();
    expect(screen.getByText(/İbareyi en başa yaz/)).toBeInTheDocument(); // ipucu
    expect(screen.queryByText("tr.ad-label")).not.toBeInTheDocument(); // müşteri görünümünde kural kodu yok
    rerender(<CompliancePanel result={result} region="TR" showRuleIds />);
    expect(screen.getByText("tr.ad-label")).toBeInTheDocument(); // yönetici: kural kimliği
    expect(panel().querySelectorAll('[data-severity="warn"]')).toHaveLength(1);
    expect(panel().querySelectorAll('[data-severity="fail"]')).toHaveLength(2);
  });

  it("warn: 'Dikkat' başlığı; ok: 'Uyumlu' başlığı ve bulgu listesi yok", () => {
    const warn = checkCompliance({ caption: "Reklam · kahve", isPaidPartnership: true, isAiGenerated: false, region: "TR" });
    expect(warn.status).toBe("warn");
    const { unmount } = render(<CompliancePanel result={warn} region="TR" />);
    expect(panel()).toHaveAttribute("data-status", "warn");
    expect(within(panel()).getByText("Dikkat")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    unmount();

    render(<CompliancePanel result={{ status: "ok", findings: [] }} region="US" />);
    expect(panel()).toHaveAttribute("data-status", "ok");
    expect(within(panel()).getByText("Uyumlu")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("bölge etiketi: TR / ABD / TR+ABD; bölge verilmezse etiket çizilmez", () => {
    const ok: ComplianceResult = { status: "ok", findings: [] };
    const { rerender } = render(<CompliancePanel result={ok} region="US" />);
    expect(screen.getByText("Bölge: ABD")).toBeInTheDocument();
    rerender(<CompliancePanel result={ok} region="TR_US" />);
    expect(screen.getByText("Bölge: TR+ABD")).toBeInTheDocument();
    rerender(<CompliancePanel result={ok} />);
    expect(screen.queryByText(/^Bölge:/)).not.toBeInTheDocument();
  });

  it("alt not her durumda görünür: ön kontroldür, hukuki tavsiye değildir", () => {
    render(<CompliancePanel result={{ status: "ok", findings: [] }} />);
    expect(
      screen.getByText("Kural tabanlı ön kontroldür; hukuki tavsiye değildir."),
    ).toBeInTheDocument();
  });
});
