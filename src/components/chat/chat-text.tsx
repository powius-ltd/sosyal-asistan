import Link from "next/link";

import { TICKET_ROUTE_PREFIX } from "@/lib/routes";

/** Yanıttaki fiş yolu (`/fis/<kimlik>`): sunucu sonuç cümlesine düz yol olarak ekler, ekranda bağlantı olur. */
const TICKET_PATH = new RegExp(`(${TICKET_ROUTE_PREFIX}/[A-Za-z0-9-]+)`, "g");

/** Asistan metni: içindeki fiş yollarını tıklanabilir "fişi aç" bağlantısına çevirir, gerisi düz metin. */
export function ChatText({ text }: { text: string }) {
  const parts = text.split(TICKET_PATH);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Link key={index} href={part} className="font-medium text-primary underline underline-offset-2">
            fişi aç
          </Link>
        ) : (
          part
        ),
      )}
    </>
  );
}
