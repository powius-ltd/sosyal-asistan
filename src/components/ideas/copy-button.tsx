"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Metni panoya kopyalar; kısa süre "kopyalandı" ikonu gösterir. Pano erişimi yoksa hata bildirimi verir. */
export function CopyButton({ text, label = "Kopyala" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Panoya kopyalanamadı. Metni elle seçip kopyalayın.");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="max-md:size-12"
      onClick={copy}
      aria-label={copied ? "Kopyalandı" : label}
      title={copied ? "Kopyalandı" : label}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </Button>
  );
}
