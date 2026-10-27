import type { Metadata } from "next";

import { NotFoundView } from "@/app/not-found-view";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/** Panel dışındaki (eşleşmeyen) adresler için kabuksuz Türkçe 404. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4">
      <div className="w-full">
        <NotFoundView title="Bu sayfa bulunamadı" description="Adres eski ya da yanlış olabilir. Bugün'e dönüp oradan devam edebilirsin." />
      </div>
    </main>
  );
}
