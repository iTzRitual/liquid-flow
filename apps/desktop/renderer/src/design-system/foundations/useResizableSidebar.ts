import * as React from 'react';

// Width bounds (px). Dragging narrower than COLLAPSE_AT hides the rail entirely
// rather than letting it shrink into an unusable sliver.
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;
const COLLAPSE_AT = 200;
// Pointer travel (px) below which a press on the handle counts as a click
// (collapse) rather than a resize drag.
const DRAG_THRESHOLD = 4;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readStoredWidth(storageKey: string | undefined, fallback: number): number {
  if (!storageKey || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp(n, MIN_WIDTH, MAX_WIDTH) : fallback;
  } catch {
    return fallback;
  }
}

export interface UseResizableSidebarOptions {
  /** localStorage key the width is remembered under; omit to keep it in-memory. */
  storageKey?: string;
  defaultCollapsed?: boolean;
  defaultWidth?: number;
}

export interface ResizableSidebar {
  width: number;
  collapsed: boolean;
  resizing: boolean;
  /** Pointer-down handler for the drag handle; tracks the pointer until release. */
  beginResize: (e: React.PointerEvent) => void;
  collapse: () => void;
  expand: () => void;
}

/**
 * State for a drag-resizable, collapsible sidebar. The width is clamped to
 * [MIN_WIDTH, MAX_WIDTH]; dragging below COLLAPSE_AT collapses the rail while
 * keeping the last real width, so reopening restores it. Only the width is
 * persisted (via `storageKey`) — collapse is session state, seeded by
 * `defaultCollapsed`.
 */
export function useResizableSidebar(options: UseResizableSidebarOptions = {}): ResizableSidebar {
  const { storageKey, defaultCollapsed = false, defaultWidth = DEFAULT_WIDTH } = options;
  const [width, setWidth] = React.useState(() => readStoredWidth(storageKey, defaultWidth));
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [resizing, setResizing] = React.useState(false);

  const persist = React.useCallback(
    (w: number) => {
      if (!storageKey || typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, String(w));
      } catch {
        /* storage unavailable (private mode / quota) — width just isn't remembered */
      }
    },
    [storageKey],
  );

  const beginResize = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const wasCollapsed = collapsed;
      // A collapsed rail resizes as if it were zero-width, so dragging its edge
      // grows the sidebar back out from nothing (symmetric with dragging it shut).
      const startWidth = wasCollapsed ? 0 : width;
      // Last committed width, read synchronously on release so the persisted
      // value isn't a render behind the final pointer position. Seeded to the
      // remembered width so a collapsed drag that never expands leaves it intact.
      let latest = width;
      // A press that never travels past DRAG_THRESHOLD is a click, not a drag,
      // and toggles the rail on release instead of resizing it.
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        if (!moved) {
          if (Math.abs(ev.clientX - startX) <= DRAG_THRESHOLD) return;
          moved = true;
          setResizing(true);
          if (typeof document !== 'undefined') document.body.style.userSelect = 'none';
        }
        const desired = startWidth + (ev.clientX - startX);
        if (desired < COLLAPSE_AT) {
          setCollapsed(true);
          return;
        }
        setCollapsed(false);
        latest = clamp(desired, MIN_WIDTH, MAX_WIDTH);
        setWidth(latest);
      };
      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (moved) {
          setResizing(false);
          if (typeof document !== 'undefined') document.body.style.userSelect = '';
          setWidth(latest);
          persist(latest);
        } else {
          // Click with no drag toggles the rail (mirrors the sidebar's own button).
          setCollapsed(!wasCollapsed);
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [width, collapsed, persist],
  );

  const collapse = React.useCallback(() => setCollapsed(true), []);
  const expand = React.useCallback(() => setCollapsed(false), []);

  // ⌘B / Ctrl+B toggles the rail, except while typing in a field.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'b') return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { width, collapsed, resizing, beginResize, collapse, expand };
}
