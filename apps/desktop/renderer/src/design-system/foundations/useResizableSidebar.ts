import * as React from 'react';

// Width bounds (px). Dragging narrower than COLLAPSE_AT hides the rail entirely
// rather than letting it shrink into an unusable sliver.
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 320;
const COLLAPSE_AT = 200;

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
      const startWidth = width;
      // Last committed width during this drag, read synchronously on release so
      // the persisted value isn't a render behind the final pointer position.
      let latest = startWidth;
      setResizing(true);
      if (typeof document !== 'undefined') document.body.style.userSelect = 'none';

      const onMove = (ev: PointerEvent) => {
        const desired = startWidth + (ev.clientX - startX);
        if (desired < COLLAPSE_AT) {
          setCollapsed(true);
          finish();
          return;
        }
        setCollapsed(false);
        latest = clamp(desired, MIN_WIDTH, MAX_WIDTH);
        setWidth(latest);
      };
      const finish = () => {
        setResizing(false);
        if (typeof document !== 'undefined') document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        persist(latest);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [width, persist],
  );

  const collapse = React.useCallback(() => setCollapsed(true), []);
  const expand = React.useCallback(() => setCollapsed(false), []);

  return { width, collapsed, resizing, beginResize, collapse, expand };
}
