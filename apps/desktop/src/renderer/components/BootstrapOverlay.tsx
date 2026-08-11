/**
 * Full-window cold-start gate: logo + live pi / host bootstrap status.
 * Blocks interaction until App marks bootstrap ready.
 */
import { PixLogo } from "./PixLogo.tsx";
import { cn } from "../lib/utils.ts";

export function BootstrapOverlay(props: {
  status: string;
  /** Optional secondary line (e.g. npm install tail). */
  detail?: string;
  error?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("bootstrap-overlay", props.className)}
      data-testid="bootstrap-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="bootstrap-overlay-inner">
        <div className="bootstrap-logo-wrap" aria-hidden>
          <PixLogo className="bootstrap-logo" title="Zeno" />
        </div>
        <div className="bootstrap-brand">Zeno</div>
        <div className="bootstrap-status" data-testid="bootstrap-status">
          {props.status}
        </div>
        {props.detail ? (
          <div className="bootstrap-detail" data-testid="bootstrap-detail">
            {props.detail}
          </div>
        ) : null}
        {props.error ? (
          <div className="bootstrap-error" data-testid="bootstrap-error" role="alert">
            {props.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
