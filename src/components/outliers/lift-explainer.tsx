import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { OUTLIERS_PLAIN } from "@/lib/plain-language-results";

/** "Tutan video ne demek?" açıklama kutusu (düz dil: normalinin kaç katı izlendiği). */
export function LiftExplainer() {
  return (
    <Alert className="mb-4">
      <Info aria-hidden />
      <AlertDescription>{OUTLIERS_PLAIN.explainer}</AlertDescription>
    </Alert>
  );
}
