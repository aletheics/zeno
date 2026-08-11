/**
 * Probe common local proxy ports (Clash / V2RayN / Surge / …) and env URLs.
 * Used by settings 「自动发现」 for custom proxy server fields.
 */

import net from "node:net";

export interface LocalProxyCandidate {
  /** Full proxy URL, e.g. http://127.0.0.1:7890 */
  url: string;
  port: number;
  /** Best-effort product hint for UI status (not localization). */
  label: string;
  source: "probe" | "env";
}

/** Well-known mixed/HTTP/SOCKS ports, highest priority first. */
export const LOCAL_PROXY_PROBE_TARGETS = [
  { port: 7890, scheme: "http" as const, label: "Clash" },
  { port: 7897, scheme: "http" as const, label: "Clash Verge" },
  { port: 7891, scheme: "http" as const, label: "Clash" },
  { port: 10809, scheme: "http" as const, label: "V2RayN" },
  { port: 10808, scheme: "socks5" as const, label: "V2RayN" },
  { port: 1087, scheme: "http" as const, label: "HTTP" },
  { port: 1080, scheme: "socks5" as const, label: "SOCKS" },
  { port: 6152, scheme: "http" as const, label: "Surge" },
  { port: 8888, scheme: "http" as const, label: "HTTP" },
  { port: 8118, scheme: "http" as const, label: "Privoxy" },
  { port: 3128, scheme: "http" as const, label: "Squid" },
  { port: 20171, scheme: "http" as const, label: "Qv2ray" },
] as const;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLocalProxyHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return LOCAL_HOSTS.has(h);
}

/** Normalize env proxy value into a candidate URL when it points at loopback. */
export function candidateFromEnvUrl(raw: string): LocalProxyCandidate | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const u = new URL(withScheme);
    if (!isLocalProxyHost(u.hostname)) return null;
    const port = u.port
      ? Number(u.port)
      : u.protocol === "https:"
        ? 443
        : u.protocol === "http:"
          ? 80
          : 0;
    if (!port || !Number.isFinite(port)) return null;
    const scheme = (u.protocol.replace(/:$/, "") || "http").toLowerCase();
    const host = u.hostname === "localhost" || u.hostname === "::1" ? "127.0.0.1" : u.hostname;
    const url = `${scheme}://${host}:${port}`;
    return { url, port, label: "env", source: "env" };
  } catch {
    return null;
  }
}

export function collectEnvLocalProxies(
  env: NodeJS.ProcessEnv = process.env,
): LocalProxyCandidate[] {
  const keys = [
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "ALL_PROXY",
    "https_proxy",
    "http_proxy",
    "all_proxy",
  ] as const;
  const out: LocalProxyCandidate[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const value = env[key];
    if (typeof value !== "string") continue;
    const c = candidateFromEnvUrl(value);
    if (!c || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

export function probeTcpPort(host: string, port: number, timeoutMs = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function discoverLocalProxies(
  options: {
    env?: NodeJS.ProcessEnv;
    host?: string;
    timeoutMs?: number;
    /** Inject for tests — defaults to real TCP probe. */
    probe?: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  } = {},
): Promise<LocalProxyCandidate[]> {
  const host = options.host ?? "127.0.0.1";
  const timeoutMs = options.timeoutMs ?? 250;
  const probe = options.probe ?? probeTcpPort;
  const envHits = collectEnvLocalProxies(options.env ?? process.env);

  const openFlags = await Promise.all(
    LOCAL_PROXY_PROBE_TARGETS.map(async (t) => ({
      ...t,
      open: await probe(host, t.port, timeoutMs),
    })),
  );

  const probed: LocalProxyCandidate[] = openFlags
    .filter((t) => t.open)
    .map((t) => ({
      url: `${t.scheme}://${host}:${t.port}`,
      port: t.port,
      label: t.label,
      source: "probe" as const,
    }));

  // Prefer probe order (known product ports), then env-only extras.
  const seen = new Set<string>();
  const merged: LocalProxyCandidate[] = [];
  for (const c of [...probed, ...envHits]) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    merged.push(c);
  }
  return merged;
}
