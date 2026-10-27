import { describe, expect, it } from "vitest";

import { dockMascotState } from "@/lib/mascot/state";

describe("dockMascotState: yüzen düğmenin durumu", () => {
  it("hiçbir şey yokken bekliyor; karar sayısı bilinmiyorsa ya da 0 ise de bekliyor (nokta çıkmaz)", () => {
    expect(dockMascotState({ pending: false, unseen: false, decisions: 0 })).toBe("waiting");
    expect(dockMascotState({ pending: false, unseen: false, decisions: undefined })).toBe("waiting");
  });

  it("kuyrukta karar varsa sıra sende (sarı nokta)", () => {
    expect(dockMascotState({ pending: false, unseen: false, decisions: 3 })).toBe("turn");
  });

  it("yeni yanıt kararın önüne geçer; yanıt hazırlanıyorsa hepsinin önündedir", () => {
    expect(dockMascotState({ pending: false, unseen: true, decisions: 3 })).toBe("telling");
    expect(dockMascotState({ pending: true, unseen: false, decisions: 3 })).toBe("thinking");
    expect(dockMascotState({ pending: true, unseen: true, decisions: 3 })).toBe("thinking");
  });
});
