import { describe, expect, it } from "vite-plus/test";
import {
  CHINESE_TIMEZONES,
  detectLocale,
  detectLocaleFromEnvironment,
  resolveLocale,
} from "./locale-detect.ts";

describe("detectLocale", () => {
  it("reads any Chinese language tag as zh", () => {
    for (const language of ["zh", "zh-CN", "zh-TW", "zh-Hans", "zh-Hant-HK"]) {
      expect(detectLocale({ language })).toBe("zh");
    }
  });

  it("ignores language tag casing and surrounding space", () => {
    expect(detectLocale({ language: "ZH-CN" })).toBe("zh");
    expect(detectLocale({ language: "  zh-CN  " })).toBe("zh");
  });

  it("falls back to the time zone when the OS language is not Chinese", () => {
    expect(detectLocale({ language: "en-US", timeZone: "Asia/Shanghai" })).toBe("zh");
  });

  it("returns en for non-Chinese signals", () => {
    expect(detectLocale({ language: "en-US", timeZone: "America/New_York" })).toBe("en");
    expect(detectLocale({ language: "ja-JP", timeZone: "Asia/Tokyo" })).toBe("en");
    expect(detectLocale({ language: "de-DE", timeZone: "Europe/Berlin" })).toBe("en");
  });

  it("returns en when nothing is known, rather than assuming Chinese", () => {
    expect(detectLocale({})).toBe("en");
    expect(detectLocale({ language: "" })).toBe("en");
    expect(detectLocale({ language: "   " })).toBe("en");
    expect(detectLocale({ timeZone: "" })).toBe("en");
    expect(detectLocale({ language: undefined, timeZone: undefined })).toBe("en");
  });

  it("matches the time zone on its own", () => {
    expect(detectLocale({ timeZone: "Asia/Taipei" })).toBe("zh");
    expect(detectLocale({ timeZone: "Asia/Urumqi" })).toBe("zh");
  });

  it("is case-sensitive about IANA zone ids, which are never re-cased", () => {
    // The set holds canonical ids; a mismatched case simply misses and reads English.
    expect(detectLocale({ timeZone: "asia/shanghai" })).toBe("en");
  });

  it("ships the full Chinese-reading zone set", () => {
    expect([...CHINESE_TIMEZONES].sort()).toEqual([
      "Asia/Hong_Kong",
      "Asia/Macau",
      "Asia/Shanghai",
      "Asia/Taipei",
      "Asia/Urumqi",
    ]);
  });
});

describe("resolveLocale", () => {
  it("honors an explicit preference without consulting the environment", () => {
    expect(resolveLocale("zh")).toBe("zh");
    expect(resolveLocale("en")).toBe("en");
  });

  it("defers to environment detection for auto", () => {
    // Whatever this machine is, `auto` must agree with a direct detection.
    expect(resolveLocale("auto")).toBe(detectLocaleFromEnvironment());
  });
});
