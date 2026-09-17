import { useCallback, useState } from "react";
import type { SessionInfoView, SessionTreeView } from "@zeno/contracts";
import { t, type Locale } from "@/lib/i18n";

/* The session tree / session info panels, lifted out of `App()`.
 *
 * They were ten `useState` cells plus four loaders inlined in the shell. The loaders
 * repeated one shape twice — clear error, ensure the host, fetch, store, catch, clear
 * loading — so that shape is factored once below and the two panels differ only by their
 * fetch call and their failure message.
 *
 * The panel *rendering* stays in `components/SessionParityPanels.tsx`; this owns only the
 * state and the loading, and exposes intent-named actions rather than raw setters.
 *
 * `ensureHost` is injected because it lives in the shell (it starts the Agent Host), so the
 * hook stays free of the store: `hooks/` reads state, it does not orchestrate the host. */

type SessionPanelFetch<T> = () => Promise<T>;

/**
 * One loader's worth of state. Kept private — the two panels are what callers want.
 *
 * `ensureHost` only runs when the host is not up yet, matching the original loaders, which
 * checked the snapshot first so a refresh did not restart a healthy host.
 */
function useLoadedPanel<T>(options: {
  fetch: SessionPanelFetch<T>;
  failureMessage: string;
  ensureHost: () => Promise<unknown>;
  hasHost: () => boolean;
}) {
  const { fetch, failureMessage, ensureHost, hasHost } = options;
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      if (!hasHost()) await ensureHost();
      setData(await fetch());
    } catch (caught) {
      // Prefer the error's own message; the fallback is localized.
      setError(caught instanceof Error && caught.message ? caught.message : failureMessage);
    } finally {
      setLoading(false);
    }
  }, [ensureHost, failureMessage, fetch, hasHost]);

  return { data, loading, error, refresh };
}

export type SessionTreeMode = "navigate" | "fork";

export function useSessionPanels(options: {
  locale: Locale;
  /** Injected from the shell; see the note above. */
  ensureHost: () => Promise<unknown>;
  hasHost: () => boolean;
}) {
  const { locale, ensureHost, hasHost } = options;
  const tr = (key: Parameters<typeof t>[1]) => t(locale, key);

  const [treeOpen, setTreeOpen] = useState(false);
  const [treeMode, setTreeMode] = useState<SessionTreeMode>("navigate");
  const [infoOpen, setInfoOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const tree = useLoadedPanel<SessionTreeView>({
    fetch: () => window.zeno.session.tree(),
    failureMessage: tr("sessionTree.loadFailed"),
    ensureHost,
    hasHost,
  });
  const info = useLoadedPanel<SessionInfoView>({
    fetch: () => window.zeno.session.info(),
    failureMessage: tr("sessionInfo.loadFailed"),
    ensureHost,
    hasHost,
  });

  const { refresh: refreshTree } = tree;
  const { refresh: refreshInfo } = info;

  /** Open the tree in a mode and load it. The mode decides how picking a node behaves. */
  const openTree = useCallback(
    async (mode: SessionTreeMode = "navigate") => {
      setTreeMode(mode);
      setTreeOpen(true);
      await refreshTree();
    },
    [refreshTree],
  );

  /** The two panels are independent in the shell — opening one does not close the other. */
  const openInfo = useCallback(async () => {
    setInfoOpen(true);
    await refreshInfo();
  }, [refreshInfo]);

  return {
    tree: {
      /** Whether the panel is showing. */
      open: treeOpen,
      /** How a picked node behaves — read by the panel to label its action. */
      mode: treeMode,
      data: tree.data,
      loading: tree.loading,
      error: tree.error,
      /** Re-read without changing visibility. */
      refresh: tree.refresh,
      /** Show it, in a mode, and load. */
      openPanel: openTree,
      close: () => setTreeOpen(false),
    },
    info: {
      open: infoOpen,
      data: info.data,
      loading: info.loading,
      error: info.error,
      refresh: info.refresh,
      openPanel: openInfo,
      close: () => setInfoOpen(false),
    },
    /** Session info's rename dialog, which the panel drives from its own button. */
    rename: {
      open: renaming,
      start: () => setRenaming(true),
      cancel: () => setRenaming(false),
    },
  };
}
