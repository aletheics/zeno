/**
 * The MCP servers list in the packages page's installed tab.
 *
 * Extracted from `main.tsx` (file-size ratchet) so the section can grow — the adapter
 * migration needs a notice and a removal action here — without touching a frozen file.
 */
import type { McpConfig } from "@zeno/contracts";
import { t, type Locale } from "../lib/i18n.ts";

export function McpServersSection(props: {
  locale: Locale;
  servers: McpConfig;
  /** A change is pending a host reload. */
  dirty: boolean;
  busy: boolean;
  onSetEnabled: (name: string, enabled: boolean) => void;
  onUpdate: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string>) =>
    t(props.locale, key, vars);
  const entries = Object.entries(props.servers.mcpServers ?? {});

  return (
    <div className="mt-4" data-testid="mcp-installed">
      {entries.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <h3 className="text-[14px] font-semibold text-[var(--foreground)]">
              {tr("mcp.installedTitle")}
            </h3>
            {props.dirty && (
              <span className="chip-status" data-tone="update">
                {tr("mcp.restartHint")}
              </span>
            )}
          </div>
          {props.dirty && <p className="form-hint m-0 mt-1">{tr("mcp.restartHintDetail")}</p>}
          <div className="item-list mt-2">
            {entries.map(([name, cfg]) => {
              // A disabled entry carries both flags; either one alone means the same thing,
              // so read both rather than trusting the file to be canonical.
              const off = cfg.disabled === true || cfg.enabled === false;
              return (
                <article
                  key={name}
                  className="item-card"
                  data-enabled={off ? "false" : "true"}
                  data-testid={`mcp-card-${name}`}
                >
                  <div className="min-w-0">
                    <div className="title">{name}</div>
                    <div className="meta">
                      {cfg.packageName ?? `${cfg.command} ${cfg.args?.join(" ") ?? ""}`}
                    </div>
                  </div>
                  <div className="badges">
                    <span
                      className="chip-status"
                      data-tone={off ? "off" : "on"}
                      data-testid={`mcp-status-${name}`}
                    >
                      {off ? tr("packages.disabled") : tr("packages.enabled")}
                    </span>
                    <span className="chip">global</span>
                    <span className="chip">npm</span>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      data-testid={`mcp-enable-${name}`}
                      disabled={props.busy}
                      onClick={() => props.onSetEnabled(name, off)}
                    >
                      {off ? tr("packages.enable") : tr("packages.disable")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      data-testid={`mcp-update-${name}`}
                      disabled={props.busy}
                      title={tr("packages.update")}
                      onClick={() => props.onUpdate(name)}
                    >
                      {tr("packages.update")}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm danger"
                      data-testid={`mcp-remove-${name}`}
                      disabled={props.busy}
                      onClick={() => props.onRemove(name)}
                    >
                      {tr("mcp.remove")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-panel" data-testid="mcp-empty">
          <h2>{tr("mcp.emptyTitle")}</h2>
          <p>{tr("mcp.emptyBody")}</p>
        </div>
      )}
    </div>
  );
}
