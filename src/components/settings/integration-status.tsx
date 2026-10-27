import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus } from "@/lib/domain/connection";
import { cn } from "@/lib/utils";

const PRESENT = "border-transparent bg-success-soft text-success-soft-foreground";
const MISSING = "border-transparent bg-danger-soft text-danger-soft-foreground";
/** İsteğe bağlı değişken yok: hata değil (varsayılan/PATH kullanılır). */
const DEFAULTED = "border-transparent bg-muted text-muted-foreground";

/**
 * Entegrasyon anahtarlarının durumu. YALNIZ değişken adı ve VAR/YOK gösterilir; değer bu
 * bileşene hiç ulaşmaz (repository yalnız `present: boolean` döndürür).
 */
export function IntegrationStatusList({ integrations }: { integrations: IntegrationStatus[] }) {
  if (integrations.length === 0) {
    return <p className="text-sm text-muted-foreground">Entegrasyon bilgisi alınamadı.</p>;
  }

  return (
    <ul className="divide-y">
      {integrations.map((integration) => (
        <li key={integration.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{integration.label}</p>
              {integration.note ? <p className="text-xs text-muted-foreground">{integration.note}</p> : null}
            </div>
            <Badge variant="outline" className={cn(integration.configured ? PRESENT : integration.optional ? DEFAULTED : MISSING)}>
              {integration.configured ? "Hazır" : integration.optional ? "Varsayılan" : "Eksik"}
            </Badge>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {integration.envVars.map((envVar) => (
              <li key={envVar.name} className="flex items-center gap-1.5">
                <code className="font-mono text-xs text-muted-foreground">{envVar.name}</code>
                <Badge
                  variant="outline"
                  className={cn("h-4 px-1.5 text-[0.65rem]", envVar.present ? PRESENT : integration.optional ? DEFAULTED : MISSING)}
                >
                  {envVar.present ? "VAR" : "YOK"}
                </Badge>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
