import Link from "next/link";

import { collectionHref } from "@/components/collections/collection-href";
import { DeleteCollectionDialog } from "@/components/collections/delete-collection-dialog";
import { RenameCollectionDialog } from "@/components/collections/collection-name-dialogs";
import { STACK_CELL, STACK_FULL, STACK_LABEL, STACK_ROW, STACK_TABLE } from "@/components/competitors/stack-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Collection } from "@/lib/domain/collection";
import { formatDate, formatNumber } from "@/lib/format";
import { truncateText } from "@/lib/text";
import { cn } from "@/lib/utils";

const DESCRIPTION_PREVIEW_CHARS = 90;

/** Koleksiyon listesi: ad (ayrıntıya bağlantı), açıklama, içerik sayısı, güncelleme tarihi, yeniden adlandır / sil. */
export function CollectionTable({ collections, timeZone }: { collections: Collection[]; timeZone?: string }) {
  return (
    <Table className={STACK_TABLE}>
      <TableHeader>
        <TableRow>
          <TableHead>Koleksiyon</TableHead>
          <TableHead>Açıklama</TableHead>
          <TableHead className="text-right">İçerik</TableHead>
          <TableHead>Güncelleme</TableHead>
          <TableHead className="w-24 text-right">
            <span className="sr-only">İşlemler</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {collections.map((collection) => (
          <TableRow key={collection.id} className={STACK_ROW}>
            <TableCell className={cn("max-w-64", STACK_CELL, STACK_FULL, "max-md:max-w-none")}>
              <Link href={collectionHref(collection.id)} className="block truncate font-medium hover:underline max-md:whitespace-normal max-md:py-1 max-md:text-base">
                {collection.name}
              </Link>
            </TableCell>
            <TableCell className={cn("max-w-80 whitespace-normal text-muted-foreground", STACK_CELL, STACK_FULL, "max-md:max-w-none")}>
              {collection.description ? truncateText(collection.description, DESCRIPTION_PREVIEW_CHARS) : "Açıklama yok"}
            </TableCell>
            <TableCell data-label="İçerik" className={cn("text-right tabular", STACK_CELL, STACK_LABEL)}>{formatNumber(collection.itemCount)}</TableCell>
            <TableCell data-label="Güncelleme" className={cn("whitespace-nowrap text-muted-foreground", STACK_CELL, STACK_LABEL)}>{formatDate(collection.updatedAt, timeZone) ?? "—"}</TableCell>
            <TableCell className={cn(STACK_CELL, STACK_FULL)}>
              <div className="flex justify-end gap-0.5">
                <RenameCollectionDialog collectionId={collection.id} name={collection.name} />
                <DeleteCollectionDialog collectionId={collection.id} name={collection.name} itemCount={collection.itemCount} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
