import { describe, expect, it } from "vite-plus/test";
import {
  candidateFromEnvUrl,
  collectEnvLocalProxies,
  discoverLocalProxies,
  isLocalProxyHost,
  LOCAL_PROXY_PROBE_TARGETS,
} from "./proxy-discover.ts";

describe("proxy-discover", () => {
  it("recognizes loopback hosts", () => {
    expect(isLocalProxyHost("127.0.0.1")).toBe(true);
    expect(isLocalProxyHost("localhost")).toBe(true);
    expect(isLocalProxyHost("example.com")).toBe(false);
  });

  it("parses env proxy URLs pointing at localhost", () => {
    expect(candidateFromEnvUrl("http://127.0.0.1:7890")).toEqual({
      url: "http://127.0.0.1:7890",
      port: 7890,
      label: "env",
      source: "env",
    });
    expect(candidateFromEnvUrl("127.0.0.1:1080")).toEqual({
      url: "http://127.0.0.1:1080",
      port: 1080,
      label: "env",
      source: "env",
    });
    expect(candidateFromEnvUrl("http://proxy.corp:8080")).toBeNull();
  });

  it("collects unique env local proxies", () => {
    const hits = collectEnvLocalProxies({
      HTTPS_PROXY: "http://127.0.0.1:7890",
      HTTP_PROXY: "http://127.0.0.1:7890",
      ALL_PROXY: "socks5://127.0.0.1:1080",
    });
    expect(hits.map((h) => h.url)).toEqual(["http://127.0.0.1:7890", "socks5://127.0.0.1:1080"]);
  });

  it("returns open probe ports in priority order", async () => {
    const open = new Set([1080, 7890]);
    const found = await discoverLocalProxies({
      env: {},
      probe: async (_host, port) => open.has(port),
    });
    expect(found.map((c) => c.url)).toEqual(["http://127.0.0.1:7890", "socks5://127.0.0.1:1080"]);
    expect(found[0]?.label).toBe("Clash");
  });

  it("merges env hits after probe without duplicates", async () => {
    const found = await discoverLocalProxies({
      env: { HTTPS_PROXY: "http://127.0.0.1:7890", ALL_PROXY: "socks5://127.0.0.1:9999" },
      probe: async (_host, port) => port === 7890,
    });
    expect(found.map((c) => c.url)).toEqual(["http://127.0.0.1:7890", "socks5://127.0.0.1:9999"]);
    expect(found[0]?.source).toBe("probe");
    expect(found[1]?.source).toBe("env");
  });

  it("exports a non-empty probe table", () => {
    expect(LOCAL_PROXY_PROBE_TARGETS.length).toBeGreaterThan(5);
    expect(LOCAL_PROXY_PROBE_TARGETS[0]?.port).toBe(7890);
  });
});
