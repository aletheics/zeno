# Changelog

All notable user-facing changes to Zeno are documented in this file.
Earlier releases (v0.1.0, v0.1.1) predate this file.

## [Unreleased]

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
