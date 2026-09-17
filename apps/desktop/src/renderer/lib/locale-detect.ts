/**
 * First-run language detection.
 *
 * Zeno ships `zh` + `en`. A fresh install picks Chinese for Chinese-reading users
 * and English for everyone else. Two signals are consulted because neither is
 * sufficient alone: the OS language misses a Chinese user running an English
 * Windows, and the time zone misses a Chinese user who is currently abroad.
 *
 * Detection backs the `auto` preference. `shell-store` persists the user's choice
 * to `zeno.locale`; an explicit `zh` / `en` always wins, and only `auto` (which is
 * also the fallback for a never-set preference) consults the environment.
 */

import type { Locale, LocalePreference } from "./i18n.ts";

/** Time zones whose readers Zeno greets in Chinese. */
export const CHINESE_TIMEZONES: ReadonlySet<string> = new Set([
  "Asia/Shanghai",
  "Asia/Urumqi",
  "Asia/Hong_Kong",
  "Asia/Macau",
  "Asia/Taipei",
]);

export interface LocaleSignals {
  /** A BCP 47 tag, e.g. `navigator.language` → "zh-CN". */
  language?: string | undefined;
  /** An IANA zone, e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  timeZone?: string | undefined;
}

/**
 * Pure: map environment signals onto a locale. Chinese-reading users get `zh`,
 * everything else gets `en`.
 */
export function detectLocale(signals: LocaleSignals): Locale {
  if (signals.language?.trim().toLowerCase().startsWith("zh")) return "zh";
  if (signals.timeZone && CHINESE_TIMEZONES.has(signals.timeZone.trim())) return "zh";
  return "en";
}

/**
 * Read the live signals and detect. Never throws — a shell without `Intl` or
 * `navigator` reads as "not Chinese-reading" rather than crashing the boot path.
 */
export function detectLocaleFromEnvironment(): Locale {
  try {
    return detectLocale({
      language: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return "en";
  }
}

/**
 * Resolve the user's setting into the locale `t()` consumes. An explicit `zh` /
 * `en` preference is returned as-is; `auto` defers to the environment.
 *
 * `auto` is resolved on demand rather than cached, so it reflects the environment
 * at the moment of the call. The shell calls it at boot and whenever the setting
 * changes, so an OS language change takes effect on the next launch.
 */
export function resolveLocale(preference: LocalePreference): Locale {
  return preference === "auto" ? detectLocaleFromEnvironment() : preference;
}
