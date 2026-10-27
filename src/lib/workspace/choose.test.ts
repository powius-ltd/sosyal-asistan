import { describe, expect, it, vi } from "vitest";

import { chooseWorkspaceId } from "@/lib/workspace/choose";

const DEFAULT_ID = "7a3f0000-0000-4000-8000-000000000001";
const OTHER_ID = "5cc27bf7-635a-4e00-975a-d18122f8de30";

function setup(overrides: { cookieValue?: string; operatorMode?: boolean; known?: string[] } = {}) {
  const known = new Set(overrides.known ?? [DEFAULT_ID, OTHER_ID]);
  const exists = vi.fn(async (id: string) => known.has(id));
  const choose = () =>
    chooseWorkspaceId({
      defaultId: DEFAULT_ID,
      cookieValue: overrides.cookieValue,
      operatorMode: overrides.operatorMode ?? true,
      exists,
    });
  return { choose, exists };
}

describe("chooseWorkspaceId", () => {
  it("çerez yoksa varsayılan; kayıt sorgusu yapılmaz", async () => {
    const { choose, exists } = setup();
    expect(await choose()).toBe(DEFAULT_ID);
    expect(exists).not.toHaveBeenCalled();
  });

  it("çerez geçerli ve kayıtta varsa o çalışma alanı", async () => {
    const { choose, exists } = setup({ cookieValue: OTHER_ID });
    expect(await choose()).toBe(OTHER_ID);
    expect(exists).toHaveBeenCalledWith(OTHER_ID);
  });

  it("çerez kayıtta yoksa (silinmiş/uydurma kimlik) varsayılana düşer, hata vermez", async () => {
    const { choose } = setup({ cookieValue: "11111111-1111-4111-8111-111111111111" });
    expect(await choose()).toBe(DEFAULT_ID);
  });

  it("biçimsiz çerez değeri kayıt sorgusuna gitmeden varsayılana düşer", async () => {
    for (const cookieValue of ["", "  ", "abc", "'; drop table workspaces; --", "../../etc", `${OTHER_ID}x`]) {
      const { choose, exists } = setup({ cookieValue });
      expect(await choose()).toBe(DEFAULT_ID);
      expect(exists).not.toHaveBeenCalled();
    }
  });

  it("operatör modu kapalıyken çerez yok sayılır (kayıtta olsa bile)", async () => {
    const { choose, exists } = setup({ cookieValue: OTHER_ID, operatorMode: false });
    expect(await choose()).toBe(DEFAULT_ID);
    expect(exists).not.toHaveBeenCalled();
  });

  it("çerez varsayılanın kendisiyse kayıt sorgusu yapılmaz; büyük harfli kimlik normalleşir", async () => {
    const same = setup({ cookieValue: DEFAULT_ID });
    expect(await same.choose()).toBe(DEFAULT_ID);
    expect(same.exists).not.toHaveBeenCalled();
    const upper = setup({ cookieValue: OTHER_ID.toUpperCase() });
    expect(await upper.choose()).toBe(OTHER_ID);
  });
});
