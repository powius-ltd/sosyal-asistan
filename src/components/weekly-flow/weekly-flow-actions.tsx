"use client";

import Link from "next/link";
import { useState } from "react";

import { askAssistant } from "@/components/chat/chat-bridge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WeeklyFlowAction } from "@/lib/weekly-flow/types";

interface Props {
  action: WeeklyFlowAction;
  label: string;
  /** Birincil (etkin adımın ana eylemi) ya da ikincil görünüm. */
  primary?: boolean;
  /** Sohbet kapalıyken gösterilen düz cümle. */
  unavailableNote: string;
}

const SIZE = "min-h-tap md:min-h-9 px-3";

/** Şerit eylem düğmesi (en küçük istemci yaprağı): `link` bağlantıdır, `chat` Asistan'a mesaj gönderir (`chat-bridge`). */
export function WeeklyFlowActionButton({ action, label, primary = false, unavailableNote }: Props) {
  const [failed, setFailed] = useState(false);
  const variant = primary ? "default" : "outline";
  if (action.kind === "link") {
    return (
      <Link href={action.href} className={cn(buttonVariants({ variant }), SIZE)}>
        {label}
      </Link>
    );
  }
  return (
    <>
      <Button type="button" variant={variant} className={SIZE} onClick={() => setFailed(!askAssistant(action.message))}>
        {label}
      </Button>
      {failed ? (
        <p role="status" className="basis-full text-xs text-muted-foreground">
          {unavailableNote}
        </p>
      ) : null}
    </>
  );
}
