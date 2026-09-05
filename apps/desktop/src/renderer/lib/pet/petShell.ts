/** Pet overlay hash — used by the slim `#/pet` webview. */
export function isPetShellHash(hash: string | null | undefined): boolean {
  const h = (hash ?? "").trim();
  return h === "#/pet" || h.startsWith("#/pet?");
}
