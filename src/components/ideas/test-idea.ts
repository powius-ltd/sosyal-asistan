/** Yalnız testler için: en az alanla `Idea` (mock depoya bağımlı olmadan). */
import type { Idea, IdeaEvidence } from "@/lib/domain/intel";

export function testEvidence(overrides: Partial<IdeaEvidence> = {}): IdeaEvidence {
  return {
    contentItemId: "ci_rival_1",
    ownerHandle: "noelle",
    platform: "instagram",
    format: "short_video",
    caption: "Comment RENEW ve hayatını değiştir",
    currentLift: 4.2,
    hookType: "bold_claim",
    liftAtCreation: 4.2,
    ...overrides,
  };
}

export function testIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea_1",
    workspaceId: "ws_1",
    status: "new",
    title: "Sabah rutininde tek hata",
    rationale: "Rakiplerde cesur iddia girişi 4x üstü tuttu; sen bu yönü denemedin.",
    platform: "instagram",
    format: "short_video",
    source: "generated",
    hooks: ["Bu hatayı yapıyorsan sabahların boşa gidiyor.", "Kimse sana bunu söylemedi.", "Üç yıl boyunca aynı şeyi yaptım."],
    hookType: "bold_claim",
    scriptOutline: ["Açılış", "Hikaye", "Çağrı"],
    details: {},
    rankScore: 3.4,
    evidence: [testEvidence(), testEvidence({ contentItemId: "ci_rival_2", ownerHandle: "align", liftAtCreation: 3.1 })],
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
    ...overrides,
  };
}
