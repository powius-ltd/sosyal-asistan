import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Yayın uyum hatırlatması: insan onayı + 1 Ağustos 2026 reklam yönetmeliği. */
export function ComplianceNotice() {
  return (
    <Alert>
      <ShieldCheck aria-hidden />
      <AlertTitle>Yayın uyumu</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4">
          <li>Her yayın insan onayı olmadan gönderilmez.</li>
          <li>
            Ücretli iş birliği içeriklerinde “reklam” ibaresi ve yapay zekâ ile üretilmiş karakter açıklaması zorunlu (1
            Ağustos 2026 yönetmeliği). Onaylamadan önce açıklamayı kontrol et.
          </li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
