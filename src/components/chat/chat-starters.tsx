import { Button } from "@/components/ui/button";

/** Sohbetin tek cümlelik tanıtımı (boş pencerenin karşılaması). */
export const CHAT_INTRO_TEXT =
  "Hesabınla ilgili soru sorabilirsin; yanıtlarımı panelindeki verilere ve kanıt bağlantılarına dayandırırım. Bu haftanın fikrini seçmeni, fişini yazmamı ya da fişi değiştirmemi (“UGC olsun” gibi) de isteyebilirsin.";

interface ChatStartersProps {
  starters: readonly string[];
  onPick: (question: string) => void;
  disabled: boolean;
}

/** Hazır sorular: her biri ≥ 48 px düğme; basınca soru doğrudan sorulur. Soru yoksa hiç çizilmez. */
export function ChatStarters({ starters, onPick, disabled }: ChatStartersProps) {
  if (starters.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Hazır sorular">
      {starters.map((question) => (
        <li key={question} className="min-w-0">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-tap w-full justify-start px-3 py-2 text-left text-base whitespace-normal md:text-sm"
            disabled={disabled}
            onClick={() => onPick(question)}
          >
            {question}
          </Button>
        </li>
      ))}
    </ul>
  );
}
