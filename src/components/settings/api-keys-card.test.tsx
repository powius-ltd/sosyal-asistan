// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/local-keys", () => ({ saveLocalKey: save, removeLocalKey: vi.fn(), testLocalKey: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ApiKeysCard } from "@/components/settings/api-keys-card";
import type { KeyRow } from "@/lib/local-keys/status";

const rows: KeyRow[] = [
  { service: "apify", title: "Rakip verisi (Apify)", hint: "ipucu", state: "set", last4: "9876" },
  { service: "zernio", title: "Instagram yayını (Zernio)", hint: "ipucu", state: "missing" },
];

beforeEach(() => save.mockReset());

describe("ApiKeysCard", () => {
  it("satır yoksa (kapı kapalı) hiçbir şey çizmez", () => {
    expect(render(<ApiKeysCard rows={undefined} />).container).toBeEmptyDOMElement();
    expect(render(<ApiKeysCard rows={[]} />).container).toBeEmptyDOMElement();
  });

  it("yalnız 'kayıtlı ✓ · …son 4' ya da 'yok' gösterir; alan parola türünde", () => {
    render(<ApiKeysCard rows={rows} />);
    expect(screen.getByText(/kayıtlı ✓ · …9876/)).toBeInTheDocument();
    expect(screen.getByText("yok")).toBeInTheDocument();
    expect(screen.getByLabelText("Rakip verisi (Apify) anahtarı")).toHaveAttribute("type", "password");
    expect(screen.getAllByRole("button", { name: "Dene" })).toHaveLength(1); // yalnız kayıtlı satırda
  });

  it("kaydedince değeri action'a yollar ve alanı boşaltır; kaldırma onay ister", async () => {
    save.mockResolvedValue({ ok: true, message: "Anahtar kaydedildi." });
    const user = userEvent.setup();
    render(<ApiKeysCard rows={rows} />);
    const input = screen.getByLabelText("Instagram yayını (Zernio) anahtarı");
    await user.type(input, "zk_0123456789");
    await user.click(screen.getAllByRole("button", { name: "Kaydet" })[1]);
    expect(save).toHaveBeenCalledWith({ service: "zernio", value: "zk_0123456789" });
    await vi.waitFor(() => expect(input).toHaveValue(""));
    await user.click(screen.getByRole("button", { name: "Kaldır" }));
    expect(screen.getByRole("button", { name: "Evet, kaldır" })).toBeInTheDocument();
  });
});
