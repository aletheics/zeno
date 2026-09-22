# Changelog

All notable user-facing changes to Zeno are documented in this file.
Earlier releases (v0.1.0, v0.1.1) predate this file.

## [Unreleased]

### Added

- Right-click menus across the app, drawn in Zeno's own chrome instead of the system
  menu — which on most surfaces offered nothing the app could act on. The composer
  gains 剪切 / 复制 / 粘贴 / 全选 / 清空输入, each showing its own binding, because
  pasting previously meant knowing ⌘V. Shift+F10 opens the same menu, the arrow keys
  and Home/End move through it, and Escape closes it and returns focus.
- Right-clicking a message row opens 复制 / 复制为纯文本 / 编辑重发 / 在新会话中继续.
  These existed only as icons that appear on hover, so anyone who did not hover a row
  had no way to reach them. 复制为纯文本 appears when the message is markdown, and
  hands over what it reads as rather than the source.
- The same menu reaches the rest of the surface: a code block offers 复制代码 and, for
  a partial selection, 复制选中; a file path in a tool row offers 复制路径 /
  在编辑器中打开 / 在文件夹中显示; the command in a run row offers 复制命令; and the
  embedded terminal offers 复制选区 / 粘贴 / 全选. Pasting into the terminal goes
  through ghostty's own paste, so a multi-line command arrives as one bracketed paste
  instead of being run line by line.

### Changed

- Bundled pi runtime upgraded to 0.87.0, from 0.85.1. Settings → SDK 运行时 stops
  showing 内置版本落后，需升级 Zeno 应用: that notice compares the bundled SDK against
  npm's latest, so it can only be cleared by shipping a new Zeno — the section's own
  检查更新 / 刷新 buttons act on the _global_ SDK, not the bundled one.
- Meta's Muse models are recognized as a built-in provider instead of being labelled a
  user-defined one. The list of built-in provider ids is a copy of pi-ai's catalog, and
  it had been updated in one of the two places that keep it while the other was missed —
  so a models.json-free Meta setup showed as custom in the service-tier path.

## [0.1.7] - 2026-09-18

### Added

- A conversation minimap down the left edge of the thread: one dash per user turn
  or assistant reply, magnified as the cursor moves along it, with a preview
  popover for the nearest turn and a click to jump there.
- Session titles too long for the sidebar now scroll on hover or keyboard focus
  instead of being cut off, and the full text stays selectable.
- Fresh installs pick their language from the machine — a Chinese system language
  or time zone starts in Chinese, everything else in English. Settings → Language
  gains 跟随系统 / Follow system, so the choice is reversible.
- Deleting a session can now remove its local file too. Settings → 已归档 has a
  已删除（可恢复）group, so the ordinary delete can be undone.

### Changed

- Bundled pi runtime upgraded to 0.85.1. The `@earendil-works/pi-server`
  workaround added for 0.85.0 is no longer needed: upstream moved it to a
  dev dependency and dropped the runtime import.
- Deleting a session from the sidebar is now labelled 从列表移除 and says that the
  file stays on disk. It previously said the action could not be undone, which was
  wrong in both directions: the file was left intact and nothing could bring the row
  back. 永久删除本地文件 is now a separate, explicitly destructive action.
- The composer draft and the permission mode belong to the session you set them in.
  Both were single values shared by every session, so text typed in one appeared in
  the next, and changing the permission mode anywhere changed it everywhere.

### Fixed

- The Discover tab showed 无匹配插件 for every search on machines whose npm registry
  is a mirror that drops npm's `keywords:` qualifier — the registry answered with an
  empty result rather than an error, so it read as "no packages". The catalog now
  retries the official registry once, while installs keep using the mirror.
- The composer disappeared and reappeared on every session switch. It is the
  scroller's sticky footer, so the switch blanking that hides the outgoing
  transcript was hiding the input with it.
- Settings → Runtimes showed both switches as on while silently refusing every
  click, with nothing on screen explaining why: the bundled runtime was absent and
  the row now says so.
- The currently open session can no longer be deleted from the sidebar; both delete
  actions are unavailable for it, with the reason given.

## [0.1.6] - 2026-09-05

### Added

