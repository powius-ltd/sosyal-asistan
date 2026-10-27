import { Bookmark } from "lucide-react";
import type { Metadata } from "next";

import { CollectionDetailView, CollectionNotFoundView } from "@/components/collections/collection-detail";
import { CreateCollectionDialog } from "@/components/collections/collection-name-dialogs";
import { CollectionTable } from "@/components/collections/collection-table";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { getPanelContext } from "@/lib/data";
import { ROUTES } from "@/lib/routes";
import { first } from "@/lib/search-params";

export const metadata: Metadata = { title: "Koleksiyonlar" };

/** Koleksiyon listesi; `?id=<koleksiyon>` ile o koleksiyonun içerikleri. */
export default async function CollectionsPage(props: PageProps<"/koleksiyonlar">) {
  const id = first((await props.searchParams).id)?.trim();
  const { repo, wsId } = await getPanelContext();

  if (id) {
    const [detail, workspace] = await Promise.all([repo.getCollection(wsId, id), repo.getWorkspace(wsId)]);
    return detail ? <CollectionDetailView detail={detail} timeZone={workspace?.timezone} /> : <CollectionNotFoundView />;
  }

  const [collections, workspace] = await Promise.all([repo.listCollections(wsId), repo.getWorkspace(wsId)]);
  return (
    <>
      <PageHeader
        title="Koleksiyonlar"
        description="Kaydettiğin tutan içerikler: ilham havuzun. İçerikleri Tutan içerikler ve Video analizi ekranından “Kaydet” ile eklersin."
        back={{ href: ROUTES.outliers, label: "Tutan içerikler" }}
        actions={collections.length > 0 ? <CreateCollectionDialog /> : undefined}
      />
      {collections.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Henüz koleksiyon yok"
          description="İçerikleri kaydetmek için ilk koleksiyonunu oluştur."
          action={<CreateCollectionDialog />}
        />
      ) : (
        <CollectionTable collections={collections} timeZone={workspace?.timezone} />
      )}
    </>
  );
}
