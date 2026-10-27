import { describe, expect, it } from "vitest";

import { instagramEmbedUrl } from "@/lib/platforms/instagram/embed";

describe("instagramEmbedUrl", () => {
  it.each([
    ["https://www.instagram.com/reel/DAbCdEfGhIj/", "https://www.instagram.com/reel/DAbCdEfGhIj/embed/"],
    ["https://www.instagram.com/p/C1x_Y-z9QwE/?img_index=1&utm_source=ig", "https://www.instagram.com/p/C1x_Y-z9QwE/embed/"],
    ["https://instagram.com/reels/DAbCdEfGhIj", "https://www.instagram.com/reel/DAbCdEfGhIj/embed/"],
    ["https://www.instagram.com/noelle.kahve/reel/DAbCdEfGhIj/", "https://www.instagram.com/reel/DAbCdEfGhIj/embed/"],
  ])("%s → embed adresi", (permalink, expected) => {
    expect(instagramEmbedUrl(permalink)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "javascript:alert(1)",
    "http://www.instagram.com/reel/DAbCdEfGhIj/",
    "https://evil.example/reel/DAbCdEfGhIj/",
    "https://www.instagram.com.evil.example/reel/DAbCdEfGhIj/",
    "https://scontent-xyz.cdninstagram.com/v/t51.2885-15/abc.jpg?oe=68F0",
    "https://www.instagram.com/noelle.kahve/",
    "https://www.instagram.com/tv/DAbCdEfGhIj/",
    "https://www.instagram.com/stories/noelle/3456/",
    "https://www.instagram.com/reel/ab/",
  ])("kabul edilmeyen adres (%s) → undefined", (permalink) => {
    expect(instagramEmbedUrl(permalink)).toBeUndefined();
  });
});
