import { describe, expect, it } from "vitest";

import { collectHookTypes, evidenceTitle, ideaHookTypes } from "@/components/ideas/idea-evidence";
import type { IdeaEvidence } from "@/lib/domain/intel";

const evidence = (o: Partial<IdeaEvidence> = {}): IdeaEvidence => ({
  contentItemId: "ci_1",
  liftAtCreation: 4,
  ownerHandle: "kahve",
  platform: "instagram",
  format: "short_video",
  ...o,
});

describe("idea-evidence", () => {
  const list = [evidence({ hookType: "mistake_warning" }), evidence({ hookType: "mistake_warning" }), evidence(), evidence({ hookType: "list" })];

  it("hook türlerini tekrarsız toplar (yalnız türü olan kanıtlardan)", () => {
    expect(collectHookTypes(list)).toEqual(["mistake_warning", "list"]);
    expect(collectHookTypes([])).toEqual([]);
  });

  it("ideaHookTypes: depo hookType verirse o; vermezse kanıt özetlerinden yedek", () => {
    expect(ideaHookTypes({ hookType: "question" }, list)).toEqual(["question"]);
    expect(ideaHookTypes({}, list)).toEqual(["mistake_warning", "list"]);
    expect(ideaHookTypes({}, [])).toEqual([]);
  });

  it("başlık: alt yazı özeti; yoksa @hesap içeriği", () => {
    expect(evidenceTitle(evidence({ caption: "İlk satır" }))).toBe("İlk satır");
    expect(evidenceTitle(evidence())).toBe("@kahve içeriği");
    expect(evidenceTitle(evidence({ caption: "   " }))).toBe("@kahve içeriği");
  });
});
