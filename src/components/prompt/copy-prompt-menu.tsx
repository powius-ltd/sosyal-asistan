"use client";

import { Check, ChevronDown, ClipboardCopy, Loader2 } from "lucide-react";

import { PromptDialog } from "@/components/prompt/prompt-dialog";
import { usePromptCopy } from "@/components/prompt/use-prompt-copy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Prompt'un kaynağı: bir fikir kartı ya da bir içerik (Video analizi). */
export type CopyPromptSource = { kind: "idea"; ideaId: string } | { kind: "content"; contentId: string };

export interface CopyPromptMenuProps {
  source: CopyPromptSource;
}

/**
 * "Prompt olarak kopyala": kartı/videoyu Claude ya da ChatGPT'ye yapıştırılacak tek metne çevirip panoya kopyalar
 * (niş tanımı + kanıt + baz çizgisi + görev + kısıtlar). Menüden dil seçilir ("Türkçe" / "English"); metni sunucu
 * aksiyonu (`buildPromptAction`) kurar. Pano kullanılamazsa metin pencerede elle kopyalanır; "Önizle" aynı pencereyi açar.
 * Yerleşim: fikir kartı, Video analizi başlığı.
 */
export function CopyPromptMenu({ source }: CopyPromptMenuProps) {
  const { status, dialog, copy, preview, changeLanguage, setOpen, copyDialogText } = usePromptCopy(source);
  const id = source.kind === "idea" ? source.ideaId : source.contentId;
  const loading = status === "loading";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="sm" disabled={loading} />}
          data-source-kind={source.kind}
          data-source-id={id}
        >
          {loading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
          ) : status === "copied" ? (
            <Check data-icon="inline-start" aria-hidden />
          ) : (
            <ClipboardCopy data-icon="inline-start" aria-hidden />
          )}
          {loading ? "Hazırlanıyor…" : status === "copied" ? "Kopyalandı" : "Prompt olarak kopyala"}
          <ChevronDown data-icon="inline-end" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Şu dilde kopyala</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void copy("tr")}>Türkçe</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void copy("en")}>English</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void preview("tr")}>Önizle</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" className="sr-only">
        {status === "copied" ? "Prompt panoya kopyalandı." : ""}
      </span>
      <PromptDialog
        state={dialog}
        status={status}
        onOpenChange={setOpen}
        onLanguageChange={(language) => void changeLanguage(language)}
        onCopy={() => void copyDialogText()}
      />
    </>
  );
}
