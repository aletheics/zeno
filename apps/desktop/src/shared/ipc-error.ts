/** Strip Electron's `invoke` wrapper so dialogs show the host/main error only. */
export function unwrapRemoteIpcError(message: string): string {
  const match = /^Error invoking remote method '[^']+': (?:Error: )?(.*)$/su.exec(message);
  return match?.[1]?.trim() || message;
}
