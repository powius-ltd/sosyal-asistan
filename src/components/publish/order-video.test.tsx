// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderVideo } from "@/components/publish/order-video";

describe("OrderVideo", () => {
  it("iş kimliğinden akış adresiyle oynatıcı çizer; hata verirse eski notu gösterir", () => {
    const { container } = render(<OrderVideo jobId="j 1" />);
    const video = container.querySelector("video");
    expect(video?.getAttribute("src")).toBe("/api/siparis-video/j%201");
    expect(video?.hasAttribute("controls")).toBe(true);
    fireEvent.error(video as HTMLVideoElement);
    expect(screen.getByText(/önizleme burada açılmaz/)).toBeInTheDocument();
  });
});
