/**
 * Kurulum / günlük betiklerinin alt süreç yardımcısı: kabuksuz `execFile` (komut ve argümanlar sabit; yalnız Windows'ta `.cmd`
 * kabuklarını bulabilmek için kabuk açılır, argümanlara kullanıcı girdisi KONMAZ). Program yoksa `undefined` döner.
 */
import { execFile } from "node:child_process";

import type { CommandResult } from "@/lib/setup/checks";

export function execCommand(command: string, args: readonly string[], options: { timeoutMs?: number; inherit?: boolean; env?: Readonly<Record<string, string>> } = {}): Promise<CommandResult | undefined> {
  return new Promise((resolve) => {
    const child = execFile(command, [...args], { env: options.env === undefined ? process.env : { ...process.env, ...options.env }, timeout: options.timeoutMs ?? 30_000, maxBuffer: 8 * 1024 * 1024, shell: process.platform === "win32" && !options.inherit, windowsHide: true }, (error, stdout) => {
      if (error === null) return resolve({ exitCode: 0, stdout });
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return resolve(undefined);
      resolve({ exitCode: typeof code === "number" ? code : 1, stdout: stdout ?? "" });
    });
    if (options.inherit) {
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
    }
  });
}
