/**
 * Environment panel: which sections are visible in the session env panel.
 * Stored in localStorage (desktop chrome only).
 */

export type EnvPanelSectionId =
  | "changes"
  | "cwd"
  | "branch"
  | "gitActions"
  | "localServices"
  | "openIn";

export type EnvPanelVisibility = Record<EnvPanelSectionId, boolean>;

const KEY = "pix.envPanel.visibility";

export const ENV_PANEL_SECTION_IDS: EnvPanelSectionId[] = [
  "changes",
  "cwd",
  "branch",
  "gitActions",
  "openIn",
  "localServices",
];

export const DEFAULT_ENV_PANEL_VISIBILITY: EnvPanelVisibility = {
  changes: true,
  cwd: true,
  branch: true,
  gitActions: true,
  localServices: true,
  openIn: true,
};

export function loadEnvPanelVisibility(): EnvPanelVisibility {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_ENV_PANEL_VISIBILITY };
    const parsed = JSON.parse(raw) as Partial<EnvPanelVisibility>;
    return {
      ...DEFAULT_ENV_PANEL_VISIBILITY,
      ...parsed,
    } as EnvPanelVisibility;
  } catch {
    return { ...DEFAULT_ENV_PANEL_VISIBILITY };
  }
}

export function saveEnvPanelVisibility(next: EnvPanelVisibility): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function setEnvPanelSectionVisible(
  id: EnvPanelSectionId,
  visible: boolean,
): EnvPanelVisibility {
  const next = { ...loadEnvPanelVisibility(), [id]: visible };
  saveEnvPanelVisibility(next);
  return next;
}
