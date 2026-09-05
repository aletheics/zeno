/**
 * Minimal self-contained context menu for the pet overlay.
 *
 * zeno-update reuses its global `ContextMenu` (flyout submenus, app icons,
 * shared menu CSS). The pet menu needs none of that — three actions, a couple
 * of separators, portal + outside-click/Escape dismiss — so this keeps the same
 * public surface (`open/x/y/items/onClose/estimatedWidth/estimatedHeight`) with
 * its own inline chrome instead of depending on zeno-update's menu CSS/icon set.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type PetContextMenuItem = {
  id?: string;
  label?: ReactNode;
  separator?: boolean;
  onClick?: () => void;
};

function clampPos(
  x: number,
  y: number,
  width: number,
  height: number,
  viewport?: { width: number; height: number },
): { left: number; top: number } {
  const vw = viewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
  const vh = viewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 768);
  const margin = 8;
  const w = Math.max(1, Math.min(width, vw - margin * 2));
  const h = Math.max(1, Math.min(height, vh - margin * 2));
  return {
    left: Math.max(margin, Math.min(x, vw - w - margin)),
    top: Math.max(margin, Math.min(y, vh - h - margin)),
  };
}

const PANEL_STYLE: CSSProperties = {
  position: "fixed",
  zIndex: 13001,
  minWidth: 132,
  padding: "4px",
  borderRadius: 10,
  background: "rgba(28, 28, 32, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 12px 28px rgba(0, 0, 0, 0.4)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  color: "#f4f4f5",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontSize: 13,
};

const ITEM_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "7px 10px",
  borderRadius: 7,
  background: "transparent",
  border: "none",
  color: "inherit",
  fontSize: 13,
  lineHeight: 1.3,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const SEP_STYLE: CSSProperties = {
  height: 1,
  margin: "4px 6px",
  background: "rgba(255, 255, 255, 0.12)",
};

export function PetContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  estimatedWidth = 148,
  estimatedHeight = 188,
}: {
  open: boolean;
  x: number;
  y: number;
  items: PetContextMenuItem[];
  onClose: () => void;
  estimatedWidth?: number;
  estimatedHeight?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => clampPos(x, y, estimatedWidth, estimatedHeight));
  const [hoverIdx, setHoverIdx] = useState(-1);

  useLayoutEffect(() => {
    if (!open) return;
    setPos(clampPos(x, y, estimatedWidth, estimatedHeight));
    setHoverIdx(-1);
  }, [open, x, y, estimatedWidth, estimatedHeight]);

  // After paint, re-clamp using the real menu size if it has been measured.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setPos(
      clampPos(
        x,
        y,
        Math.ceil(rect.width) || estimatedWidth,
        Math.ceil(rect.height) || estimatedHeight,
      ),
    );
  }, [open, x, y, items.length, estimatedWidth, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".pet-menu")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const visible = items.filter(Boolean);

  return createPortal(
    <div
      ref={rootRef}
      className="pet-menu"
      role="menu"
      style={{ ...PANEL_STYLE, left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {visible.map((item, i) =>
        item.separator ? (
          <div key={item.id ?? `pet-sep-${i}`} role="separator" style={SEP_STYLE} />
        ) : (
          <button
            key={item.id ?? `pet-item-${i}`}
            type="button"
            role="menuitem"
            className="pet-menu__item"
            style={{
              ...ITEM_STYLE,
              background: hoverIdx === i ? "rgba(255, 255, 255, 0.1)" : "transparent",
            }}
            onMouseEnter={() => setHoverIdx(i)}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
