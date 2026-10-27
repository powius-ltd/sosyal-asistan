"use client";

import { Check, Copy } from "lucide-react";

import { LANGUAGE_LABEL, type CopyStatus, type PromptDialogState } from "@/components/prompt/use-prompt-copy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import { PROMPT_LANGUAGES, type PromptLanguage } from "@/lib/prompt/types";

interface PromptDialogProps {
  state: PromptDialogState;
  status: CopyStatus;
  onOpenChange: (open: boolean) => void;
  onLanguageChange: (language: PromptLanguage) => void;
  onCopy: () => void;
}

const COPY = {
  preview: {
    title: "Prompt önizleme",
    description: "Claude ya da ChatGPT'ye yapıştıracağın metin. Dil, hem metni hem de istenen çıktı dilini belirler.",
  },
  manual: {
    title: "Prompt'u elle kopyala",
    description: "Tarayıcı panoya yazmaya izin vermedi. Metni seçip Ctrl+C ile kopyala.",
  },
} as const;

/** Prompt metnini gösteren pencere: önizleme ya da pano kullanılamadığında elle kopyalama. Dil değiştirilebilir. */
export function PromptDialog({ state, status, onOpenChange, onLanguageChange, onCopy }: PromptDialogProps) {
  const copy = COPY[state.mode];
  const chars = state.text ? Array.from(state.text).length : undefined;

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2" role="group" aria-label="Prompt dili">
          {PROMPT_LANGUAGES.map((language) => (
            <Button
              key={language}
              type="button"
              size="sm"
              variant={state.language === language ? "secondary" : "outline"}
              aria-pressed={state.language === language}
              disabled={state.loading}
              onClick={() => onLanguageChange(language)}
            >
              {LANGUAGE_LABEL[language]}
            </Button>
          ))}
        </div>

        {state.error ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : (
          <Textarea
            readOnly
            aria-label="Prompt metni"
            value={state.loading ? "Hazırlanıyor…" : (state.text ?? "")}
            onFocus={(event) => event.currentTarget.select()}
            className="max-h-[50vh] min-h-64 overflow-y-auto font-mono text-xs leading-relaxed"
          />
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{chars === undefined ? "" : `${formatNumber(chars)} karakter`}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose render={<Button type="button" variant="outline" />}>Kapat</DialogClose>
            <Button type="button" disabled={!state.text || state.loading} onClick={onCopy}>
              {status === "copied" ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
              {status === "copied" ? "Kopyalandı" : "Kopyala"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
