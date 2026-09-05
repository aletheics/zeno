# 对话框与弹层规范

## 规则

在 renderer 中**禁止** `window.confirm` / `window.alert` / `window.prompt`。

- 它们是同步阻塞的原生弹窗，会破坏窗口边框、焦点、a11y，也无法走 Zeno 的主题与 i18n。
- 确认类交互统一用 `ConfirmDialog`（`apps/desktop/src/renderer/components/ConfirmDialog.tsx`）。
- 报错类交互统一用 `ErrorDialog`（`apps/desktop/src/renderer/components/ErrorDialog.tsx`）。
- 两者都基于 shadcn `AlertDialog`（焦点陷阱 + a11y）。

## ConfirmDialog 用法

```tsx
<ConfirmDialog
  open={open}
  title={t(locale, "confirm.deleteTitle")}
  message={t(locale, "confirm.deleteMessage", { name })}
  confirmLabel={t(locale, "confirm.delete")}
  cancelLabel={t(locale, "common.cancel")}
  danger // 删除类操作用 destructive 样式
  onConfirm={() => {
    /* 真正执行删除 */
  }}
  onCancel={() => setOpen(false)}
/>
```

要点：

- 它是**状态驱动**的：`open` 由组件 state 控制，动作在 `onConfirm` 里执行，不再用 `if (!window.confirm(...)) return;` 这种同步短路。
- 需要「是否执行」的判断时，先打开对话框，把原来 `confirm` 之后的代码移进 `onConfirm` 回调。

## ErrorDialog 用法

```tsx
<ErrorDialog
  open={open}
  title={t(locale, "error.dialogTitle")}
  message={detail}
  confirmLabel={t(locale, "error.dialogOk")}
  onClose={() => setOpen(false)}
/>
```

## 现状

历史 `window.confirm` 调用点已全部迁移到 `ConfirmDialog`（2026-09 完成），renderer 中无残留。

- 该规则由 lint 强制执行：`vite.config.ts` 里开了 `no-alert`（error），`vp check` 会拦截 `window.confirm` / `window.alert` / `window.prompt` 回归。
- 迁移时用判别联合状态替代同步短路，参考 `PiSdkSection.tsx`（`SwitchConfirm`）、`SettingsPage.tsx`（`PendingDelete`）、`ThemeSkinStudio.tsx`。

> 注意：`main/index.ts` 里的 `prompt(...)` 和 `agent-host/provider-oauth.ts` 里的 `prompt(...)` 是 IPC / SDK 的方法名，不是浏览器 `window.prompt`，不属于本规则范围，不要误改。

## 其他

- 不要用系统默认控件做产品交互：原生 `<select>`、浏览器右键菜单、OS 默认下拉。
- 用 `ui/select.tsx`、`ui/dropdown-menu.tsx`、`CommandPalette` 等现有组件替代。
