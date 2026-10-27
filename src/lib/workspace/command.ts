/**
 * Kopyalanabilir betik komutu (saf, istemcide de çalışır): `npm run <betik> -- --workspace=<slug>`. Panelde gösterilen her betik komutu
 * çalışma alanını AÇIKÇA taşır; bayraksız komut varsayılan çalışma alanında çalışır (yanlış yerde para harcar). Slug yoksa tam kimlik
 * (`--workspace` kimliği de kabul eder: `resolve-arg.ts`). Hesap/marka adı kaynağa gömülmez: çalışma alanı parametre olarak gelir.
 */

export interface WorkspaceCommandRef {
  id: string;
  slug?: string | null;
}

/** `--workspace=` değeri: slug, yoksa tam kimlik. */
export function workspaceArgValue({ id, slug }: WorkspaceCommandRef): string {
  const name = slug?.trim();
  return name ? name : id;
}

/** `npm run <betik> -- --workspace=<slug|kimlik>`; betiğe özel bayraklar sonuna eklenebilir (`… --dry-run`). */
export function workspaceCommand(script: string, workspace: WorkspaceCommandRef): string {
  return `npm run ${script} -- --workspace=${workspaceArgValue(workspace)}`;
}
