import { describe, expect, it } from "vite-plus/test";
import {
  OFFICIAL_NPM_REGISTRY,
  parseCatalogSearchResponse,
  piPackageSearchText,
  searchPiPackageCatalog,
} from "./package-catalog.ts";

const MIRROR = "https://registry.npmmirror.com";

function searchResponse(packages: string[], total = packages.length) {
  return {
    total,
    objects: packages.map((name) => ({
      package: { name, description: ` ${name} desc `, version: "1.0.0" },
      downloads: { weekly: 7 },
    })),
  };
}

/** Fake fetch that answers per registry and records every requested URL. */
function stubFetch(byBase: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const base = Object.keys(byBase).find((b) => url.startsWith(b));
    if (!base) throw new Error(`unexpected registry: ${url}`);
    return { ok: true, status: 200, json: async () => byBase[base] } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("piPackageSearchText", () => {
  it("scopes to the gallery keyword, optionally narrowed by a query", () => {
    expect(piPackageSearchText()).toBe("keywords:pi-package");
    expect(piPackageSearchText("   ")).toBe("keywords:pi-package");
    expect(piPackageSearchText(" web access ")).toBe("keywords:pi-package web access");
  });
});

describe("parseCatalogSearchResponse", () => {
  it("maps gallery entries and skips nameless objects", () => {
    const result = parseCatalogSearchResponse(
      {
        total: 10008,
        objects: [
          {
            package: { name: "pi-mcp-adapter", description: "  MCP adapter  ", version: "2.34.0" },
          },
          { package: { description: "no name" } },
          {},
        ],
      },
      0,
    );
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toMatchObject({
      name: "pi-mcp-adapter",
      description: "MCP adapter",
      version: "2.34.0",
      source: "npm:pi-mcp-adapter",
    });
    expect(result.total).toBe(10008);
  });

  it("defaults version, clamps total past the returned page, and falls back to offset", () => {
    expect(
      parseCatalogSearchResponse({ objects: [{ package: { name: "a" } }] }, 20).packages[0],
    ).toMatchObject({ version: "latest" });
    // Registry total smaller than what we already paged past must not shrink the list.
    expect(
      parseCatalogSearchResponse({ total: 0, objects: [{ package: { name: "a" } }] }, 20).total,
    ).toBe(21);
    expect(parseCatalogSearchResponse({}, 20).total).toBe(20);
  });
});

describe("searchPiPackageCatalog", () => {
  it("uses the configured mirror when it returns hits", async () => {
    const { calls, fetchImpl } = stubFetch({ [MIRROR]: searchResponse(["pi-lens"]) });
    const result = await searchPiPackageCatalog({ baseUrl: MIRROR, fetchImpl });
    expect(result.packages.map((p) => p.name)).toEqual(["pi-lens"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(MIRROR);
  });

  it("retries the official registry when a mirror drops the keywords: qualifier", async () => {
    // registry.npmmirror.com answers HTTP 200 with zero objects for keywords: queries.
    const { calls, fetchImpl } = stubFetch({
      [MIRROR]: { total: 0, objects: [] },
      [OFFICIAL_NPM_REGISTRY]: searchResponse(["pi-subagents", "pi-web-access"], 10008),
    });
    const result = await searchPiPackageCatalog({ baseUrl: MIRROR, fetchImpl });
    expect(result.packages.map((p) => p.name)).toEqual(["pi-subagents", "pi-web-access"]);
    expect(result.total).toBe(10008);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain(OFFICIAL_NPM_REGISTRY);
    // The qualifier must survive the retry.
    expect(decodeURIComponent(calls[1]!)).toContain("keywords:pi-package");
  });

  it("does not retry itself when the official registry reports no matches", async () => {
    const { calls, fetchImpl } = stubFetch({ [OFFICIAL_NPM_REGISTRY]: { total: 0, objects: [] } });
    const result = await searchPiPackageCatalog({ baseUrl: OFFICIAL_NPM_REGISTRY, fetchImpl });
    expect(result).toEqual({ packages: [], total: 0 });
    expect(calls).toHaveLength(1);
  });

  it("throws when the configured registry request fails", async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response) as typeof fetch;
    await expect(searchPiPackageCatalog({ baseUrl: MIRROR, fetchImpl })).rejects.toThrow(/503/);
  });

  it("clamps page size into the registry's supported range", async () => {
    const { calls, fetchImpl } = stubFetch({ [MIRROR]: searchResponse(["pi-lens"]) });
    await searchPiPackageCatalog({ baseUrl: MIRROR, size: 999, from: 40, fetchImpl });
    expect(calls[0]).toContain("size=100");
    expect(calls[0]).toContain("from=40");
  });
});
