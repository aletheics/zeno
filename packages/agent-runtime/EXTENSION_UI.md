# Extension UI — desktop depth (closes #15)

Authoritative mapping of pi `ExtensionUIContext` → Zeno desktop.  
TUI-only capabilities are **Degraded** with deduped `unsupported` diagnostics — never silently faked.

## Portable (Supported)

| Method                                    | Desktop surface                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `select`                                  | Searchable Command dialog; structured options; preview blocks use sanitized Markdown |
| `confirm`                                 | ConfirmDialog                                                                        |
| `input` / `editor`                        | Text Dialog (empty submit allowed) / multiline editor                                |
| `notify`                                  | Thread titlebar + OS notify on warning/error                                         |
| `setStatus`                               | Titlebar chips; **MCP** (`MCP: n/m servers`) → packages nav badge `n/m`              |
| `setWidget(key, string[])`                | Composer-adjacent string cards (`placement` above/below editor)                      |
| `setTitle`                                | Extension title badge in thread titlebar                                             |
| `setEditorText` / `pasteToEditor`         | Composer draft                                                                       |
| `getEditorText`                           | Portable buffer in host                                                              |
| `setWorkingMessage` / `setWorkingVisible` | Working text in thread titlebar                                                      |
| `theme` / `getTheme`                      | Plain-text portable theme (no ANSI)                                                  |

## Semantic no-op (accepted, no chrome)

| Method                   | Notes                                    |
| ------------------------ | ---------------------------------------- |
| `setWorkingIndicator`    | No separate desktop indicator control    |
| `setHiddenThinkingLabel` | Thinking chrome stays product-controlled |

## TUI-only (Degraded)

| Method                                           | Behavior                                                   |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `custom()`                                       | Resolves `undefined`; one `unsupported: custom` diagnostic |
| `setWidget(key, Component)`                      | Not executed; `unsupported: setWidget.component`           |
| `setFooter` / `setHeader` / `setEditorComponent` | No-op + unsupported                                        |
| `addAutocompleteProvider` / `onTerminalInput`    | No-op + unsupported                                        |
| `setTheme`                                       | `{ success: false, error: … }`                             |
| Message/entry/tool **TUI renderer factories**    | Never invoked; Host projects via `generic-renderers.ts`    |

## Custom message / entry / tool

- `display: false` → hidden
- `display: true` → serializable content → timeline system card marked `extension` + **MarkdownContent** (rehype-sanitize)
- Tool presentation: name / args / content / details / isError only

## Implementation map

| Concern               | Code                                                               |
| --------------------- | ------------------------------------------------------------------ |
| Bridge                | `src/extension-ui-bridge.ts`                                       |
| Generic projection    | `src/generic-renderers.ts`                                         |
| Dialogs               | `apps/desktop/.../ExtensionUiHost.tsx` + Select/Input              |
| Fire-and-forget state | `apps/desktop/.../extension-ui-state.ts` + `ExtensionUiChrome.tsx` |
| Select content layout | `apps/desktop/.../extension-ui-format.ts`                          |
| E2E select            | `apps/desktop/e2e/extension-ui-select.spec.ts`                     |

## Manual smoke

1. `pnpm dev:desktop`
2. Install `@juicesharp/rpiv-ask-user-question` **or** drop a `~/.pi/agent/extensions/*.ts` that calls `ui.select` / `setStatus` / `setWidget`
3. New session → dialog options visible; status/widget chrome updates; cancel works
4. Extension that only uses `ui.custom` → no crash, unsupported chip once
