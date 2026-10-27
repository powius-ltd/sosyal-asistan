// @vitest-environment jsdom
/** Dokunma hedefleri (D1-10): dar ekranda ≥ 48 px = `min-h-tap`; jsdom ölçü almaz, sınıf sabitlenir (`md:` ile geniş ekranda eski boy). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/notifications", () => ({ markNotificationReadAction: vi.fn(), markAllNotificationsReadAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MarkAllReadButton, MarkReadButton } from "@/components/notifications/mark-read-buttons";
import { NotificationPagination } from "@/components/notifications/notification-pagination";
import { NotificationRow } from "@/components/notifications/notification-row";
import { NotificationTabs } from "@/components/notifications/notification-tabs";
import type { Notification } from "@/lib/domain/notification";

const NOTE: Notification = {
  id: "n1",
  workspaceId: "ws",
  kind: "onboarding",
  title: "İlk planın hazır",
  body: "Bu haftanın planı seni bekliyor.",
  createdAt: "2026-10-05T09:00:00.000Z",
};

describe("bildirimler ekranı: dokunma hedefleri", () => {
  it("satırdaki 'Aç' bağlantısı ve 'Okundu yap' düğmesi dar ekranda 48 px; okunmuş satırda düğme yok", () => {
    render(
      <ul>
        <NotificationRow notification={NOTE} timeZone="Europe/Istanbul" />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Aç" })).toHaveClass("min-h-tap", "md:min-h-0");
    expect(screen.getByRole("button", { name: /^Okundu yap/ })).toHaveClass("min-h-tap", "md:min-h-0");
  });

  it("içerik bağlantılı başlık (ilk bağlantı) dikey dolgu alır", () => {
    render(
      <ul>
        <NotificationRow notification={{ ...NOTE, kind: "competitor_outlier", contentId: "ci-1" }} timeZone="Europe/Istanbul" />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "İlk planın hazır" }).parentElement?.className).toContain("[&>a:first-child]:py-3.5");
  });

  it("başlık kesilmeden sarılır, 'Okundu yap' kartın en altındadır (D3-10)", () => {
    render(
      <ul>
        <NotificationRow notification={{ ...NOTE, kind: "competitor_outlier", contentId: "ci-1", title: "@rakip videosu normalinin 8,7 katı izlendi" }} timeZone="Europe/Istanbul" />
      </ul>,
    );
    expect(screen.getByRole("link", { name: /8,7 katı/ }).parentElement?.className).toContain("whitespace-normal");
    const button = screen.getByRole("button", { name: /^Okundu yap/ });
    const body = screen.getByText(NOTE.body);
    expect(body.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.parentElement).toBe(body.parentElement);
  });

  it("süzgeç sekmeleri, 'Tümünü okundu yap' ve sayfalama dar ekranda 48 px", () => {
    render(
      <>
        <NotificationTabs active="list" unreadCount={2} />
        <MarkReadButton id="n1" title="x" />
        <MarkAllReadButton unreadCount={2} />
        <NotificationPagination unreadOnly={false} cursor="3" nextCursor="9" shown={5} />
      </>,
    );
    for (const name of ["Bildirimler 2", "Haftalık özet", "İlk sayfa", "Sonraki sayfa"]) expect(screen.getByRole("link", { name }), name).toHaveClass("min-h-tap");
    for (const name of [/^Okundu yap/, "Tümünü okundu yap"]) expect(screen.getByRole("button", { name })).toHaveClass("min-h-tap");
  });
});
