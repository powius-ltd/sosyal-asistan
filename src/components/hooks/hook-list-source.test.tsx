// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HookList } from "@/components/hooks/hook-list";
import { HookSourceBadge } from "@/components/hooks/hook-source-badge";
import { HookTypeStats } from "@/components/hooks/hook-type-stats";
import { parseHookParams } from "@/components/hooks/search-params";
import type { HookLibraryEntry, HookTypeStat } from "@/lib/domain/hook-library";

function entry(overrides: Partial<HookLibraryEntry> = {}): HookLibraryEntry {
  return {
    contentId: "ci_010",
    hookText: "Sabah kahveni yanlış içiyorsun.",
    hookType: "bold_claim",
    hookTypeEvidence: "yanlış içiyorsun",
    hookSource: "speech",
    ownerHandle: "noelle",
    platform: "instagram",
    isOwn: false,
    lift: 4.2,
    liftTier: 3,
    publishedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

describe("HookSourceBadge", () => {
  it.each([
    ["speech", "Konuşma"],
    ["screen_text", "Ekran yazısı"],
    ["caption", "Açıklama"],
  ] as const)("%s → %s", (source, label) => {
    render(<HookSourceBadge source={source} />);
    expect(screen.getByText(label)).toHaveAttribute("data-hook-source", source);
  });
});

describe("HookList yeni taksonomi", () => {
  it.each([
    ["bold_claim", "Cesur iddia"],
    ["story_open", "Hikaye"],
    ["callout", "Doğrudan seslenen"],
    ["affirmation", "Olumlayıcı"],
    ["teaching_quote", "Öğreti / alıntı"],
  ])("hook türü %s → %s", (hookType, label) => {
    render(<HookList entries={[entry({ hookType })]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("hook kaynağı rozeti ve tür kanıtı alıntısı görünür", () => {
    render(<HookList entries={[entry({ hookSource: "screen_text" })]} />);
    expect(screen.getByText("Ekran yazısı")).toBeInTheDocument();
    expect(screen.getByText(/Tarzın dayanağı:/)).toHaveTextContent("Tarzın dayanağı: “yanlış içiyorsun”");
  });

  it("kaynağı kayıtlı olmayan eski girişte rozet çizilmez; kanıt alıntısı yoksa satır da yok", () => {
    render(<HookList entries={[entry({ hookSource: undefined, hookTypeEvidence: undefined })]} />);
    const row = screen.getByRole("listitem");
    expect(within(row).queryByText("Konuşma")).not.toBeInTheDocument();
    expect(within(row).queryByText("Ekran yazısı")).not.toBeInTheDocument();
    expect(within(row).queryByText(/Tarzın dayanağı/)).not.toBeInTheDocument();
  });

  it("tür istatistiğinde yeni türler Türkçe etiketle (bilinmeyen tür okunur hale gelir)", () => {
    const stats: HookTypeStat[] = [
      { hookType: "teaching_quote", count: 3, medianLift: 2.1 },
      { hookType: "yeni_tur", count: 1, medianLift: undefined },
    ];
    render(<HookTypeStats stats={stats} state={parseHookParams({})} />);
    expect(screen.getByText("Öğreti / alıntı")).toBeInTheDocument();
    expect(screen.getByText("Yeni tur")).toBeInTheDocument();
  });
});
