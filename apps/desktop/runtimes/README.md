# Managed runtimes (Node + Python)

WorkBuddy-style **managed runtimes**:

1. **Build** (`pnpm runtimes:fetch`) downloads, prunes, and packs platform archives
2. **Ship** only `archives/*.tar.gz` + `manifest.json` in the installer (`extraResources`)
3. **First launch** extracts into `userData/runtimes/` and creates isolation trees

Default **ON** (Settings → 安全 → 运行时).

## Why not expand full trees into the .app?

- Installer size: archives are smaller than double-copied expanded trees
- Writable isolation: npm/pip installs go under userData, not into a signed .app
- Upgrades: re-extract when `manifest` versions change

## Layout

### After fetch (dev machine)

```text
runtimes/
  darwin-arm64/                 # expanded (pruned) for local smoke
    node/
    python/
    archives/
      node.tar.gz
      python.tar.gz
    manifest.json
  current -> darwin-arm64       # symlink (no 2× disk)
```

### Packaged app

```text
Contents/Resources/runtimes/
  archives/node.tar.gz
  archives/python.tar.gz
  manifest.json
```

### After first launch (userData)

```text
~/Library/Application Support/Zeno/runtimes/   # mac example
  node/
  python/
  npm-prefix/          # NPM_CONFIG_PREFIX
  python-venv/         # python -m venv
  .provisioned.json
  manifest.json
```

## Pins

See `versions.json`. Bump versions, then:

```bash
pnpm --filter @zeno/desktop runtimes:fetch -- --force
```

## Isolation env (when enabled)

| Variable            | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `NODE_BINARY`       | Absolute path to managed node                                   |
| `NPM_CONFIG_PREFIX` | Agent npm installs stay under `npm-prefix/`                     |
| `VIRTUAL_ENV`       | Managed Python venv                                             |
| `PATH`              | `npm-prefix/bin` + `venv/bin` + `node/bin` + `python/bin` first |

## Size

After prune + archive (Apple Silicon, approx):

- Expanded working tree: ~200MB
- Shipped archives only: much smaller than a full dual expanded copy
- Node binary alone remains ~100MB (official Node cost)

Binary trees are **gitignored**. Only `versions.json` and this README are committed.
