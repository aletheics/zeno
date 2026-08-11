import { describe, expect, it, vi } from "vite-plus/test";
import { buildShellCommands, viewFromCommandId } from "./commands.ts";

describe("buildShellCommands", () => {
  const handlers = {
    newThread: vi.fn(),
    openPackages: vi.fn(),
    openResources: vi.fn(),
    openSettings: vi.fn(),
    focusComposer: vi.fn(),
    openThread: vi.fn(),
    toggleTheme: vi.fn(),
    forkThread: vi.fn(),
    toggleReview: vi.fn(),
    toggleEnvPanel: vi.fn(),
  };

  it("builds localized labels for zh and en", () => {
    const zh = buildShellCommands(handlers, "zh");
    const en = buildShellCommands(handlers, "en");
    expect(zh.find((c) => c.id === "new-thread")?.label).toBe("新建会话");
    expect(en.find((c) => c.id === "new-thread")?.label).toBe("New session");
    expect(zh.find((c) => c.id === "packages")?.label).toBe("打开插件");
    expect(en.find((c) => c.id === "packages")?.label).toBe("Open packages");
    expect(zh.find((c) => c.id === "toggle-review")?.label).toBe("切换审阅面板");
  });

  it("includes env panel when handler provided", () => {
    const commands = buildShellCommands(handlers, "en");
    expect(commands.some((c) => c.id === "toggle-env-panel")).toBe(true);
  });

  it("maps command ids to views", () => {
    expect(viewFromCommandId("packages")).toBe("packages");
    expect(viewFromCommandId("settings")).toBe("settings");
    expect(viewFromCommandId("new-thread")).toBe("thread");
    expect(viewFromCommandId("unknown")).toBeUndefined();
  });
});
