import { describe, expect, it } from "vitest";

import { certaintyProblem, rivalMentionProblem } from "@/lib/llm/brief-tone";

describe("rivalMentionProblem", () => {
  it("rakip kökünü (çekim ekleri ve büyük harf dahil) yakalar, kendi tutanlarını serbest bırakır", () => {
    for (const text of ["Rakiplerde işe yaramış.", "RAKİP videosu", "rakibin hikâyesi"]) expect(rivalMentionProblem("S1.why", text)).toContain("S1.why");
    expect(rivalMentionProblem("S1.why", "Kendi tutan videonun devamı.")).toBeUndefined();
    expect(rivalMentionProblem("S1.why", undefined)).toBeUndefined();
  });

  it("'rakipsiz' rakipten söz etmek değildir (konu gereği geçebilir); 'rakipsiz' ile birlikte gerçek rakip sözü yine yakalanır", () => {
    for (const text of ["Rakipsiz bir hesap için plan", "rakipsizlik avantajı", "RAKİPSİZ"]) expect(rivalMentionProblem("topic", text)).toBeUndefined();
    expect(rivalMentionProblem("topic", "Rakipsiz görünse de rakiplerde işe yaramış")).toContain("topic");
  });
});

describe("certaintyProblem", () => {
  it("düşük ve orta güvende kesinlik sözü sorun, yüksekte serbest", () => {
    for (const word of ["Bundan eminim.", "Bu kesin tutar.", "Kesinlikle işe yarar.", "Garanti sonuç verir."]) {
      expect(certaintyProblem("S1.why", word, "low")).toContain("kesinlik sözü");
      expect(certaintyProblem("S1.why", word, "medium")).toContain("kesinlik sözü");
      expect(certaintyProblem("S1.why", word, "high")).toBeUndefined();
    }
  });

  it("ölçülü ifade ve benzer kökler sorun değil", () => {
    expect(certaintyProblem("S1.why", "Denemeye değer; işe yarayabilir.", "low")).toBeUndefined();
    expect(certaintyProblem("S1.why", "Kesintisiz bir seri.", "low")).toBeUndefined();
    expect(certaintyProblem("S1.why", "Bundan eminim.", undefined)).toBeUndefined();
  });

  it("olumsuz ve ölçülü kullanım sorun sayılmaz (B3)", () => {
    for (const text of ["Sonuçtan emin olamayız.", "Kesin değil ama denemeye değer.", "Başarı garantisi yok.", "Bundan emin olunamaz.", "Garanti veremem, denemeye değer.", "Kesin söylemek zor.", "Emin olmak zor."]) {
      expect(certaintyProblem("S1.why", text, "low")).toBeUndefined();
      expect(certaintyProblem("S1.why", text, "medium")).toBeUndefined();
    }
  });

  it("olumlu kesinlik sözü yine yakalanır; olumsuz cümlenin ardından gelen olumlu söz de", () => {
    for (const text of ["Eminim, tutar.", "Kesinlikle işe yarar.", "Garanti ederim.", "Emin ol, işe yarar.", "Kesin değil. Ama kesinlikle denemelisin."]) expect(certaintyProblem("S1.why", text, "low")).toContain("kesinlik sözü");
  });

  it("güçlü genelleme düşük/orta güvende yakalanır, yüksekte serbest (B3)", () => {
    for (const text of ["Bu konu sürekli iyi gidiyor.", "Her zaman tutuyor.", "Bu biçim her zaman iyi tutar.", "Daima işe yarar."]) {
      expect(certaintyProblem("S3.why", text, "low")).toContain("kesinlik sözü");
      expect(certaintyProblem("S3.why", text, "medium")).toContain("kesinlik sözü");
      expect(certaintyProblem("S3.why", text, "high")).toBeUndefined();
    }
  });

  it("genelleme yanlış pozitifleri: benzer ama iddia taşımayan cümleler sorun değil", () => {
    for (const text of ["Her zaman denemeye değer.", "Sürekli çekiyorlar.", "Hep birlikte çalışıyoruz.", "Bu konu sürekli iyi gitmiyor.", "Çoğu zaman iyi gidiyor.", "Her zaman değişir mi bilmiyoruz."]) {
      expect(certaintyProblem("S3.why", text, "low")).toBeUndefined();
    }
  });
});
