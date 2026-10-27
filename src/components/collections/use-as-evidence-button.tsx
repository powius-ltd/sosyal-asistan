import { Lightbulb } from "lucide-react";

import { Hint } from "@/components/common/hint";
import { Button } from "@/components/ui/button";

/**
 * "Fikir için kanıt olarak kullan": koleksiyonu fikir kanıtı olarak seçmek. Repository'de fikir oluşturma metodu yok
 * (fikirler Faz 2'de LLM ile üretilir), bu yüzden düğme devre dışıdır. Devre dışı düğme fareyi yakalamaz;
 * ipucu bu yüzden sarmalayıcıdadır.
 */
export function UseAsEvidenceButton() {
  return (
    <Hint content="Faz 2: fikir üretimi" label="Fikir için kanıt olarak kullan: Faz 2: fikir üretimi">
      <Button type="button" variant="outline" disabled>
        <Lightbulb data-icon="inline-start" aria-hidden />
        Fikir için kanıt olarak kullan
      </Button>
    </Hint>
  );
}
