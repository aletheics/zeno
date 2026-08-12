# Contributing to Zeno

Thanks for your interest in contributing! This file covers how to get set up,
report issues, and open pull requests. There is no CLA.

## Quick links

- [Code of conduct](#code-of-conduct)
- [Report a bug](#report-a-bug)
- [Request a feature](#request-a-feature)
- [Set up a dev environment](#set-up-a-dev-environment)
- [Make a change](#make-a-change)
- [Pull request checklist](#pull-request-checklist)

## Code of conduct

Be kind and constructive. Assume good faith, stay on topic, and keep
criticism focused on the code rather than the person. Maintainers reserve the
right to close off-topic or hostile discussions.

## Report a bug

Before opening an issue, search the tracker to avoid duplicates. A useful bug
report includes:

1. **What you did** — the exact steps to reproduce.
2. **What you expected** — the intended behavior.
3. **What happened** — the actual behavior, including any error text or logs.
4. **Your environment** — OS (`Windows` / `macOS` / `Linux`), app version, and
   whether you installed from a release installer or ran from source.

The bug report template guides you through these fields.

## Request a feature

Describe the problem first, not the solution. What are you trying to do, and
why does the current app not let you do it? Proposals that start from a concrete
pain point are far more likely to get merged than abstract "add X" requests.

## Set up a dev environment

See the [README](README.md#setup) for requirements and install steps. In short:

```bash
pnpm install
pnpm electron:install
pnpm dev            # hot-reload desktop dev server
pnpm check          # lint + types + format (what CI runs)
pnpm test           # unit tests
```

An isolated launch (temp home + fixture workspace + fake model) is available for
UI work without touching your real agent config:

```bash
ZENO_ISOLATED=1 pnpm dev
```

## Make a change

1. **Start from an issue.** For anything non-trivial, open an issue first so the
   direction is agreed before you invest time in code.
2. **Fork and branch.** Fork the repo, then branch off `main` with a short,
   descriptive name (`fix/nsis-solid`, `feat/mcp-catalog`).
3. **Implement.** Keep the change focused — one concern per PR. Follow the
   surrounding code's style: comment density, naming, and file layout. The
   project uses strict TypeScript; avoid `any` and unused imports.
4. **Verify locally** before pushing:
   ```bash
   pnpm fmt     # auto-fix formatting
   pnpm check   # lint + types + format (same as CI)
   pnpm test
   ```
5. **Open a pull request** against `main`, using the PR template. Link the issue
   it closes and describe what and why.

## Pull request checklist

- [ ] One logical change per PR, with a clear title.
- [ ] `pnpm check` and `pnpm test` pass locally.
- [ ] New behavior is covered by tests where practical.
- [ ] Docs are updated if the change affects usage or release process.
- [ ] The PR description links the issue it closes.

## Releases

Releases are cut by maintainers from tags — see
[Cut a release](README.md#cut-a-release). Contributors do not need to bump
versions; CI derives the version from the tag.
