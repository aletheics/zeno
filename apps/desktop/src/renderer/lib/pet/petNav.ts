/**
 * Settings → 宠物 navigation contract (pix).
 *
 * pix has no URL-hash routing for settings — the active section lives in
 * `useShellStore.settingsSection` — so this is a vestigial constant kept only
 * so the ported `index.ts` barrel stays intact. `petOpenSettings` goes through
 * Electron IPC (`window.zeno.pet.openSettings`) instead of a hash.
 */
export const PET_SETTINGS_SECTION = "pet" as const;

/** Canonical destination label (unused at runtime in pix). */
export const PET_SETTINGS_HASH = "#settings/pet";

export function petSettingsHash(): string {
  return PET_SETTINGS_HASH;
}
