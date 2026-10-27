/**
 * `.env.local` içeriğini değiştirme (saf): verilen anahtarları günceller ya da sona ekler; öteki satırlara, yorumlara ve satır sonu
 * biçimine (LF / CRLF) dokunmaz. Yorum satırındaki `# ANAHTAR=` güncellenmez (gerçek satır aranır).
 */
export function upsertEnv(content: string, entries: Readonly<Record<string, string>>): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content === "" ? [] : content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  for (const [key, value] of Object.entries(entries)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Geçersiz ortam değişkeni adı: ${key}`);
    if (/[\r\n]/.test(value)) throw new Error(`${key} değeri tek satır olmalı.`);
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  return `${lines.join(eol)}${eol}`;
}
