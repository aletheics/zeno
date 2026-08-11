/**
 * Independent proxy prefs for AI (agent-host / models / OAuth) vs app (Electron session).
 * Stored in zeno-desktop.json; AI channel is injected into utilityProcess env.
 */

export type ProxyMode = "off" | "system" | "custom";

export interface ProxyChannelPrefs {
  /** off = direct; system = OS/env proxy; custom = fixed server URL. */
  mode: ProxyMode;
  /** e.g. http://127.0.0.1:7890 — used when mode is custom. */
  server?: string;
  /** Comma-separated NO_PROXY hosts — used when mode is custom. */
  bypass?: string;
}

export interface ProxyPrefs {
  ai: ProxyChannelPrefs;
  app: ProxyChannelPrefs;
}

export const DEFAULT_PROXY_CHANNEL: ProxyChannelPrefs = { mode: "system" };

export const DEFAULT_PROXY_PREFS: ProxyPrefs = {
  ai: { ...DEFAULT_PROXY_CHANNEL },
  app: { ...DEFAULT_PROXY_CHANNEL },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeProxyMode(value: unknown): ProxyMode {
  if (value === "off" || value === "system" || value === "custom") return value;
  return "system";
}

export function normalizeProxyChannel(raw: unknown): ProxyChannelPrefs {
  if (!isRecord(raw)) return { ...DEFAULT_PROXY_CHANNEL };
  const mode = normalizeProxyMode(raw.mode);
  const server = typeof raw.server === "string" ? raw.server.trim() : "";
  const bypass = typeof raw.bypass === "string" ? raw.bypass.trim() : "";
  const next: ProxyChannelPrefs = { mode };
  if (server) next.server = server;
  if (bypass) next.bypass = bypass;
  return next;
}

export function normalizeProxyPrefs(raw: unknown): ProxyPrefs {
  if (!isRecord(raw))
    return {
      ...DEFAULT_PROXY_PREFS,
      ai: { ...DEFAULT_PROXY_CHANNEL },
      app: { ...DEFAULT_PROXY_CHANNEL },
    };
  return {
    ai: normalizeProxyChannel(raw.ai),
    app: normalizeProxyChannel(raw.app),
  };
}

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
] as const;

/** Strip all proxy-related keys so mode=off is a clean slate. */
export function stripProxyEnv(env: Record<string, string>): Record<string, string> {
  const next = { ...env };
  for (const key of PROXY_ENV_KEYS) delete next[key];
  return next;
}

/**
 * Apply one channel onto an env map.
 * - off: no proxy vars
 * - system: copy from `launchEnv` (process env at app start / parent)
 * - custom: HTTP(S)_PROXY = server, optional NO_PROXY
 */
export function applyProxyChannelToEnv(
  env: Record<string, string>,
  channel: ProxyChannelPrefs,
  launchEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  let next = stripProxyEnv(env);
  if (channel.mode === "off") {
    return next;
  }
  if (channel.mode === "system") {
    for (const key of PROXY_ENV_KEYS) {
      const value = launchEnv[key];
      if (typeof value === "string" && value.trim()) next[key] = value.trim();
    }
    return next;
  }
  // custom
  const server = channel.server?.trim();
  if (server) {
    next.HTTP_PROXY = server;
    next.HTTPS_PROXY = server;
    next.http_proxy = server;
    next.https_proxy = server;
  }
  const bypass = channel.bypass?.trim();
  if (bypass) {
    next.NO_PROXY = bypass;
    next.no_proxy = bypass;
  }
  return next;
}

/** Hint undici / Node experimental env proxy support when proxy vars are present. */
export function withNodeEnvProxyFlag(env: Record<string, string>): Record<string, string> {
  const hasProxy = Boolean(
    env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy || env.ALL_PROXY,
  );
  if (!hasProxy) return env;
  return { ...env, NODE_USE_ENV_PROXY: "1" };
}

/** Electron session.setProxy config for the app channel. */
export function electronProxyConfig(channel: ProxyChannelPrefs): {
  mode: "direct" | "system" | "fixed_servers";
  proxyRules?: string;
  proxyBypassRules?: string;
} {
  if (channel.mode === "off") {
    return { mode: "direct" };
  }
  if (channel.mode === "system") {
    return { mode: "system" };
  }
  const server = channel.server?.trim();
  if (!server) {
    return { mode: "direct" };
  }
  const bypass = channel.bypass?.trim() || "<local>";
  return {
    mode: "fixed_servers",
    proxyRules: server,
    proxyBypassRules: bypass,
  };
}
