import { describe, expect, it } from "vitest";
import {
  classifyAccessReason,
  resolveProfileAccess,
  toAccountSnapshotRow,
  toCompetitorPatch,
  toSocialAccountPatch,
} from "@/lib/collection/profile-rows";
import { parseProfiles } from "@/lib/platforms/instagram/normalize-profile";
import { loadFixture } from "@/lib/platforms/instagram/test-support";
import type { NormalizedProfile } from "@/lib/platforms/types";

const NOW = "2026-09-30T12:00:00.000Z";
const CTX = { workspaceId: "ws", collectionRunId: "run", capturedAt: NOW };

const realProfile = (): NormalizedProfile => {
  const parsed = parseProfiles(loadFixture("profile"));
  return parsed.items[0];
};

describe("profil satırı eşlemesi (gerçek profil fixture)", () => {
  it("account_snapshots: sayaçlar + kaynak apify + koşu; sahip XOR", () => {
    const profile = realProfile();
    const own = toAccountSnapshotRow(profile, { kind: "own", id: "o1" }, CTX);
    expect(own).toMatchObject({
      workspace_id: "ws",
      platform: "instagram",
      social_account_id: "o1",
      competitor_id: null,
      collection_run_id: "run",
      captured_at: NOW,
      followers: profile.followers,
      following: profile.following,
      posts_count: profile.postsCount,
      source: "apify",
    });
    const rival = toAccountSnapshotRow(profile, { kind: "competitor", id: "c1" }, CTX);
    expect(rival).toMatchObject({ social_account_id: null, competitor_id: "c1" });
  });

  it("ölçülemeyen sayaç NULL (0 değil)", () => {
    const profile: NormalizedProfile = { platform: "instagram", handle: "x", missingFields: ["followers"] };
    expect(toAccountSnapshotRow(profile, { kind: "own", id: "o" }, CTX)).toMatchObject({
      followers: null,
      following: null,
      posts_count: null,
    });
  });

  it("kendi hesap yaması: kimlik + ad + sayaçlar + last_synced_at; avatar/biyografi yok", () => {
    const profile = realProfile();
    const patch = toSocialAccountPatch(profile, NOW);
    expect(patch).toMatchObject({
      external_id: profile.externalId,
      display_name: profile.displayName,
      followers: profile.followers,
      last_synced_at: NOW,
    });
    expect(patch).not.toHaveProperty("avatar_url");
    expect(patch).not.toHaveProperty("bio");
  });

  it("rakip yaması: bilinmeyen alan mevcut değeri ezmez (yazılmaz); avatar adresi yazılmaz", () => {
    const sparse: NormalizedProfile = { platform: "instagram", handle: "x", externalId: "42", missingFields: ["followers"] };
    const patch = toCompetitorPatch(sparse, NOW);
    expect(patch).toMatchObject({ external_id: "42", missing_fields: ["followers"], last_collected_at: NOW });
    expect(patch).not.toHaveProperty("followers");
    expect(patch).not.toHaveProperty("display_name");
    expect(patch).not.toHaveProperty("avatar_url");
    expect(patch).not.toHaveProperty("status");
  });

  it("rakip yaması: profil açıkça okunduysa eski erişim sebebi (status_reason) silinir; gizli profil satırında KALIR", () => {
    const readable: NormalizedProfile = { platform: "instagram", handle: "x", followers: 5, missingFields: [] };
    expect(toCompetitorPatch(readable, NOW).status_reason).toBeNull();
    expect(toCompetitorPatch({ ...readable, isPrivate: false }, NOW).status_reason).toBeNull();
    // Gizli hesap profil satırıyla gelirse `markCompetitorAccess` az önce sebebi yazdı: yama ezmemeli.
    expect(toCompetitorPatch({ ...readable, isPrivate: true }, NOW)).not.toHaveProperty("status_reason");
  });
});

describe("resolveProfileAccess — hesap başına erişim durumu", () => {
  it("bulunan profil: ok", () => {
    const parsed = parseProfiles(loadFixture("profile"));
    const { profile, access } = resolveProfileAccess("ornekhesap", parsed, 1);
    expect(access).toEqual({ handle: "ornekhesap", state: "ok" });
    expect(profile?.handle).toBe("ornekhesap");
  });

  it("gizli profil satırı (private: true) → private", () => {
    const row = { ...loadFixture("profile")[0], username: "gizli_hesap", private: true };
    const parsed = parseProfiles([row]);
    expect(resolveProfileAccess("gizli_hesap", parsed, 1).access).toMatchObject({ state: "private" });
  });

  it("toplu koşuda bir hesap bulunamazsa yalnız o hesap not_found, diğeri ok", () => {
    const parsed = parseProfiles([...loadFixture("profile"), ...loadFixture("access-not-found")]);
    expect(parsed.accessError).toBeUndefined(); // koşu tümüyle boş değil
    expect(resolveProfileAccess("ornekhesap", parsed, 2).access.state).toBe("ok");
    const missing = resolveProfileAccess("ornek.bulunmayan", parsed, 2);
    expect(missing.profile).toBeUndefined();
    expect(missing.access).toMatchObject({ handle: "ornek.bulunmayan", state: "not_found" });
    expect(missing.access.reason).toContain("not_found");
  });

  it("tek hedefli koşu tümüyle boş: koşu düzeyi erişim hatası o hesaba aittir", () => {
    const parsed = parseProfiles(loadFixture("access-not-found").map((row) => ({ ...row, username: undefined, url: undefined })));
    expect(parsed.accessError).toBe("not_found");
    expect(resolveProfileAccess("hedef", parsed, 1).access.state).toBe("not_found");
    // Birden çok hedefte hangisinin hatası olduğu bilinemez → durum değiştirilmez.
    expect(resolveProfileAccess("hedef", parsed, 2).access.state).toBe("missing");
  });

  it("veri de hata da gelmediyse missing (durum değişmez)", () => {
    const parsed = parseProfiles(loadFixture("profile"));
    expect(resolveProfileAccess("baska_hesap", parsed, 4).access.state).toBe("missing");
  });
});

describe("classifyAccessReason", () => {
  it("gizli / bulunamadı / tanınmayan", () => {
    expect(classifyAccessReason("private — restricted (@x)")).toBe("private");
    expect(classifyAccessReason("not_found — Post does not exist (@x)")).toBe("not_found");
    expect(classifyAccessReason("rate_limited")).toBeUndefined();
  });
});
