/**
 * Sözleşme parçası: seed gereksinimleri, bilinmeyen workspace ve kopya semantiği.
 */
import { expect, it } from "vitest";

import { expectCode, idsOf, MISSING_ID, type ContractContext } from "@/lib/data/contract/support";

export function basicsContract(ctx: ContractContext): void {
  const { wsId, foreign, create, allContent } = ctx;

  it("seed gereksinimleri; hesaplar ve bağlantılar tutarlı", async () => {
    const r = create();
    const ws = await r.getWorkspace(wsId);
    expect(ws?.id).toBe(wsId);
    expect(ws?.timezone).toBeTruthy();
    const own = await r.listOwnAccounts(wsId);
    expect(own.some((a) => a.connection === "connected") && own.every((a) => a.workspaceId === wsId)).toBe(true);
    const content = await allContent(r);
    expect(content.length).toBeGreaterThanOrEqual(3);
    expect(content.some((c) => c.owner.kind === "own") && content.some((c) => c.owner.kind === "competitor")).toBe(true);
    expect((await r.listOutliers(wsId)).items.length).toBeGreaterThan(0);
    expect((await r.listDiscoveryCandidates(wsId)).length).toBeGreaterThan(0);
    expect((await r.listIdeas(wsId)).some((i) => i.status !== "published")).toBe(true);
    expect((await r.listRuns(wsId)).items.length).toBeGreaterThan(0);
    const connections = await r.getConnections(wsId);
    expect(idsOf(connections.accounts)).toEqual(idsOf(own));
    const envVars = connections.integrations.flatMap((i) => i.envVars); // yalnız ad + var/yok (değer asla dönmez)
    expect(envVars.every((v) => typeof v.name === "string" && typeof v.present === "boolean")).toBe(true);
  });

  it("bilinmeyen workspace: listeler boş, tekiller null, özetler ve yazmalar not_found", async () => {
    const r = create();
    // Gerçek kimliklerle: uygulama kimlikten önce workspace'i kontrol etmeli.
    const [content] = (await r.listContent(wsId, { limit: 1 })).items;
    const [[competitor], [idea], [job], [account]] = await Promise.all([
      r.listCompetitors(wsId), r.listIdeas(wsId), r.listPublishJobs(wsId), r.listOwnAccounts(wsId),
    ]);
    expect([await r.getWorkspace(foreign), await r.getContent(foreign, content.id), await r.getIdea(foreign, idea.id)]).toEqual([null, null, null]);
    const lists: unknown[][] = await Promise.all([
      r.listOwnAccounts(foreign), r.listCompetitors(foreign), r.listDiscoveryCandidates(foreign), r.listIdeas(foreign),
      r.listPublishJobs(foreign), r.listRuns(foreign).then((x) => x.items), r.listUnmeasured(foreign), r.getConnections(foreign).then((x) => x.accounts),
      r.listContent(foreign).then((x) => x.items), r.listOutliers(foreign).then((x) => x.items),
    ]);
    expect(lists.map((l) => l.length)).toEqual(lists.map(() => 0));
    await expectCode(r.getOverview(foreign), "not_found");
    await expectCode(r.getCostSummary(foreign), "not_found");
    await expectCode(r.countIdeasByStatus(foreign), "not_found");
    await expectCode(r.getPublishSummary(foreign, new Date()), "not_found");
    await expectCode(r.updateWorkspace(foreign, { nicheBrief: "yabancı" }), "not_found");
    await expectCode(r.addCompetitor(foreign, { platform: "instagram", handle: "sozlesme.yabanci" }), "not_found");
    await expectCode(r.setCompetitorStatus(foreign, competitor.id, "ignored"), "not_found");
    await expectCode(r.updateIdeaStatus(foreign, idea.id, "dismissed"), "not_found");
    await expectCode(r.createPublishJob(foreign, { socialAccountId: account.id }), "not_found");
    await expectCode(r.submitPublishJob(foreign, job?.id ?? MISSING_ID), "not_found");
    await expectCode(r.approvePublishJob(foreign, job?.id ?? MISSING_ID), "not_found");
    await expectCode(r.cancelPublishJob(foreign, job?.id ?? MISSING_ID), "not_found");
  });

  it("dönen nesneler kopyadır: değiştirmek depoyu bozmaz", async () => {
    const r = create();
    const list = await r.listCompetitors(wsId);
    const original = list[0].handle;
    list[0].handle = "bozuldu";
    expect((await r.listCompetitors(wsId))[0].handle).toBe(original);
    const [item] = (await r.listContent(wsId, { limit: 1 })).items;
    item.hashtags.push("bozuldu");
    expect((await r.getContent(wsId, item.id))?.item.hashtags).not.toContain("bozuldu");
  });
}
