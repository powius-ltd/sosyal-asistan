import { getPanelContext } from "@/lib/data";
import { MAX_PAGE_LIMIT } from "@/lib/data/queries";
import { isOrderMediaPath } from "@/lib/order-media-path";
import { ordersRootOf, resolveOrderMedia } from "@/lib/publish/order-media";
import { videoResponse } from "@/lib/publish/video-range";
import { resolveOrderAccount } from "@/lib/studio-order/account-mode";
import { listWorkspaces } from "@/lib/workspace/registry";

// Yayın işinin stüdyo videosunu (`siparis:` yolu) önizleme için akıtır. Çalışma alanı gövdeden değil `getPanelContext()`'ten; iş bu çalışma
// alanında değilse ya da yol stüdyo yolu değilse 404. Dosya yalnız `resolveOrderMedia` ile sipariş kökünde çözülür (`..`, başka hesap reddedilir).
export const dynamic = "force-dynamic";

const notFound = () => new Response("Bulunamadı", { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }): Promise<Response> {
  if (process.env.VERCEL?.trim()) return notFound();
  const { jobId } = await params;
  const { repo, wsId } = await getPanelContext();
  const [jobs, accounts, workspaces] = await Promise.all([
    repo.listPublishJobs(wsId, { limit: MAX_PAGE_LIMIT }),
    repo.listOwnAccounts(wsId),
    listWorkspaces(),
  ]);
  const job = jobs.find((j) => j.id === jobId);
  if (!job || !isOrderMediaPath(job.mediaPath)) return notFound();
  const handle = accounts.find((a) => a.id === job.socialAccountId)?.handle;
  const studio = resolveOrderAccount({ panelSlug: workspaces.find((w) => w.id === wsId)?.slug, handle, hasScript: false });
  if (!studio) return notFound();
  try {
    return videoResponse(resolveOrderMedia(ordersRootOf(), job.mediaPath, studio.slug), request.headers.get("range"));
  } catch {
    return notFound();
  }
}
