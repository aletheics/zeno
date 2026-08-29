<p align="center">
  <img src="./assets/screenshots/icon.png" alt="Zeno" width="300" />
</p>

# Zeno

[English](README.md) | [简体中文](README.zh-CN.md)

Zeno 是 [pi](https://pi.dev) 编程 agent 的桌面外壳：一个 Codex 风格的界面，把配置、包、会话和工具都保留在原生 pi 侧（`~/.pi/agent`）。

## 🤝 交流群

<p align="center">
  <img src="./assets/screenshots/qq.jpg" alt="Zeno 交流群" width="300" />
</p>

<p align="center">
  扫码加入 Zeno 交流群：
</p>

## 截图

Zeno 桌面外壳 —— 侧边栏、会话工作区与输入框：

![Zeno desktop](./assets/screenshots/zeno-desktop.png)

动画演示：

![Zeno demo](./assets/gif/zeno.gif)

## 环境要求

- Node.js 22.19 或更高版本
- pnpm 11.15.1

## 安装

```bash
pnpm install
pnpm electron:install
```

`electron:install` 会为你的平台下载 Electron 43 运行时。

## 开发

各应用在仓库根目录下拥有**独立的** `dev` / `build` 入口：

| 应用                        | 开发               | 构建                 | 说明                                                  |
| --------------------------- | ------------------ | -------------------- | ----------------------------------------------------- |
| **桌面端** (`apps/desktop`) | `pnpm dev`         | `pnpm build:desktop` | 热重载（HMR + 自动重启）。一次性：`pnpm run dev:once` |
| **落地页** (`apps/landing`) | `pnpm dev:landing` | `pnpm build:landing` | 预览：`pnpm preview:landing`                          |
| **所有包**                  | —                  | `pnpm build`         | 工作区内的递归 `build`                                |

### 桌面端

```bash
pnpm dev           # 热重载：渲染进程使用 Vite HMR + 主进程自动重启
pnpm run dev:once  # 一次性构建 + 启动（无监听）
pnpm build:desktop # 仅编译（不启动 Electron）
```

`pnpm dev` 会在 `http://localhost:5173` 上为渲染进程启动一个 Vite 开发服务器（React HMR —— 组件改动即时生效，无需重启），并为 main / preload / agent-host 运行构建监听。当后端源码变化时，Electron 会自动重启。

`dev:once` 适用于 CI 或需要单次冷启动、无需文件监听的情况。

产品启动使用你真实的 `HOME` 以及与 CLI 相同的 agent 目录（`~/.pi/agent` / `PI_CODING_AGENT_DIR`）。模型、API 密钥、设置、包和工具都与交互式 `pi` 保持一致。上次的工作区会从桌面偏好设置中恢复；每次启动不会新建临时工作区。

可选的隔离启动（临时 home + 固定工作区 + 假模型）：

```bash
ZENO_ISOLATED=1 pnpm dev
```

仅浏览器的聊天时间线预览（无 Electron），用于迭代会话内容渲染：

```bash
pnpm demo:session-content
# → http://127.0.0.1:4177/session-content-demo.html
```

修改渲染进程后需重新运行。请勿通过 `file://` 打开构建后的 HTML。

### 落地页

```bash
pnpm dev:landing      # http://localhost:5174
pnpm build:landing    # 静态站点 → apps/landing/dist
pnpm preview:landing  # 本地预览生产构建
```

## 校验

```bash
pnpm check        # lint + 类型 + 格式化（与 Ubuntu CI 相同）
pnpm check:types  # 仅 lint + 类型
pnpm fmt          # 自动修复格式化
pnpm test
pnpm build        # 所有工作区包（desktop + landing + libs）
```

## 打包（桌面端）

```bash
pnpm package   # 为本操作系统生成安装包 + electron-updater 更新源
```

输出：`apps/desktop/release/app/`（CI 中未签名 —— 尚无代码签名证书）。

### GitHub Release 资产

每个带 tag 的发布只发布安装包和 **electron-updater** 所需的内容：

| 资产                                          | 作用                             |
| --------------------------------------------- | -------------------------------- |
| `Zeno-*-win-x64.exe`                          | Windows 安装（NSIS）             |
| `latest.yml`                                  | Windows 更新源                   |
| `Zeno-*-mac-arm64.dmg` / `Zeno-*-mac-x64.dmg` | macOS 手动安装                   |
| `Zeno-*-mac-arm64.zip` / `Zeno-*-mac-x64.zip` | macOS **自动更新** 载荷          |
| `latest-mac.yml`                              | macOS 更新源（列出两个 zip）     |
| `Zeno-*-linux-*.AppImage`                     | Linux 运行 / 更新                |
| `Zeno-*-linux-*.deb`                          | Linux 手动安装（可选，方便使用） |
| `latest-linux.yml`                            | Linux 更新源                     |
| `*.blockmap`                                  | 差异下载映射（生成时）           |

若缺失任一必需的更新源或 mac zip，CI 会**失败**（`scripts/release-assets.mjs`）。blockmap 在存在时会被保留，以便更新时只下载变更的部分。

## CI 与发布

| 工作流      | 文件                            | 触发时机                | 作用                                          |
| ----------- | ------------------------------- | ----------------------- | --------------------------------------------- |
| **CI**      | `.github/workflows/ci.yml`      | PR + push 到 `main`     | Ubuntu：安装 → lint/类型/格式化 → 测试 → 构建 |
| **Release** | `.github/workflows/release.yml` | push `v*` tag（或手动） | 多平台安装包 + 更新源 → **GitHub Release**    |

### 版本管理

产品版本在构建时从 git tag 派生 —— Release 工作流会去掉 tag 的 `v` 前缀，并在打包前写入 `apps/desktop/package.json`，因此 tag 与安装包版本永远不会漂移。已提交的 `apps/desktop/package.json` 版本仅作为本地开发时的回退值；发布时请勿手动修改它。根目录与 `packages/*` 保持 `0.0.0`（私有工作区包）。

```bash
pnpm version:set 0.1.0   # 可选：仅用于本地开发，切勿用于发布
```

### 发布新版本

```bash
git tag v0.1.0
git push origin v0.1.0
```

tag 必须为 `v` + semver（例如 `v0.1.2`）。CI 从 tag 读取版本，构建未签名安装包以及三个 electron-updater 更新源（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`）和 mac zip 归档，然后将它们附加到 GitHub Release。打包后的应用会在启动时检查一次 GitHub Releases（当有更新可用时，侧边栏会显示下载 / 重启）。手动 **workflow_dispatch** 只上传 Actions 工件（不创建 Release）。每日 CI 仅在 Ubuntu 上运行 lint/类型/测试/构建；多系统打包仍由 Release 完成。打包会设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`（未签名）。

> **macOS 说明：** 首次打开未签名下载可能需要执行 `xattr -cr /Applications/Zeno.app`（Gatekeeper 隔离）。自动更新**不需要** Apple Developer ID —— Zeno 会校验 release zip（通过 electron-updater 的 `sha512`）并自行替换 `.app`（与 Tauri updater + minisign 相同的模型）。可选的 `CSC_LINK` / `CSC_KEY_PASSWORD` 仍能改善 Gatekeeper 体验与通知（在提供时）。

## 贡献

欢迎贡献 —— bug 修复、文档和小型功能最容易进入。无需 CLA。

完整指南见 [CONTRIBUTING.md](./CONTRIBUTING.md)。简而言之：先开 issue，fork 并从 `main` 分支，保持 `pnpm check` 与 `pnpm test` 通过，且每个 PR 只关注一件事。提交时请使用 issue 和 PR 模板。

## 架构

```text
React Renderer → Preload → Electron Main → utilityProcess Agent Host → pi SDK
```

- 渲染进程无法访问 Node.js。
- 主进程监督 Agent Host，但不执行 pi 工具或扩展。
- Agent Host 使用公开的 `@earendil-works/pi-coding-agent` SDK。
- Electron 的 `userData` 仅用于桌面界面偏好设置 —— 绝不是第二个 agent 配置层。
- 全新的 pi home 不会获得任何 Zeno 包、资源或自定义设置。
- `utilityProcess` 提供崩溃隔离，而非安全沙箱。
- 扩展便携 UI（select/confirm/status/widgets/…）与仅 TUI 的降级界面：见 [`packages/agent-runtime/EXTENSION_UI.md`](./packages/agent-runtime/EXTENSION_UI.md)。

---

## 👥 贡献者

感谢所有为 Zeno 做出贡献的朋友们！

<a href="https://github.com/aletheics/zeno/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=aletheics/zeno" alt="Contributors" />
</a>

---

## Star History

<a href="https://www.star-history.com/?repos=aletheics%2Fzeno&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=aletheics/zeno&type=date&theme=dark&legend=bottom-right&sealed_token=Hv3S5OqsLP0HjqwiYhWhzr-C6n7C9Quv-ogx_deSrDHgRBsNQ7h7O4ABgY__lOXzFlYHgYe2eUCtL9fEYQbgV4zJ7aASk8Blj822IujayqZFB8o2mCuspg" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=aletheics/zeno&type=date&legend=bottom-right&sealed_token=Hv3S5OqsLP0HjqwiYhWhzr-C6n7C9Quv-ogx_deSrDHgRBsNQ7h7O4ABgY__lOXzFlYHgYe2eUCtL9fEYQbgV4zJ7aASk8Blj822IujayqZFB8o2mCuspg" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=aletheics/zeno&type=date&legend=bottom-right&sealed_token=Hv3S5OqsLP0HjqwiYhWhzr-C6n7C9Quv-ogx_deSrDHgRBsNQ7h7O4ABgY__lOXzFlYHgYe2eUCtL9fEYQbgV4zJ7aASk8Blj822IujayqZFB8o2mCuspg" />
 </picture>
</a>

---

## 许可证

见 [LICENSE](./LICENSE)。

## 社区

[LinuxDo](https://linux.do)