- A living desktop pet ("bloub") now accompanies Zeno: a morphing SVG companion
  with its own engine, tuned from Settings → Pet (look and bubbles tabs, with
  size / color / shape / expression / eye pickers) and toggled with the `/pet`
  slash command. Its overlay window never steals focus and boots straight into
  your chosen color without a flash.
- Usage statistics ("真实额度") now read the real account balance for DeepSeek
  and Moonshot/Kimi, and for custom models whose base URL points at those
  providers.

### Changed

- Bundled pi runtime upgraded to 0.85.0.
- Native `window.confirm`/`alert` dialogs (pi SDK switch, theme studio,
  archive, custom-model removal) are replaced with the in-app ConfirmDialog.

### Fixed

- `target=_blank` links — the plugin catalog and "open in web" actions — now
  open in the system browser instead of an in-app window that goes nowhere.
- Reply streaming no longer stalls on a sequence gap, and the live tail is
  preserved when you re-open a session.
- The dev watch launcher no longer intermittently fails at launch with
  "Cannot find module": build watchers now start only after Electron has loaded
  the main bundle.
- The packaged app no longer crashes when starting the Agent Host: the bundled
  pi runtime's missing `@earendil-works/pi-server` dependency is now declared
  and shipped in the package.
- "Check for updates" and the plugin/MCP catalogs no longer fail with
  "fetch failed" behind a regional network — the npm registry is now read from
  `~/.npmrc` (e.g. `registry.npmmirror.com`) instead of hardcoding npmjs.org.

## [0.1.5] - 2026-08-26

### Fixed

- Settings → Appearance → Typography resizes the UI again. The font-size tokens
  were declared in the theme blocks as well as on `:root`; because the app shell
  carries `data-theme` itself, that redeclaration beat the value written on
  `<html>` for the whole shell subtree, pinning every font to the 14px / 12px
  default no matter what the setting said.
- The app could keep running an outdated pi after an upgrade. `userData/pi-cli`
  counted as a valid source for the builtin SDK whenever the directory merely
  existed, and it sorts ahead of `node_modules` in the search order, so an
  extract left behind by an earlier release silently pinned the app to that
  older pi. It is now consulted only when it matches the version actually
  shipped — and never in development, where `node_modules` is the only source
  of truth.

### Changed

- Bundled pi runtime upgraded to 0.84.3.
- Startup logs which builtin pi SDK was resolved and the path it came from,
  so a mismatched runtime is visible immediately instead of only when
  something breaks.

## [0.1.4] - 2026-08-18

### Added

- Parked sessions are first-class across thread switches: busy agent hosts are
  never evicted, idle ones stay warm for ten minutes, and a parked run keeps
  streaming into its own session instead of aborting when you switch away.

### Changed

- The sidebar run-state glyph is now an animated mark that morphs with the run
  state, replacing the spinner and the half-circle "waiting" character.

### Fixed

- Linux: the draggable titlebar no longer steals clicks from the window caption
  buttons.

## [0.1.3] - 2026-08-15

### Added

- The last foreground session reopens when you relaunch after quitting.

### Changed

- Bundled pi runtime upgraded to 0.84.2.
- Packaged builds unpack native modules only; the builtin pi CLI is extracted
  into `userData/pi-cli` on first launch instead of shipping an unpacked
  `node_modules`.

### Fixed

- Windows: runtime extraction uses the system `tar`, and packaging now asserts
  the bundled runtimes are actually present.

## [0.1.2] - 2026-08-15

### Added

- `/login` built-in slash command to open the provider sign-in page.
- Batch-import custom models by fetching the provider's model list.
- Desktop-builtin and AI-routed slash commands are now separated, so typing a
  builtin command runs locally instead of being sent to the model.

### Fixed

- Slash commands, prompt templates, and skills now show only the original
  `/skill:name` you typed — the expanded `<skill>` body no longer leaks into the
  timeline as a user message.
- Streaming is smooth again: markdown re-parsing is throttled to at most ~10
  parses/second with bounded 100ms latency, replacing the unbounded
  `useDeferredValue` lag that caused a "stall then dump" feel.
- Session rendering and notification false-positives fixed.
- Subagent foreground spawn falls back to Node when the bundled binary is
  unavailable.

### Security

- Hardened the desktop shell against command injection, path traversal, and
  unsafe IPC.
