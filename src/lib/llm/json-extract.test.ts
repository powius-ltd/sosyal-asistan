import { describe, expect, it } from "vitest";
import { z } from "zod";

import { extractJson, formatZodIssues, parseLlmJson } from "@/lib/llm/json-extract";

const ok = (result: ReturnType<typeof extractJson>) => {
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe("extractJson", () => {
  it("tüm metin JSON ise olduğu gibi (nesne, dizi, ilkel)", () => {
    expect(ok(extractJson('{"a": 1}'))).toEqual({ ok: true, value: { a: 1 }, how: "whole" });
    expect(ok(extractJson(' \n[1, 2, 3]\n ')).value).toEqual([1, 2, 3]);
    expect(ok(extractJson("42")).value).toBe(42);
  });

  it("BOM ve baştaki/sondaki boşluk yutulur", () => {
    expect(ok(extractJson('﻿  {"a":1}  ')).value).toEqual({ a: 1 });
  });

  it("çitli blok: ```json ve etiketsiz çit; çit öncesi/sonrası açıklama metni yok sayılır", () => {
    const text = 'İşte sonuç:\n```json\n{"hookText": "Stop scrolling.", "n": 2}\n```\nUmarım yardımcı olur.';
    expect(ok(extractJson(text))).toEqual({ ok: true, value: { hookText: "Stop scrolling.", n: 2 }, how: "fenced" });
    expect(ok(extractJson('```\n{"a": [1]}\n```')).value).toEqual({ a: [1] });
    expect(ok(extractJson('```JSON\r\n{"a": 1}\r\n```')).value).toEqual({ a: 1 });
  });

  it("birden çok çit: json etiketli olan önce; bozuk çit atlanıp çözülebilene geçilir", () => {
    const text = '```js\nconsole.log(1)\n```\n```json\n{"doğru": true}\n```';
    expect(ok(extractJson(text)).value).toEqual({ doğru: true });
    expect(ok(extractJson('```json\n{bozuk\n```\n```\n{"ikinci": 2}\n```')).value).toEqual({ ikinci: 2 });
  });

  it("çitsiz: düz metin içindeki dengeli nesne/dizi", () => {
    expect(ok(extractJson('Cevap: {"a": {"b": [1, 2]}} bitti.'))).toEqual({ ok: true, value: { a: { b: [1, 2] } }, how: "balanced" });
    expect(ok(extractJson("Liste şu: [1, 2, 3] ve devamı")).value).toEqual([1, 2, 3]);
  });

  it("dize içindeki süslü parantez/çit/kaçışlı tırnak dengeyi bozmaz", () => {
    const text = 'Not {önemli değil} ... {"quote": "he said \\"use } carefully\\" { ok", "n": 1} son';
    expect(ok(extractJson(text)).value).toEqual({ quote: 'he said "use } carefully" { ok', n: 1 });
    expect(ok(extractJson('```json\n{"t": "```ters```"}\n```')).value).toBeDefined();
  });

  it("metin içindeki çözülemeyen {…} atlanır, sonraki çözülebilen alınır", () => {
    expect(ok(extractJson('Şablon {isim} için: {"x": 1}')).value).toEqual({ x: 1 });
  });

  it("sondaki virgül son çare olarak onarılır (dize içindeki virgüle dokunmaz)", () => {
    const result = ok(extractJson('{"a": [1, 2,], "b": "x,}", }'));
    expect(result.how).toBe("repaired");
    expect(result.value).toEqual({ a: [1, 2], b: "x,}" });
  });

  it("çözülemeyen yanıt ok:false + sebep (sessizce boş değer dönmez)", () => {
    for (const text of ["", "   ", "Üzgünüm, yapamam.", '{"a": ', "```json\n```"]) {
      const result = extractJson(text);
      expect(result.ok, JSON.stringify(text)).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("büyük yanıtta da çalışır (çok sayıda yanlış başlangıç)", () => {
    const noise = "{ ".repeat(500);
    expect(ok(extractJson(`${noise} {"son": true}`)).value).toEqual({ son: true });
  });
});

describe("parseLlmJson + formatZodIssues", () => {
  const schema = z.object({ hookText: z.string().min(1), sections: z.array(z.object({ type: z.enum(["hook", "cta"]), quote: z.string() })) });

  it("geçerli yanıt: doğrulanmış değer + ayıklama yolu", () => {
    const raw = '```json\n{"hookText": "A", "sections": [{"type": "hook", "quote": "A"}]}\n```';
    expect(parseLlmJson(raw, schema)).toMatchObject({ ok: true, how: "fenced", value: { hookText: "A" } });
  });

  it("şema hatası: issues alan yolunu ve mesajı verir (düzeltme turu girdisi)", () => {
    const result = parseLlmJson('{"hookText": "", "sections": [{"type": "value", "quote": 5}]}', schema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("JSON şemaya uymuyor.");
    expect(result.issues).toContain("hookText:");
    expect(result.issues).toContain("sections.0.type:");
    expect(result.issues).toContain("sections.0.quote:");
  });

  it("JSON yoksa reason döner, issues yok", () => {
    const result = parseLlmJson("düz metin", schema);
    expect(result).toEqual({ ok: false, reason: "Yanıtta çözülebilir JSON bulunamadı." });
  });

  it("formatZodIssues: en çok `max` satır + kalan sayısı; kök hatası '(kök)'", () => {
    const many = z.array(z.number()).safeParse(["a", "b", "c", "d"]);
    if (many.success) throw new Error("beklenmedik başarı");
    const text = formatZodIssues(many.error, 2);
    expect(text.split("\n")).toHaveLength(3);
    expect(text).toContain("(+2 hata daha)");
    const root = z.string().safeParse(5);
    if (root.success) throw new Error("beklenmedik başarı");
    expect(formatZodIssues(root.error)).toMatch(/^\(kök\):/);
  });
});
