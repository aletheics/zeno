import { describe, expect, it } from "vite-plus/test";
import { checkExternalUrl } from "./external-url.ts";

/* This rule used to exist in three places — the PR helper, the open-external IPC, and the
 * window-open handler that gates `target="_blank"` links in rendered content — each with
 * its own copy and its own message. These lock the rule itself. */

describe("checkExternalUrl", () => {
  it("accepts the three schemes we hand to the OS", () => {
    for (const url of [
      "https://github.com/earendil-works/pi",
      "http://127.0.0.1:4177/session-content-demo.html",
      "mailto:someone@example.com",
    ]) {
      expect(checkExternalUrl(url)).toEqual({ ok: true });
    }
  });

  it("rejects schemes that must never reach shell.openExternal", () => {
    // `file:` and `javascript:` are the ones that matter: the window-open handler sees
    // URLs from rendered agent output, not just from our own UI.
    const blocked = [
      "file:///etc/passwd",
      "file://C:/Windows/System32/calc.exe",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "chrome://settings",
      "about:blank",
    ];
    for (const url of blocked) {
      const verdict = checkExternalUrl(url);
      expect(verdict.ok, url).toBe(false);
      expect(verdict.ok === false && verdict.reason, url).toBe("protocol");
    }
  });

  it("rejects OS deep-link schemes too, since only these three are intended", () => {
    // The notifications settings deep-links call shell.openExternal directly and are
    // deliberately outside this allowlist; they must not become reachable through it.
    for (const url of [
      "x-apple.systempreferences:com.apple.preference.notifications",
      "ms-settings:notifications",
    ]) {
      expect(checkExternalUrl(url).ok).toBe(false);
    }
  });

  it("reports the offending scheme so each caller can name it", () => {
    const verdict = checkExternalUrl("gopher://example.com");
    expect(verdict).toEqual({ ok: false, reason: "protocol", protocol: "gopher:" });
  });

  it("distinguishes an unparsable URL from a disallowed scheme", () => {
    // The PR helper reports these differently ("无效的 PR 地址" vs "不支持的协议").
    for (const url of ["", "   ", "not a url", "://missing-scheme"]) {
      expect(checkExternalUrl(url)).toEqual({ ok: false, reason: "unparsable" });
    }
  });

  it("treats the scheme case-insensitively, as URL parsing does", () => {
    expect(checkExternalUrl("HTTPS://example.com")).toEqual({ ok: true });
    expect(checkExternalUrl("JaVaScRiPt:alert(1)").ok).toBe(false);
  });
});
