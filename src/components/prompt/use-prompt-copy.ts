"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { buildPromptAction } from "@/app/actions/prompt";
import { callAction } from "@/components/common/call-action";
import { writeClipboard } from "@/components/prompt/clipboard";
import type { CopyPromptSource } from "@/components/prompt/copy-prompt-menu";
import { formatNumber } from "@/lib/format";
import type { PromptLanguage } from "@/lib/prompt/types";

export const LANGUAGE_LABEL: Record<PromptLanguage, string> = { tr: "Türkçe", en: "English" };

export type CopyStatus = "idle" | "loading" | "copied";

/** `preview`: kullanıcı önizlemeyi açtı · `manual`: pano yazılamadı, metin elle kopyalanacak. */
export interface PromptDialogState {
  open: boolean;
  mode: "preview" | "manual";
  language: PromptLanguage;
  text?: string;
  loading: boolean;
  error?: string;
}

const CLOSED: PromptDialogState = { open: false, mode: "preview", language: "tr", loading: false };

/** "Kopyalandı" durumunun görünme süresi. */
const COPIED_MS = 2000;

type Loaded = { ok: true; text: string } | { ok: false; message: string };

async function requestPrompt(source: CopyPromptSource, language: PromptLanguage): Promise<Loaded> {
  const result = await callAction(() => buildPromptAction(source, language), "Prompt hazırlanamadı. Bağlantını kontrol edip tekrar dene.");
  return result.ok ? { ok: true, text: result.text } : { ok: false, message: result.message };
}

/**
 * "Prompt olarak kopyala" akışı: sunucu aksiyonundan metni al → panoya yaz → "Kopyalandı" + toast. Pano yoksa metin
 * dialog'da elle kopyalanmak üzere gösterilir; önizleme aynı dialog'dur. Asıl iş sunucuda (`buildPromptAction`).
 */
export function usePromptCopy(source: CopyPromptSource) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const [dialog, setDialog] = useState<PromptDialogState>(CLOSED);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Dialog için en son istek sırası: geç gelen eski yanıt ekranı ezmesin. */
  const latest = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const markCopied = useCallback((language: PromptLanguage, text: string) => {
    setStatus("copied");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), COPIED_MS);
    toast.success(`Prompt panoya kopyalandı (${LANGUAGE_LABEL[language]}, ${formatNumber(Array.from(text).length)} karakter).`);
  }, []);

  /** Menüden "Türkçe"/"English": hazırla ve kopyala; pano kullanılamazsa elle kopyalama dialog'u. */
  const copy = useCallback(
    async (language: PromptLanguage) => {
      setStatus("loading");
      const result = await requestPrompt(source, language);
      if (!result.ok) {
        setStatus("idle");
        toast.error(result.message);
        return;
      }
      if (await writeClipboard(result.text)) {
        markCopied(language, result.text);
        return;
      }
      setStatus("idle");
      setDialog({ open: true, mode: "manual", language, text: result.text, loading: false });
      toast.info("Pano kullanılamadı; metni açılan pencereden elle kopyalayabilirsin.");
    },
    [markCopied, source],
  );

  /** Dialog'a metni yükler (açar ya da dil değiştirir); `mode` korunur. */
  const load = useCallback(
    async (language: PromptLanguage, mode: PromptDialogState["mode"]) => {
      const request = ++latest.current;
      setDialog({ open: true, mode, language, loading: true });
      const result = await requestPrompt(source, language);
      if (request !== latest.current) return;
      setDialog((current) => ({
        ...current,
        loading: false,
        text: result.ok ? result.text : undefined,
        error: result.ok ? undefined : result.message,
      }));
    },
    [source],
  );

  const preview = useCallback((language: PromptLanguage) => load(language, "preview"), [load]);

  const changeLanguage = useCallback((language: PromptLanguage) => load(language, dialog.mode), [dialog.mode, load]);

  const setOpen = useCallback((open: boolean) => {
    if (open) return;
    latest.current++;
    setDialog((current) => ({ ...current, open: false }));
  }, []);

  /** Dialog'daki "Kopyala": pano yine yazılamazsa metin zaten görünür, kullanıcı elle kopyalar. */
  const copyDialogText = useCallback(async () => {
    if (!dialog.text) return;
    if (await writeClipboard(dialog.text)) markCopied(dialog.language, dialog.text);
    else toast.error("Pano kullanılamıyor. Metni seçip Ctrl+C ile kopyala.");
  }, [dialog.language, dialog.text, markCopied]);

  return { status, dialog, copy, preview, changeLanguage, setOpen, copyDialogText };
}
