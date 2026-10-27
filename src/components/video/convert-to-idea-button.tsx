import { Lightbulb } from "lucide-react";

import { Hint } from "@/components/common/hint";
import { Button } from "@/components/ui/button";

/**
 * "Fikre dönüştür": repository'de fikir oluşturma metodu henüz yok (fikirler Faz 2'de LLM ile üretilir),
 * bu yüzden düğme devre dışıdır. Devre dışı düğme fareyi yakalamaz; ipucu bu yüzden sarmalayıcıdadır.
 */
export function ConvertToIdeaButton() {
  return (
    <Hint content="Fikre dönüştürme yakında açılacak." label="Fikre dönüştür: yakında">
      <Button variant="outline" disabled>
        <Lightbulb aria-hidden />
        Fikre dönüştür
      </Button>
    </Hint>
  );
}
