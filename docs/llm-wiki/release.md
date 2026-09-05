# 发版手顺

## 版本号来源（唯一真源 = git tag）

- 产品版本在构建时从 git tag 派生：Release 工作流 `.github/workflows/release.yml` 把 tag 的 `v` 前缀去掉，写进 `apps/desktop/package.json` 再打包。
- 因此 **tag 和安装包版本永不漂移**。
- `apps/desktop/package.json` 里 checked-in 的 version **只是本地开发回退值**，发版时**不要手动改它**。
- 根 `package.json` 与 `packages/*` 保持 `0.0.0`（私有 workspace 包，不发版）。

## 发版步骤

1. 在 `CHANGELOG.md` 顶部加 `## [X.Y.Z] - <日期>`，按 `Added / Changed / Fixed / Security` 分类。
2. （可选，仅本地）版本演练：`pnpm version:set 0.1.2` —— 只改本地 `apps/desktop/package.json`，绝不要用它做真实发版。
3. 打 tag 并推送（触发 Release）：

```bash
git tag v0.1.2
git push origin v0.1.2
```

- tag 必须是 `v` + semver（如 `v0.1.2`）。
- CI 读 tag 得到版本，构建各平台**未签名**安装包 + 三份 electron-updater 更新源（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`）与 mac zip，然后挂到 GitHub Release。

## 必选发布资产

`scripts/release-assets.mjs` 会校验，缺任一必选资产 CI 直接失败：

| 平台    | 必选资产                                                                       |
| ------- | ------------------------------------------------------------------------------ |
| Windows | `Zeno-*-win-x64.exe` + `latest.yml`（+ `*.blockmap`，若生成）                  |
| macOS   | `Zeno-*-mac-{arm64,x64}.dmg` + `Zeno-*-mac-{arm64,x64}.zip` + `latest-mac.yml` |
| Linux   | `Zeno-*-linux-*.AppImage` + `latest-linux.yml`（+ 可选 `.deb` / blockmap）     |

- `latest-mac.yml` 由 `scripts/merge-latest-mac-yml.mjs` 合并 arm64 + x64 两个产物得到。
- blockmap 保留（差分更新只需下载变化区间）。

## 签名

- 只有 `CSC_LINK` 和 `CSC_KEY_PASSWORD` 两个 secret 都设置了才签名。
- 否则强制未签名打包：`CSC_IDENTITY_AUTO_DISCOVERY=false`。

## 约束

- **不要**只在 GitHub 网页上手改 Release notes；改 `CHANGELOG.md` + 相应脚本。
- macOS 首次打开未签名下载可能需要 `xattr -cr /Applications/Zeno.app`（Gatekeeper 隔离）；README 已有说明，不要把它写进每个 Release body。
- 打包后应用会在启动时查一次 GitHub Releases，侧边栏显示下载 / 重启。更新走 electron-updater 的 `sha512` 校验。
