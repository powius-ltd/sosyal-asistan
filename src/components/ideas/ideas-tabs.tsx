"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TAP } from "@/components/weekly-plan/tap-target";
import { cn } from "@/lib/utils";
import type { IdeaStatus } from "@/lib/domain/intel";

export interface IdeasTab {
  value: IdeaStatus;
  label: string;
  count: number;
  /** Sunucuda çizilmiş kart listesi (ya da boş durum). */
  content: ReactNode;
}

/** Durum sekmeleri. İçerik sunucuda çizilir; bu bileşen yalnız sekme geçişini yönetir. */
export function IdeasTabs({ tabs, defaultValue }: { tabs: IdeasTab[]; defaultValue: IdeaStatus }) {
  return (
    // key: `?id=` ile başka bir fikre gidilince (varsayılan sekme değişir) sekme durumu yeniden kurulur.
    <Tabs key={defaultValue} defaultValue={defaultValue} className="gap-4">
      {/* overflow-y-hidden: `overflow-x-auto` tek başına dikey ekseni de `auto` yapar ve gereksiz dikey kaydırma okları çıkar. */}
      <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden group-data-horizontal/tabs:h-auto md:group-data-horizontal/tabs:h-8">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className={cn("flex-none px-2.5", TAP)}>
            {tab.label}
            <span className="text-xs text-muted-foreground tabular">{tab.count}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
