import { Bookmark } from "lucide-react";
import Link from "next/link";

import { CollectionItems } from "@/components/collections/collection-items";
import { RenameCollectionDialog } from "@/components/collections/collection-name-dialogs";
import { DeleteCollectionDialog } from "@/components/collections/delete-collection-dialog";
import { UseAsEvidenceButton } from "@/components/collections/use-as-evidence-button";
import { linkButtonClass } from "@/components/content/link-button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import type { CollectionDetail } from "@/lib/domain/collection";
import { formatNumber } from "@/lib/format";
import { ROUTES } from "@/lib/routes";

const BACK = { href: ROUTES.collections, label: "Koleksiyonlar" };

/** Koleksiyon ayrıntısı (`/koleksiyonlar?id=`): başlık + işlemler + içerik listesi (boşsa yönlendiren boş durum). */
export function CollectionDetailView({ detail, timeZone }: { detail: CollectionDetail; timeZone?: string }) {
  const { collection, items } = detail;
  return (
    <>
      <PageHeader
        title={collection.name}
        description={collection.description ?? `${formatNumber(collection.itemCount)} içerik`}
        back={BACK}
        actions={
          <>
            <UseAsEvidenceButton />
            <RenameCollectionDialog collectionId={collection.id} name={collection.name} />
            <DeleteCollectionDialog
              collectionId={collection.id}
              name={collection.name}
              itemCount={collection.itemCount}
              redirectTo={ROUTES.collections}
            />
          </>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Bu koleksiyon boş"
          description="Tutan içerikler ya da Video analizi ekranındaki “Kaydet” düğmesiyle içerik ekleyebilirsin."
          action={
            <Link href={ROUTES.outliers} className={linkButtonClass()}>
              Tutan içeriklere git
            </Link>
          }
        />
      ) : (
        <CollectionItems items={items} timeZone={timeZone} />
      )}
    </>
  );
}

/** İstenen koleksiyon yok (silinmiş ya da bağlantı bozuk): listeye dönüş yolu ile boş durum. */
export function CollectionNotFoundView() {
  return (
    <>
      <PageHeader title="Koleksiyon bulunamadı" back={BACK} />
      <EmptyState
        icon={Bookmark}
        title="Bu koleksiyon yok"
        description="Silinmiş olabilir ya da bağlantı hatalı."
        action={
          <Link href={ROUTES.collections} className={linkButtonClass()}>
            Koleksiyonlara dön
          </Link>
        }
      />
    </>
  );
}
