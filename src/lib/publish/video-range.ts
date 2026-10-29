/**
 * Yerel .mp4 dosyasını `Range` destekli (206) yanıta çevirir: tarayıcı `<video>` oynatıcısı ileri sarmak için aralık ister.
 * Yol doğrulaması çağıranındır (`resolveOrderMedia`); burası yalnız verilen dosyayı akıtır.
 */
import "server-only";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

/** "bytes=a-b" → [başlangıç, bitiş]; geçersiz/aşkın aralıkta undefined. SAF. */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (match[1] === "" && match[2] === "")) return undefined;
  let start: number;
  let end: number;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return undefined;
  return { start, end };
}

export function videoResponse(file: string, rangeHeader: string | null): Response {
  const size = statSync(file).size;
  const base = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "private, no-store" };
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, size);
    if (!range) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(file, range)) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...base, "content-range": `bytes ${range.start}-${range.end}/${size}`, "content-length": String(range.end - range.start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers: { ...base, "content-length": String(size) } });
}
