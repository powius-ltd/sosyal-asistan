import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

const { getPanelContext } = vi.hoisted(() => ({ getPanelContext: vi.fn() }));

vi.mock("@/lib/data", () => ({ getPanelContext }));
vi.mock("@/components/collections/save-to-collection-menu", () => ({ SaveToCollectionMenu: () => null }));

import { SaveToCollectionButton } from "@/components/collections/save-to-collection-button";
import { SaveToCollectionMenu } from "@/components/collections/save-to-collection-menu";

describe("SaveToCollectionButton", () => {
  it("ilk durumu sayfadan alır ve istemci menüsüne verir; kendi başına okuma yapmaz", () => {
    const element = SaveToCollectionButton({ contentId: "ci_5", initialCollectionIds: ["col_1", "col_2"] });

    expect(isValidElement(element)).toBe(true);
    expect(element.type).toBe(SaveToCollectionMenu);
    expect(element.props).toEqual({ contentId: "ci_5", initialCollectionIds: ["col_1", "col_2"] });
    expect(getPanelContext, "düğme depoya gitmez (sayfa toplu okur)").not.toHaveBeenCalled();
  });

  it("üyelik bilinmiyorsa (okunamadı) undefined geçer: menü açılınca yüklenir", () => {
    const element = SaveToCollectionButton({ contentId: "ci_5" });
    expect(element.props).toEqual({ contentId: "ci_5", initialCollectionIds: undefined });
  });
});
