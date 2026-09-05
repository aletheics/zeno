# Agent 指南 — Zeno

本文件是给 AI agent（以及贡献者）读的项目规范入口。改代码前先读这里，细节见 `docs/llm-wiki/` 下的分项规则。

## 先读

1. `docs/llm-wiki/` —— 产品规则，目前有：
   - [i18n.md](docs/llm-wiki/i18n.md) —— 所有 UI 文案走 `t()`，`zh` 为键源，不得硬编码
   - [dialogs.md](docs/llm-wiki/dialogs.md) —— 禁止 `window.confirm/alert/prompt`，统一用 `ConfirmDialog` / `ErrorDialog`
   - [release.md](docs/llm-wiki/release.md) —— 发版手顺（tag 驱动版本、CHANGELOG、发布资产）

## 架构不变量（不可破坏）

```text
React Renderer → Preload → Electron Main → utilityProcess Agent Host → pi SDK
```

- Renderer 无 Node 权限。
- Main 只监督 Agent Host，不执行 pi 工具或扩展。
- Agent Host 通过公开的 `@earendil-works/pi-coding-agent` SDK 工作。
- Electron `userData` 只存桌面壳偏好，绝不是第二层 agent 配置。
- 一个全新的 pi home 不应收到任何 Zeno 包、资源或自定义设置。
- `utilityProcess` 提供的是崩溃隔离，不是安全沙箱。

## 文案（i18n）

- 所有用户可见文案走 `t(locale, key, vars)`，任何语言都不许硬编码。
- `zh` 是键源：`MessageKey = keyof messages["zh"]`。新增键必须在 `zh` 和 `en` 两个块里都加。
- zh/en 键集有锁步测试兜底：编译期抓「缺 en」，运行期抓「死 en 键」。
- 详情见 [docs/llm-wiki/i18n.md](docs/llm-wiki/i18n.md)。

## 对话框与弹层

- 禁止 `window.confirm` / `window.alert` / `window.prompt`（renderer 里）。
- 确认用 `ConfirmDialog`，报错用 `ErrorDialog`。
- 历史 `window.confirm` 调用已全部迁移；该规则由 `no-alert` lint 强制，见 [docs/llm-wiki/dialogs.md](docs/llm-wiki/dialogs.md)。
- 不要用系统默认控件（原生 `<select>`、浏览器右键菜单）做产品交互。

## 测试纪律

- 每个 `lib/*.ts` 都要有对应的 `.test.ts`（用 `vite-plus/test` 的 `describe/it/expect`）。
- 纯函数优先：能写成 `(state, input) → output` 的就别耦合 DOM / 时钟（参考 `ZenoBlob.sampleBlob`、`i18n.t`）。
- 提交前跑 `pnpm check`（lint + types + format）和 `pnpm test`。

## 安全

该壳已针对命令注入、路径穿越、不安全 IPC 做过加固。改动 main / preload / agent-host 时保持同一标准：

- 跨进程边界的数据都当不可信输入。
- IPC channel 保持最小暴露。
- 路径拼接必须归一化并校验；禁止把用户输入拼进 shell 命令。

## 改动完成标准

新增或改动产品行为时，三件事都要做完才算 done：

1. **交互逻辑** —— 完整的 click / keyboard / busy / error / empty 路径，不只是可见控件。
2. **视觉一致** —— 复用现有 chrome / 间距 / 菜单 / 状态（`ui/` 组件、Tailwind token），不要另造一套皮肤。
3. **功能对等** —— 与你旁边同类能力（CLI、同列表的另一行）对齐。一个看起来能分叉 / 回滚 / 重命名但实际没用的控件，等于没做完。

## 发版

版本由 git tag `v*` 派生，不是手改 `apps/desktop/package.json`。见 [docs/llm-wiki/release.md](docs/llm-wiki/release.md)。
