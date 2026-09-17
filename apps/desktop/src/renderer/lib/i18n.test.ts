import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_LOCALE, isLocale, isLocalePreference, messages, t } from "./i18n.ts";

describe("i18n", () => {
  it("defaults to Chinese", () => {
    expect(DEFAULT_LOCALE).toBe("zh");
    expect(t("zh", "nav.newThread")).toBe("新建会话");
    expect(t("en", "nav.newThread")).toBe("New session");
  });

  it("interpolates variables and validates locales", () => {
    expect(t("zh", "empty.title", { name: "zeno" })).toBe("我们应该在 zeno 中构建什么？");
    expect(t("zh", "empty.titleNoWorkspace")).toBe("打开工作区以开始");
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("guards locale preferences, which extend locales with auto", () => {
    expect(isLocalePreference("auto")).toBe(true);
    expect(isLocalePreference("zh")).toBe(true);
    expect(isLocalePreference("en")).toBe(true);
    expect(isLocalePreference("fr")).toBe(false);
    expect(isLocalePreference(undefined)).toBe(false);
    expect(isLocalePreference("")).toBe(false);
    // `auto` is a preference but never a resolved locale.
    expect(isLocale("auto")).toBe(false);
  });

  it("labels the follow-system option", () => {
    expect(t("zh", "appearance.languageAuto")).toBe("跟随系统");
    expect(t("en", "appearance.languageAuto")).toBe("Follow system");
  });

  it("labels the conversation minimap", () => {
    expect(t("zh", "timeline.minimap")).toBe("对话导航");
    expect(t("en", "timeline.minimap")).toBe("Conversation minimap");
    expect(t("zh", "timeline.minimapUser")).toBe("用户消息");
    expect(t("en", "timeline.minimapUser")).toBe("User message");
    expect(t("zh", "timeline.minimapAssistant")).toBe("助手回复");
    expect(t("en", "timeline.minimapAssistant")).toBe("Assistant reply");
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

describe("i18n key sync", () => {
  it("keeps zh and en keys in lockstep", () => {
    const zh = Object.keys(messages.zh);
    const en = Object.keys(messages.en);
    const enSet = new Set(en);
    const zhSet = new Set(zh);

    const onlyInZh = zh.filter((key) => !enSet.has(key));
    const onlyInEn = en.filter((key) => !zhSet.has(key));

    // 任何一侧缺键/多键都会让 CI 直接失败，防止新增文案只改一种语言。
    expect(onlyInEn, `keys missing from zh (present in en): ${onlyInEn.join(", ")}`).toEqual([]);
    expect(onlyInZh, `keys missing from en (present in zh): ${onlyInZh.join(", ")}`).toEqual([]);
  });
});
