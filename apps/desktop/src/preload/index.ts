import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppUpdateStatus,
  HostEvent,
  PiCliProgressEvent,
  PixDesktopApi,
  TerminalDataEvent,
  TerminalExitEvent,
} from "@zeno/contracts";

const api: PixDesktopApi = {
  app: {
    getRuntime: () => ipcRenderer.invoke("pix:app:get-runtime"),
    getUpdateStatus: () => ipcRenderer.invoke("pix:app:get-update-status"),
    checkForUpdates: () => ipcRenderer.invoke("pix:app:check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("pix:app:download-update"),
    quitAndInstall: () => ipcRenderer.invoke("pix:app:quit-and-install"),
    onUpdateStatus(listener) {
      const handler = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus) =>
        listener(status);
      ipcRenderer.on("pix:app:update-status", handler);
      return () => ipcRenderer.removeListener("pix:app:update-status", handler);
    },
  },
  proxy: {
    get: () => ipcRenderer.invoke("pix:proxy:get"),
    set: (prefs) => ipcRenderer.invoke("pix:proxy:set", prefs),
    discoverLocal: () => ipcRenderer.invoke("pix:proxy:discover-local"),
  },
  window: {
    minimize: () => ipcRenderer.invoke("pix:window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("pix:window:toggle-maximize"),
    close: () => ipcRenderer.invoke("pix:window:close"),
    isMaximized: () => ipcRenderer.invoke("pix:window:is-maximized"),
    onStateChange(listener) {
      const handler = (_event: Electron.IpcRendererEvent, state: { isMaximized: boolean }) =>
        listener(state);
      ipcRenderer.on("pix:window:state", handler);
      return () => ipcRenderer.removeListener("pix:window:state", handler);
    },
  },
  pi: {
    ensure: () => ipcRenderer.invoke("pix:pi:ensure"),
    onProgress(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: PiCliProgressEvent) =>
        listener(value);
      ipcRenderer.on("pix:pi:progress", handler);
      return () => ipcRenderer.removeListener("pix:pi:progress", handler);
    },
  },
  piSdk: {
    getStatus: () => ipcRenderer.invoke("pix:pi-sdk:get-status"),
    setSource: (source, options) => ipcRenderer.invoke("pix:pi-sdk:set-source", source, options),
    listConfigFiles: () => ipcRenderer.invoke("pix:pi-sdk:list-config-files"),
    revealConfig: (id) => ipcRenderer.invoke("pix:pi-sdk:reveal-config", id),
    openConfig: (id) => ipcRenderer.invoke("pix:pi-sdk:open-config", id),
    installGlobal: () => ipcRenderer.invoke("pix:pi-sdk:install-global"),
    checkLatest: () => ipcRenderer.invoke("pix:pi-sdk:check-latest"),
  },
  runtimes: {
    getStatus: () => ipcRenderer.invoke("pix:runtimes:get-status"),
    setPrefs: (prefs) => ipcRenderer.invoke("pix:runtimes:set-prefs", prefs),
  },
  terminal: {
    open: (options) => ipcRenderer.invoke("pix:terminal:open", options),
    write: (data) => ipcRenderer.invoke("pix:terminal:write", data),
    resize: (cols, rows) => ipcRenderer.invoke("pix:terminal:resize", cols, rows),
    suspend: () => ipcRenderer.invoke("pix:terminal:suspend"),
    dispose: () => ipcRenderer.invoke("pix:terminal:dispose"),
    status: () => ipcRenderer.invoke("pix:terminal:status"),
    onData(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: TerminalDataEvent) =>
        listener(value);
      ipcRenderer.on("pix:terminal:data", handler);
      return () => ipcRenderer.removeListener("pix:terminal:data", handler);
    },
    onExit(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: TerminalExitEvent) =>
        listener(value);
      ipcRenderer.on("pix:terminal:exit", handler);
      return () => ipcRenderer.removeListener("pix:terminal:exit", handler);
    },
  },
  appearance: {
    setThemeSource: (source) => ipcRenderer.invoke("pix:appearance:set-theme-source", source),
    getAppScale: () => ipcRenderer.invoke("pix:appearance:get-app-scale"),
    setAppScale: (scale) => ipcRenderer.invoke("pix:appearance:set-app-scale", scale),
  },
  themes: {
    list: () => ipcRenderer.invoke("pix:themes:list"),
    activate: (id) => ipcRenderer.invoke("pix:themes:activate", id),
    save: (input) => ipcRenderer.invoke("pix:themes:save", input),
    remove: (id) => ipcRenderer.invoke("pix:themes:remove", id),
    importPick: () => ipcRenderer.invoke("pix:themes:import-pick"),
    exportPick: (id) => ipcRenderer.invoke("pix:themes:export-pick", id),
  },
  host: {
    start: (options) => ipcRenderer.invoke("pix:host:start", options),
    stop: () => ipcRenderer.invoke("pix:host:stop"),
    snapshot: () => ipcRenderer.invoke("pix:host:snapshot"),
    onEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: HostEvent) => listener(value);
      ipcRenderer.on("pix:host:event", handler);
      return () => ipcRenderer.removeListener("pix:host:event", handler);
    },
  },
  workspace: {
    getCwd: () => ipcRenderer.invoke("pix:workspace:get-cwd"),
    listRecent: () => ipcRenderer.invoke("pix:workspace:list-recent"),
    openPath: (cwd, options) => ipcRenderer.invoke("pix:workspace:open-path", cwd, options),
    pickFolder: () => ipcRenderer.invoke("pix:workspace:pick-folder"),
    pickAttachments: (options) => ipcRenderer.invoke("pix:workspace:pick-attachments", options),
    pathForFile: (file) => webUtils.getPathForFile(file),
    searchPaths: (query, options) =>
      ipcRenderer.invoke("pix:workspace:search-paths", query ?? "", options),
    saveClipboardImage: (options) =>
      ipcRenderer.invoke("pix:workspace:save-clipboard-image", options),
    readAttachmentPreview: (path) =>
      ipcRenderer.invoke("pix:workspace:read-attachment-preview", path),
    ensureDefault: () => ipcRenderer.invoke("pix:workspace:ensure-default"),
    ensureConversation: () => ipcRenderer.invoke("pix:workspace:ensure-conversation"),
    removeRecent: (cwd) => ipcRenderer.invoke("pix:workspace:remove-recent", cwd),
    revealInFolder: (cwd) => ipcRenderer.invoke("pix:workspace:reveal-in-folder", cwd),
    openFile: (path, location) => ipcRenderer.invoke("pix:workspace:open-file", path, location),
    openExternal: (url) => ipcRenderer.invoke("pix:workspace:open-external", url),
    clearActive: () => ipcRenderer.invoke("pix:workspace:clear-active"),
    getGitContext: (cwd) => ipcRenderer.invoke("pix:workspace:get-git-context", cwd),
    listGitBranches: (cwd) => ipcRenderer.invoke("pix:workspace:list-git-branches", cwd),
    checkoutGitBranch: (branch, cwd) =>
      ipcRenderer.invoke("pix:workspace:checkout-git-branch", branch, cwd),
    createGitBranch: (branch, options) =>
      ipcRenderer.invoke("pix:workspace:create-git-branch", branch, options),
    listGitWorktrees: (cwd) => ipcRenderer.invoke("pix:workspace:list-git-worktrees", cwd),
    listManagedWorktrees: () => ipcRenderer.invoke("pix:workspace:list-managed-worktrees"),
    createGitWorktree: (options) =>
      ipcRenderer.invoke("pix:workspace:create-git-worktree", options),
    removeGitWorktree: (worktreePath, cwd) =>
      ipcRenderer.invoke("pix:workspace:remove-git-worktree", worktreePath, cwd),
    getWorktreePrefs: (cwd) => ipcRenderer.invoke("pix:workspace:get-worktree-prefs", cwd),
    setWorktreePrefs: (patch) => ipcRenderer.invoke("pix:workspace:set-worktree-prefs", patch),
    getGitPrefs: () => ipcRenderer.invoke("pix:workspace:get-git-prefs"),
    setGitPrefs: (patch) => ipcRenderer.invoke("pix:workspace:set-git-prefs", patch),
    gitStatus: (cwd) => ipcRenderer.invoke("pix:workspace:git-status", cwd),
    gitCommit: (message, cwd) => ipcRenderer.invoke("pix:workspace:git-commit", message, cwd),
    gitPull: (cwd) => ipcRenderer.invoke("pix:workspace:git-pull", cwd),
    gitPush: (cwd) => ipcRenderer.invoke("pix:workspace:git-push", cwd),
    gitCommitAndPush: (message, cwd) =>
      ipcRenderer.invoke("pix:workspace:git-commit-and-push", message, cwd),
    gitGenerateCommitMessage: (cwd) =>
      ipcRenderer.invoke("pix:workspace:git-generate-commit-message", cwd),
    openCreatePullRequest: (cwd) => ipcRenderer.invoke("pix:workspace:open-create-pr", cwd),
    listOpenTargets: (cwd) => ipcRenderer.invoke("pix:workspace:list-open-targets", cwd),
    openInApp: (appId, cwd) => ipcRenderer.invoke("pix:workspace:open-in-app", appId, cwd),
  },
  trust: {
    get: () => ipcRenderer.invoke("pix:trust:get"),
    set: (trusted) => ipcRenderer.invoke("pix:trust:set", trusted),
  },
  models: {
    list: () => ipcRenderer.invoke("pix:models:list"),
    set: (provider, id) => ipcRenderer.invoke("pix:models:set", provider, id),
    getConfig: () => ipcRenderer.invoke("pix:models:get-config"),
    upsertCustomProvider: (input) => ipcRenderer.invoke("pix:models:upsert-custom", input),
    removeCustomProvider: (provider) => ipcRenderer.invoke("pix:models:remove-custom", provider),
    removeCustomModel: (provider, modelId) =>
      ipcRenderer.invoke("pix:models:remove-custom-model", provider, modelId),
    openConfig: () => ipcRenderer.invoke("pix:models:open-config"),
    revealConfig: () => ipcRenderer.invoke("pix:models:reveal-config"),
    listScoped: () => ipcRenderer.invoke("pix:models:list-scoped"),
    refreshCatalog: () => ipcRenderer.invoke("pix:models:refresh-catalog"),
  },
  thinking: {
    set: (level) => ipcRenderer.invoke("pix:thinking:set", level),
  },
  serviceTier: {
    set: (tier) => ipcRenderer.invoke("pix:service-tier:set", tier),
  },
  providers: {
    list: () => ipcRenderer.invoke("pix:providers:list"),
    usage: () => ipcRenderer.invoke("pix:providers:usage"),
    setApiKey: (provider, apiKey) =>
      ipcRenderer.invoke("pix:providers:set-api-key", provider, apiKey),
    clearAuth: (provider) => ipcRenderer.invoke("pix:providers:clear-auth", provider),
    startOAuth: (provider, operationId) =>
      ipcRenderer.invoke("pix:providers:oauth-start", provider, operationId),
    respondOAuth: (operationId, promptId, value, cancelled) =>
      ipcRenderer.invoke("pix:providers:oauth-respond", operationId, promptId, value, cancelled),
    cancelOAuth: (operationId) => ipcRenderer.invoke("pix:providers:oauth-cancel", operationId),
    onOAuthEvent(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: HostEvent) => {
        if (value.type !== "providers.oauth") return;
        listener({
          operationId: value.requestId,
          provider: value.provider,
          update: value.update,
        });
      };
      ipcRenderer.on("pix:host:event", handler);
      return () => ipcRenderer.removeListener("pix:host:event", handler);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke("pix:settings:get"),
    patch: (patch) => ipcRenderer.invoke("pix:settings:patch", patch),
  },
  agent: {
    prompt: (message, streamingBehavior, imagePaths) =>
      ipcRenderer.invoke("pix:agent:prompt", message, streamingBehavior, imagePaths),
    clearQueue: () => ipcRenderer.invoke("pix:agent:queue-clear"),
    abort: () => ipcRenderer.invoke("pix:agent:abort"),
  },
  session: {
    list: () => ipcRenderer.invoke("pix:session:list"),
    listForCwd: (cwd) => ipcRenderer.invoke("pix:session:list-for-cwd", cwd),
    create: () => ipcRenderer.invoke("pix:session:new"),
    createBlankConversation: () => ipcRenderer.invoke("pix:session:create-blank"),
    switch: (sessionPath) => ipcRenderer.invoke("pix:session:switch", sessionPath),
    fork: (entryId) => ipcRenderer.invoke("pix:session:fork", entryId),
    tree: () => ipcRenderer.invoke("pix:session:tree"),
    navigateTree: (targetId, options) =>
      ipcRenderer.invoke("pix:session:navigate-tree", targetId, options),
    compact: (instructions) => ipcRenderer.invoke("pix:session:compact", instructions),
    setName: (name) => ipcRenderer.invoke("pix:session:set-name", name),
    clone: () => ipcRenderer.invoke("pix:session:clone"),
    info: () => ipcRenderer.invoke("pix:session:info"),
    export: (format, outputPath) => ipcRenderer.invoke("pix:session:export", format, outputPath),
    exportPick: (format) => ipcRenderer.invoke("pix:session:export-pick", format),
    import: (inputPath) => ipcRenderer.invoke("pix:session:import", inputPath),
    importPick: () => ipcRenderer.invoke("pix:session:import-pick"),
    bash: (command, options) => ipcRenderer.invoke("pix:session:bash", command, options),
    copyLastAssistant: () => ipcRenderer.invoke("pix:session:copy-last"),
    share: () => ipcRenderer.invoke("pix:session:share"),
  },
  runtime: {
    reload: () => ipcRenderer.invoke("pix:runtime:reload"),
  },
  packages: {
    list: () => ipcRenderer.invoke("pix:packages:list"),
    install: (source, scope, options) =>
      ipcRenderer.invoke("pix:packages:install", source, scope, options),
    remove: (source, scope) => ipcRenderer.invoke("pix:packages:remove", source, scope),
    update: (source) => ipcRenderer.invoke("pix:packages:update", source),
    checkUpdates: () => ipcRenderer.invoke("pix:packages:check-updates"),
    setEnabled: (source, scope, enabled) =>
      ipcRenderer.invoke("pix:packages:set-enabled", source, scope, enabled),
    searchCatalog: (query, size, from) =>
      ipcRenderer.invoke("pix:packages:search-catalog", query, size, from),
  },
  resources: {
    list: () => ipcRenderer.invoke("pix:resources:list"),
  },
  extensionUi: {
    respond: (response) => ipcRenderer.invoke("pix:extension-ui:respond", response),
  },
  test: {
    crashHost: () => ipcRenderer.invoke("pix:test:crash-host"),
  },
  notifications: {
    show: (payload) =>
      ipcRenderer.invoke("pix:notifications:show", {
        title: payload?.title ?? "",
        ...(payload?.body !== undefined ? { body: payload.body } : {}),
        ...(payload?.silent !== undefined ? { silent: payload.silent } : {}),
        ...(payload?.force !== undefined ? { force: payload.force } : {}),
        ...(payload?.requireUnfocused !== undefined
          ? { requireUnfocused: payload.requireUnfocused }
          : {}),
      }),
    openSystemSettings: () => ipcRenderer.invoke("pix:notifications:open-system-settings"),
  },
};

contextBridge.exposeInMainWorld("pix", api);
