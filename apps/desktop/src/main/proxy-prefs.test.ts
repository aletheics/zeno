import { describe, expect, it } from "vite-plus/test";
import {
  applyProxyChannelToEnv,
  electronProxyConfig,
  normalizeProxyPrefs,
  withNodeEnvProxyFlag,
} from "./proxy-prefs.ts";

describe("proxy-prefs", () => {
  it("normalizes missing prefs to system mode", () => {
    expect(normalizeProxyPrefs(undefined)).toEqual({
      ai: { mode: "system" },
      app: { mode: "system" },
    });
  });

  it("applies custom AI proxy without touching unrelated env", () => {
    const env = applyProxyChannelToEnv(
      { PATH: "/usr/bin", HTTPS_PROXY: "http://stale:1" },
      { mode: "custom", server: "http://127.0.0.1:7890", bypass: "localhost" },
      { HTTPS_PROXY: "http://launch:9" },
    );
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HTTPS_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.HTTP_PROXY).toBe("http://127.0.0.1:7890");
    expect(env.NO_PROXY).toBe("localhost");
  });

  it("system mode copies launch env only", () => {
    const env = applyProxyChannelToEnv(
      { PATH: "/bin" },
      { mode: "system" },
      { HTTPS_PROXY: "http://sys:7890", NO_PROXY: "local" },
    );
    expect(env.HTTPS_PROXY).toBe("http://sys:7890");
    expect(env.NO_PROXY).toBe("local");
  });

  it("off mode strips proxy keys", () => {
    const env = applyProxyChannelToEnv(
      { HTTPS_PROXY: "http://x", PATH: "y" },
      { mode: "off" },
      { HTTPS_PROXY: "http://sys" },
    );
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.PATH).toBe("y");
  });

  it("maps electron session configs", () => {
    expect(electronProxyConfig({ mode: "off" })).toEqual({ mode: "direct" });
    expect(electronProxyConfig({ mode: "system" })).toEqual({ mode: "system" });
    expect(electronProxyConfig({ mode: "custom", server: "http://127.0.0.1:7890" })).toEqual({
      mode: "fixed_servers",
      proxyRules: "http://127.0.0.1:7890",
      proxyBypassRules: "<local>",
    });
  });

  it("sets NODE_USE_ENV_PROXY when proxy present", () => {
    expect(withNodeEnvProxyFlag({ HTTPS_PROXY: "http://x" }).NODE_USE_ENV_PROXY).toBe("1");
    expect(withNodeEnvProxyFlag({ PATH: "x" }).NODE_USE_ENV_PROXY).toBeUndefined();
  });
});
