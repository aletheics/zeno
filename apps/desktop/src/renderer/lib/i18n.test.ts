import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_LOCALE, isLocale, t } from "./i18n.ts";

describe("i18n", () => {
  it("defaults to Chinese", () => {
    expect(DEFAULT_LOCALE).toBe("zh");
    expect(t("zh", "nav.newThread")).toBe("新建会话");
    expect(t("en", "nav.newThread")).toBe("New session");
  });

  it("interpolates variables and validates locales", () => {
    expect(t("zh", "empty.title", { name: "pix" })).toBe("我们应该在 pix 中构建什么？");
    expect(t("zh", "empty.titleNoWorkspace")).toBe("打开工作区以开始");
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("localizes packages and resources pages", () => {
    expect(t("zh", "packages.title")).toBe("插件");
    expect(t("en", "packages.title")).toBe("Packages");
    expect(t("zh", "resources.title")).toBe("资源");
    expect(t("en", "resources.emptyTitle")).toBe("No resources loaded");
  });

  it("localizes session parity and pi settings surfaces", () => {
    expect(t("zh", "sessionTree.title")).toBe("会话树");
    expect(t("en", "sessionTree.title")).toBe("Session tree");
    expect(t("zh", "sessionInfo.exportJsonl")).toBe("导出 JSONL");
    expect(t("en", "sessionInfo.exportJsonl")).toBe("Export JSONL");
    expect(t("zh", "piSettings.steeringMode")).toContain("引导");
    expect(t("zh", "piSettings.steeringMode")).toContain("当前回合");
    expect(t("en", "piSettings.steeringMode").toLowerCase()).toContain("guidance");
    expect(t("zh", "piSettings.followUpMode")).toContain("追问");
    expect(t("zh", "piSettings.followUpModeHint")).toContain("Alt+Enter");
    expect(t("zh", "piSettings.steeringModeHint")).toContain("Enter");
    expect(t("zh", "piSettings.queueSectionHint")).toContain("引导");
    expect(t("zh", "slash.builtin.tree")).toContain("会话树");
    expect(t("en", "slash.builtin.tree").toLowerCase()).toContain("tree");
  });
});
