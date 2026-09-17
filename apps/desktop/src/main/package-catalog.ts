/**
 * Official plugin gallery search against the npm registry.
 *
 * The gallery is the `pi-package` keyword index (same source as pi.dev/packages).
 * We honor the user's configured registry (`npm_config_registry` / `~/.npmrc`, see
 * `npmRegistryBaseUrl`) so lookups stay fast behind a mirror — but several mirrors
 * (e.g. `registry.npmmirror.com`) proxy only name/description search and silently
 * drop npm's `keywords:` qualifier, answering HTTP 200 with an empty result set.
 * That surfaced as a misleading 「无匹配插件」 empty state in the Discover tab, so
 * when the configured registry yields nothing we retry the official registry once.
 */

import type { CatalogPackage, CatalogSearchResult } from "@zeno/contracts";
import { npmRegistryBaseUrl } from "./pi-sdk.ts";

export const OFFICIAL_NPM_REGISTRY = "https://registry.npmjs.org";

/** Deadline for the retry, so Discover never hangs when the official registry is blocked. */
const FALLBACK_TIMEOUT_MS = 8_000;

/** Raw shape of `GET /-/v1/search` — only the fields we consume. */
interface NpmSearchResponse {
  total?: number;
  objects?: Array<{
    package?: {
      name?: string;
      description?: string;
      version?: string;
      date?: string;
      keywords?: string[];
      publisher?: { username?: string };
    };
    downloads?: { weekly?: number };
  }>;
}

/** `keywords:pi-package` is the gallery index; a user query narrows it further. */
export function piPackageSearchText(query?: string): string {
  const q = query?.trim() ?? "";
  return q ? `keywords:pi-package ${q}` : "keywords:pi-package";
}

/** Map a registry response onto gallery entries. Pure. */
export function parseCatalogSearchResponse(
  data: NpmSearchResponse,
  offset: number,
): CatalogSearchResult {
  const items: CatalogPackage[] = [];
  for (const obj of data.objects ?? []) {
    const pkg = obj.package;
    if (!pkg?.name) continue;
    const entry: CatalogPackage = {
      name: pkg.name,
      description: pkg.description?.trim() || "",
      version: pkg.version || "latest",
      source: `npm:${pkg.name}`,
    };
    if (pkg.publisher?.username) entry.publisher = pkg.publisher.username;
    if (typeof obj.downloads?.weekly === "number") entry.weeklyDownloads = obj.downloads.weekly;
    if (pkg.date) entry.updatedAt = pkg.date;
    if (Array.isArray(pkg.keywords))
      entry.keywords = pkg.keywords.filter((k) => typeof k === "string");
    items.push(entry);
  }
  const total =
    typeof data.total === "number" && Number.isFinite(data.total)
      ? Math.max(data.total, items.length + offset)
      : offset + items.length;
  return { packages: items, total };
}

async function requestCatalogPage(
  baseUrl: string,
  text: string,
  limit: number,
  offset: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<NpmSearchResponse> {
  const url = `${baseUrl}/-/v1/search?text=${encodeURIComponent(text)}&size=${limit}&from=${offset}`;
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": "zeno-desktop" },
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new Error(`插件目录请求失败 (${res.status})`);
  }
  return (await res.json()) as NpmSearchResponse;
}

export interface SearchPiPackageCatalogOptions {
  query?: string | undefined;
  size?: number | undefined;
  from?: number | undefined;
  /** Registry base URL; defaults to the user's configured registry. */
  baseUrl?: string | undefined;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}

/** Search the gallery, retrying the official registry when a mirror can't answer. */
export async function searchPiPackageCatalog(
  options: SearchPiPackageCatalogOptions = {},
): Promise<CatalogSearchResult> {
  const {
    query,
    size = 20,
    from = 0,
    fetchImpl = fetch,
    timeoutMs = FALLBACK_TIMEOUT_MS,
  } = options;
  const text = piPackageSearchText(query);
  const limit = Math.min(100, Math.max(1, Math.floor(size)));
  const offset = Math.max(0, Math.floor(from));
  const baseUrl = (options.baseUrl ?? npmRegistryBaseUrl()).replace(/\/+$/, "");

  const primary = parseCatalogSearchResponse(
    await requestCatalogPage(baseUrl, text, limit, offset, fetchImpl),
    offset,
  );
  // Only a non-official registry can be the qualifier-dropping kind, and only an
  // empty page beside a possibly-real index is worth a second request.
  if (primary.packages.length > 0 || baseUrl === OFFICIAL_NPM_REGISTRY) return primary;

  console.warn(
    `[zeno] package catalog: ${baseUrl} returned no hits for "${text}"; retrying ${OFFICIAL_NPM_REGISTRY}`,
  );
  const official = parseCatalogSearchResponse(
    await requestCatalogPage(
      OFFICIAL_NPM_REGISTRY,
      text,
      limit,
      offset,
      fetchImpl,
      AbortSignal.timeout(timeoutMs),
    ),
    offset,
  );
  return official;
}
