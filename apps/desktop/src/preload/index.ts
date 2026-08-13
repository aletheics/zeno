import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppUpdateStatus,
  HostEvent,
  PiCliProgressEvent,
  ZenoDesktopApi,
  TerminalDataEvent,
  TerminalExitEvent,
} from "@zeno/contracts";

const api: ZenoDesktopApi = {
  app: {
    getRuntime: () => ipcRenderer.invoke("zeno:app:get-runtime"),
    getUpdateStatus: () => ipcRenderer.invoke("zeno:app:get-update-status"),
    checkForUpdates: () => ipcRenderer.invoke("zeno:app:check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("zeno:app:download-update"),
    quitAndInstall: () => ipcRenderer.invoke("zeno:app:quit-and-install"),
    onUpdateStatus(listener) {
      const handler = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus) =>
        listener(status);
      ipcRenderer.on("zeno:app:update-status", handler);
      return () => ipcRenderer.removeListener("zeno:app:update-status", handler);
    },
  },
  proxy: {
    get: () => ipcRenderer.invoke("zeno:proxy:get"),
    set: (prefs) => ipcRenderer.invoke("zeno:proxy:set", prefs),
    discoverLocal: () => ipcRenderer.invoke("zeno:proxy:discover-local"),
  },
  window: {
    minimize: () => ipcRenderer.invoke("zeno:window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("zeno:window:toggle-maximize"),
    close: () => ipcRenderer.invoke("zeno:window:close"),
    isMaximized: () => ipcRenderer.invoke("zeno:window:is-maximized"),
    onStateChange(listener) {
      const handler = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) =>
        listener(state);
      ipcRenderer.on("zeno:window:state", handler);
      return () => ipcRenderer.removeListener("zeno:window:state", handler);
    },
  },
  pi: {
    ensure: () => ipcRenderer.invoke("zeno:pi:ensure"),
    onProgress(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: PiCliProgressEvent) =>
        listener(value);
      ipcRenderer.on("zeno:pi:progress", handler);
      return () => ipcRenderer.removeListener("zeno:pi:progress", handler);
    },
  },
  piSdk: {
    getStatus: () => ipcRenderer.invoke("zeno:pi-sdk:get-status"),
    setSource: (source, options) => ipcRenderer.invoke("zeno:pi-sdk:set-source", source, options),
    listConfigFiles: () => ipcRenderer.invoke("zeno:pi-sdk:list-config-files"),
    revealConfig: (id) => ipcRenderer.invoke("zeno:pi-sdk:reveal-config", id),
    openConfig: (id) => ipcRenderer.invoke("zeno:pi-sdk:open-config", id),
    installGlobal: () => ipcRenderer.invoke("zeno:pi-sdk:install-global"),
    checkLatest: () => ipcRenderer.invoke("zeno:pi-sdk:check-latest"),
  },
  runtimes: {
    getStatus: () => ipcRenderer.invoke("zeno:runtimes:get-status"),
    setPrefs: (prefs) => ipcRenderer.invoke("zeno:runtimes:set-prefs", prefs),
  },
  terminal: {
    open: (options) => ipcRenderer.invoke("zeno:terminal:open", options),
    write: (data) => ipcRenderer.invoke("zeno:terminal:write", data),
    resize: (cols, rows) => ipcRenderer.invoke("zeno:terminal:resize", cols, rows),
    suspend: () => ipcRenderer.invoke("zeno:terminal:suspend"),
    dispose: () => ipcRenderer.invoke("zeno:terminal:dispose"),
    status: () => ipcRenderer.invoke("zeno:terminal:status"),
    onData(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: TerminalDataEvent) =>
        listener(value);
      ipcRenderer.on("zeno:terminal:data", handler);
      return () => ipcRenderer.removeListener("zeno:terminal:data", handler);
    },
    onExit(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: TerminalExitEvent) =>
        listener(value);
      ipcRenderer.on("zeno:terminal:exit", handler);
      return () => ipcRenderer.removeListener("zeno:terminal:exit", handler);
    },
  },
  appearance: {
    setThemeSource: (source) => ipcRenderer.invoke("zeno:appearance:set-theme-source", source),
    getAppScale: () => ipcRenderer.invoke("zeno:appearance:get-app-scale"),
    setAppScale: (scale) => ipcRenderer.invoke("zeno:appearance:set-app-scale", scale),
  },
  themes: {
    list: () => ipcRenderer.invoke("zeno:themes:list"),
    activate: (id) => ipcRenderer.invoke("zeno:themes:activate", id),
    save: (input) => ipcRenderer.invoke("zeno:themes:save", input),
    remove: (id) => ipcRenderer.invoke("zeno:themes:remove", id),
    importPick: () => ipcRenderer.invoke("zeno:themes:import-pick"),
    exportPick: (id) => ipcRenderer.invoke("zeno:themes:export-pick", id),
  },
  host: {
    start: (options) => ipcRenderer.invoke("zeno:host:start", options),
    stop: () => ipcRenderer.invoke("zeno:host:stop"),
    snapshot: () => ipcRenderer.invoke("zeno:host:snapshot"),
    onEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: HostEvent) => listener(value);
      ipcRenderer.on("zeno:host:event", handler);
      return () => ipcRenderer.removeListener("zeno:host:event", handler);
    },
  },
  workspace: {
    getCwd: () => ipcRenderer.invoke("zeno:workspace:get-cwd"),
    listRecent: () => ipcRenderer.invoke("zeno:workspace:list-recent"),
    openPath: (cwd, options) => ipcRenderer.invoke("zeno:workspace:open-path", cwd, options),
    pickFolder: () => ipcRenderer.invoke("zeno:workspace:pick-folder"),
    pickAttachments: (options) => ipcRenderer.invoke("zeno:workspace:pick-attachments", options),
    pathForFile: (file) => webUtils.getPathForFile(file),
    searchPaths: (query, options) =>
      ipcRenderer.invoke("zeno:workspace:search-paths", query ?? "", options),
    saveClipboardImage: (options) =>
      ipcRenderer.invoke("zeno:workspace:save-clipboard-image", options),
    readAttachmentPreview: (path) =>
      ipcRenderer.invoke("zeno:workspace:read-attachment-preview", path),
    ensureDefault: () => ipcRenderer.invoke("zeno:workspace:ensure-default"),
    ensureConversation: () => ipcRenderer.invoke("zeno:workspace:ensure-conversation"),
    removeRecent: (cwd) => ipcRenderer.invoke("zeno:workspace:remove-recent", cwd),
    revealInFolder: (cwd) => ipcRenderer.invoke("zeno:workspace:reveal-in-folder", cwd),
    openFile: (path, location) => ipcRenderer.invoke("zeno:workspace:open-file", path, location),
    openExternal: (url) => ipcRenderer.invoke("zeno:workspace:open-external", url),
    clearActive: () => ipcRenderer.invoke("zeno:workspace:clear-active"),
    getGitContext: (cwd) => ipcRenderer.invoke("zeno:workspace:get-git-context", cwd),
    listGitBranches: (cwd) => ipcRenderer.invoke("zeno:workspace:list-git-branches", cwd),
    checkoutGitBranch: (branch, cwd) =>
      ipcRenderer.invoke("zeno:workspace:checkout-git-branch", branch, cwd),
    createGitBranch: (branch, options) =>
      ipcRenderer.invoke("zeno:workspace:create-git-branch", branch, options),
    listGitWorktrees: (cwd) => ipcRenderer.invoke("zeno:workspace:list-git-worktrees", cwd),
    listManagedWorktrees: () => ipcRenderer.invoke("zeno:workspace:list-managed-worktrees"),
    createGitWorktree: (options) =>
      ipcRenderer.invoke("zeno:workspace:create-git-worktree", options),
    removeGitWorktree: (worktreePath, cwd) =>
      ipcRenderer.invoke("zeno:workspace:remove-git-worktree", worktreePath, cwd),
    getWorktreePrefs: (cwd) => ipcRenderer.invoke("zeno:workspace:get-worktree-prefs", cwd),
    setWorktreePrefs: (patch) => ipcRenderer.invoke("zeno:workspace:set-worktree-prefs", patch),
    getGitPrefs: () => ipcRenderer.invoke("zeno:workspace:get-git-prefs"),
    setGitPrefs: (patch) => ipcRenderer.invoke("zeno:workspace:set-git-prefs", patch),
    gitStatus: (cwd) => ipcRenderer.invoke("zeno:workspace:git-status", cwd),
    gitCommit: (message, cwd) => ipcRenderer.invoke("zeno:workspace:git-commit", message, cwd),
    gitPull: (cwd) => ipcRenderer.invoke("zeno:workspace:git-pull", cwd),
    gitPush: (cwd) => ipcRenderer.invoke("zeno:workspace:git-push", cwd),
    gitCommitAndPush: (message, cwd) =>
      ipcRenderer.invoke("zeno:workspace:git-commit-and-push", message, cwd),
    gitGenerateCommitMessage: (cwd) =>
      ipcRenderer.invoke("zeno:workspace:git-generate-commit-message", cwd),
    openCreatePullRequest: (cwd) => ipcRenderer.invoke("zeno:workspace:open-create-pr", cwd),
    listOpenTargets: (cwd) => ipcRenderer.invoke("zeno:workspace:list-open-targets", cwd),
    openInApp: (appId, cwd) => ipcRenderer.invoke("zeno:workspace:open-in-app", appId, cwd),
  },
  trust: {
    get: () => ipcRenderer.invoke("zeno:trust:get"),
    set: (trusted) => ipcRenderer.invoke("zeno:trust:set", trusted),
  },
  models: {
    list: () => ipcRenderer.invoke("zeno:models:list"),
    set: (provider, id) => ipcRenderer.invoke("zeno:models:set", provider, id),
    getConfig: () => ipcRenderer.invoke("zeno:models:get-config"),
    upsertCustomProvider: (input) => ipcRenderer.invoke("zeno:models:upsert-custom", input),
    removeCustomProvider: (provider) => ipcRenderer.invoke("zeno:models:remove-custom", provider),
    removeCustomModel: (provider, modelId) =>
      ipcRenderer.invoke("zeno:models:remove-custom-model", provider, modelId),
    openConfig: () => ipcRenderer.invoke("zeno:models:open-config"),
    revealConfig: () => ipcRenderer.invoke("zeno:models:reveal-config"),
    listScoped: () => ipcRenderer.invoke("zeno:models:list-scoped"),
    refreshCatalog: () => ipcRenderer.invoke("zeno:models:refresh-catalog"),
    fetchModelList: (input) => ipcRenderer.invoke("zeno:models:fetch-list", input),
  },
  thinking: {
    set: (level) => ipcRenderer.invoke("zeno:thinking:set", level),
  },
  serviceTier: {
    set: (tier) => ipcRenderer.invoke("zeno:service-tier:set", tier),
  },
  providers: {
    list: () => ipcRenderer.invoke("zeno:providers:list"),
    usage: () => ipcRenderer.invoke("zeno:providers:usage"),
    setApiKey: (provider, apiKey) =>
      ipcRenderer.invoke("zeno:providers:set-api-key", provider, apiKey),
    clearAuth: (provider) => ipcRenderer.invoke("zeno:providers:clear-auth", provider),
    startOAuth: (provider, operationId) =>
      ipcRenderer.invoke("zeno:providers:oauth-start", provider, operationId),
    respondOAuth: (operationId, promptId, value, cancelled) =>
      ipcRenderer.invoke("zeno:providers:oauth-respond", operationId, promptId, value, cancelled),
    cancelOAuth: (operationId) => ipcRenderer.invoke("zeno:providers:oauth-cancel", operationId),
    onOAuthEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: HostEvent) => {
        if (value.type !== "providers.oauth") return;
        listener({
          operationId: value.requestId,
          provider: value.provider,
          update: value.update,
        });
      };
      ipcRenderer.on("zeno:host:event", handler);
      return () => ipcRenderer.removeListener("zeno:host:event", handler);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke("zeno:settings:get"),
    patch: (patch) => ipcRenderer.invoke("zeno:settings:patch", patch),
  },
  agent: {
    prompt: (message, streamingBehavior, imagePaths) =>
      ipcRenderer.invoke("zeno:agent:prompt", message, streamingBehavior, imagePaths),
    clearQueue: () => ipcRenderer.invoke("zeno:agent:queue-clear"),
    abort: () => ipcRenderer.invoke("zeno:agent:abort"),
  },
  session: {
    list: () => ipcRenderer.invoke("zeno:session:list"),
    listForCwd: (cwd) => ipcRenderer.invoke("zeno:session:list-for-cwd", cwd),
    create: () => ipcRenderer.invoke("zeno:session:new"),
    createBlankConversation: () => ipcRenderer.invoke("zeno:session:create-blank"),
    switch: (sessionPath) => ipcRenderer.invoke("zeno:session:switch", sessionPath),
    fork: (entryId) => ipcRenderer.invoke("zeno:session:fork", entryId),
    tree: () => ipcRenderer.invoke("zeno:session:tree"),
    navigateTree: (targetId, options) =>
      ipcRenderer.invoke("zeno:session:navigate-tree", targetId, options),
    compact: (instructions) => ipcRenderer.invoke("zeno:session:compact", instructions),
    setName: (name) => ipcRenderer.invoke("zeno:session:set-name", name),
    clone: () => ipcRenderer.invoke("zeno:session:clone"),
    info: () => ipcRenderer.invoke("zeno:session:info"),
    export: (format, outputPath) => ipcRenderer.invoke("zeno:session:export", format, outputPath),
    exportPick: (format) => ipcRenderer.invoke("zeno:session:export-pick", format),
    import: (inputPath) => ipcRenderer.invoke("zeno:session:import", inputPath),
    importPick: () => ipcRenderer.invoke("zeno:session:import-pick"),
    bash: (command, options) => ipcRenderer.invoke("zeno:session:bash", command, options),
    copyLastAssistant: () => ipcRenderer.invoke("zeno:session:copy-last"),
    share: () => ipcRenderer.invoke("zeno:session:share"),
  },
  runtime: {
    reload: () => ipcRenderer.invoke("zeno:runtime:reload"),
  },
  packages: {
    list: () => ipcRenderer.invoke("zeno:packages:list"),
    install: (source, scope, options) =>
      ipcRenderer.invoke("zeno:packages:install", source, scope, options),
    remove: (source, scope) => ipcRenderer.invoke("zeno:packages:remove", source, scope),
    update: (source) => ipcRenderer.invoke("zeno:packages:update", source),
    checkUpdates: () => ipcRenderer.invoke("zeno:packages:check-updates"),
    setEnabled: (source, scope, enabled) =>
      ipcRenderer.invoke("zeno:packages:set-enabled", source, scope, enabled),
    searchCatalog: (query, size, from) =>
      ipcRenderer.invoke("zeno:packages:search-catalog", query, size, from),
  },
  resources: {
    list: () => ipcRenderer.invoke("zeno:resources:list"),
  },
  mcp: {
    getConfig: () => ipcRenderer.invoke("zeno:mcp:get-config"),
    installServer: (name, packageName) =>
      ipcRenderer.invoke("zeno:mcp:install-server", name, packageName),
    removeServer: (name) => ipcRenderer.invoke("zeno:mcp:remove-server", name),
    setEnabled: (name, enabled) => ipcRenderer.invoke("zeno:mcp:set-enabled", name, enabled),
    updateServer: (name) => ipcRenderer.invoke("zeno:mcp:update-server", name),
    getPath: () => ipcRenderer.invoke("zeno:mcp:get-path"),
    searchCatalog: (query, size, from) =>
      ipcRenderer.invoke("zeno:mcp:search-catalog", query, size, from),
  },
  extensionUi: {
    respond: (response) => ipcRenderer.invoke("zeno:extension-ui:respond", response),
  },
  test: {
    crashHost: () => ipcRenderer.invoke("zeno:test:crash-host"),
  },
  notifications: {
    show: (payload) =>
      ipcRenderer.invoke("zeno:notifications:show", {
        title: payload?.title ?? "",
        ...(payload?.body !== undefined ? { body: payload.body } : {}),
        ...(payload?.silent !== undefined ? { silent: payload.silent } : {}),
        ...(payload?.force !== undefined ? { force: payload.force } : {}),
        ...(payload?.requireUnfocused !== undefined
          ? { requireUnfocused: payload.requireUnfocused }
          : {}),
      }),
    openSystemSettings: () => ipcRenderer.invoke("zeno:notifications:open-system-settings"),
  },
};

contextBridge.exposeInMainWorld("zeno", api);
