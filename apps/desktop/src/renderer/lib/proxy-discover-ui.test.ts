import { describe, expect, it } from "vite-plus/test";
import { applyDiscoverResults } from "./proxy-discover-ui.ts";
import type { DesktopLocalProxyCandidate } from "@zeno/contracts";

const sample: DesktopLocalProxyCandidate[] = [
  { url: "http://127.0.0.1:7890", port: 7890, label: "Clash", source: "probe" },
  { url: "socks5://127.0.0.1:1080", port: 1080, label: "SOCKS", source: "probe" },
];

describe("applyDiscoverResults", () => {
  it("keeps custom mode on first discover with one hit", () => {
    const before = { mode: "custom" as const, server: "" };
    const after = applyDiscoverResults(before, [sample[0]!]);
    expect(after.channel.mode).toBe("custom");
    expect(after.channel.server).toBe("http://127.0.0.1:7890");
    expect(after.candidates).toEqual([]);
  });

  it("keeps custom mode with multi-hit list for dropdown", () => {
    const before = { mode: "custom" as const, server: "http://old:1" };
    const after = applyDiscoverResults(before, sample);
    expect(after.channel.mode).toBe("custom");
    expect(after.channel.server).toBe(sample[0]!.url);
    expect(after.candidates).toHaveLength(2);
  });

  it("never flips system/off channels either", () => {
    expect(applyDiscoverResults({ mode: "system" }, sample).channel.mode).toBe("system");
    expect(applyDiscoverResults({ mode: "off" }, [sample[0]!]).channel.mode).toBe("off");
  });

  it("empty discover leaves server when none found (mode stable)", () => {
    const before = { mode: "custom" as const, server: "http://keep:9" };
    const after = applyDiscoverResults(before, []);
    expect(after.channel.mode).toBe("custom");
    expect(after.channel.server).toBe("http://keep:9");
    expect(after.candidates).toEqual([]);
  });
});
