# Changelog

All notable user-facing changes to Zeno are documented in this file.
Earlier releases (v0.1.0, v0.1.1) predate this file.

## [0.1.2] - 2026-08-14

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
