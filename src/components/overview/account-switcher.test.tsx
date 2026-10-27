// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountSwitcher } from "@/components/overview/account-switcher";
import type { OwnAccount } from "@/lib/domain/competitor";

const account = (id: string, handle: string): OwnAccount => ({
  id,
  workspaceId: "ws_1",
  platform: "instagram",
  handle,
  connection: "connected",
  scopes: [],
  createdAt: "2026-01-01T00:00:00Z",
});
const ACCOUNTS = [account("oa_1", "birinci"), account("oa_2", "ikinci")];

describe("AccountSwitcher", () => {
  it("bağlantılar seçicinin çizildiği sayfaya (Sonuçlar) gider, Bugün'e düşürmez", () => {
    render(<AccountSwitcher accounts={ACCOUNTS} />);
    expect(screen.getByRole("link", { name: "Tüm hesaplar" })).toHaveAttribute("href", "/sonuclar");
    expect(screen.getByRole("link", { name: /@birinci/ })).toHaveAttribute("href", "/sonuclar?hesap=oa_1");
    expect(screen.getByRole("link", { name: /@ikinci/ })).toHaveAttribute("href", "/sonuclar?hesap=oa_2");
  });

  it("basePath ile başka bir sayfada da doğru yere gider; kimlik adrese güvenle kodlanır", () => {
    render(<AccountSwitcher accounts={[account("a b&c", "x"), ACCOUNTS[1]]} basePath="/baska" />);
    expect(screen.getByRole("link", { name: "Tüm hesaplar" })).toHaveAttribute("href", "/baska");
    expect(screen.getByRole("link", { name: /@x/ })).toHaveAttribute("href", "/baska?hesap=a%20b%26c");
  });

  it("seçili hesap aria-current taşır; tek hesapta seçici çizilmez", () => {
    const view = render(<AccountSwitcher accounts={ACCOUNTS} selectedId="oa_2" />);
    expect(screen.getByRole("link", { name: /@ikinci/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Tüm hesaplar" })).not.toHaveAttribute("aria-current");
    view.rerender(<AccountSwitcher accounts={[ACCOUNTS[0]]} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
