import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_DEFAULT_CAP_USD, AGENT_SETTING_LIMITS, agentSettingsOf } from "@/lib/domain/agent-settings";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0030_agent_cap.sql"), "utf8");

describe("ajan ayarları", () => {
  it("alan yoksa varsayılan; varsa kendi değeri", () => {
    expect(agentSettingsOf({})).toEqual({ collectEveryDays: 14, collectVideoLimit: 25, rivalTarget: 3 });
    expect(agentSettingsOf({ collectEveryDays: 3, collectVideoLimit: 10, rivalTarget: 0 })).toEqual({ collectEveryDays: 3, collectVideoLimit: 10, rivalTarget: 0 });
  });

  it("sınırlar ve varsayılan tavan migration 0030 ile birebir", () => {
    const check = (column: string, limit: { min: number; max: number }) => expect(SQL, column).toMatch(new RegExp(`${column}\\s+between\\s+${limit.min}\\s+and\\s+${limit.max}`, "i"));
    check("collect_every_days", AGENT_SETTING_LIMITS.collectEveryDays);
    check("collect_video_limit", AGENT_SETTING_LIMITS.collectVideoLimit);
    check("rival_target", AGENT_SETTING_LIMITS.rivalTarget);
    expect(SQL).toMatch(new RegExp(`default\\s+${AGENT_SETTING_LIMITS.collectEveryDays.default}\\b`, "i"));
    expect(SQL).toMatch(new RegExp(`default\\s+${AGENT_SETTING_LIMITS.collectVideoLimit.default}\\b`, "i"));
    expect(SQL).toMatch(new RegExp(`default\\s+${AGENT_SETTING_LIMITS.rivalTarget.default}\\b`, "i"));
    expect(SQL).toMatch(new RegExp(`\\b${AGENT_DEFAULT_CAP_USD}\\b`));
  });
});
