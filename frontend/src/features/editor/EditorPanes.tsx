import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

/*
 * The page editor's three columns: sections (left), section editor (centre), live preview (right).
 * The dividers between them are dragged to resize; dragging a column almost shut collapses it to a
 * thin rail, and double-clicking a divider collapses / reopens the side column next to it.
 * Sizes and collapsed columns are remembered in this browser. At least one column always stays open.
 */

export type PaneId = 'left' | 'center' | 'right';
export interface PaneLayout {
  collapsed: Record<PaneId, boolean>;
  /** Widths in px of the side columns; the centre takes the rest. */
  leftWidth: number;
  rightWidth: number;
}

export const PANES: { id: PaneId; label: string }[] = [
  { id: 'left', label: 'Sections' },
  { id: 'center', label: 'Editor' },
  { id: 'right', label: 'Preview' },
];

const KEY = 'editor-pane-layout';
const RAIL = 40;
const DIVIDER = 8;
const MIN = { left: 200, center: 320, right: 300 } as const;
const MAX_LEFT = 520;
/** Dragged narrower than this, a column collapses. */
const COLLAPSE_BELOW = { left: 130, center: 220, right: 180 } as const;
const DEFAULT: PaneLayout = { collapsed: { left: false, center: false, right: false }, leftWidth: 270, rightWidth: 560 };

export const openPaneCount = (layout: PaneLayout) => PANES.filter((p) => !layout.collapsed[p.id]).length;

function load(): PaneLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PaneLayout> | null;
    if (!saved) return DEFAULT;
    const layout: PaneLayout = {
      collapsed: { left: Boolean(saved.collapsed?.left), center: Boolean(saved.collapsed?.center), right: Boolean(saved.collapsed?.right) },
      leftWidth: Number(saved.leftWidth) || DEFAULT.leftWidth,
      rightWidth: Number(saved.rightWidth) || DEFAULT.rightWidth,
    };
    return openPaneCount(layout) ? layout : { ...layout, collapsed: DEFAULT.collapsed };
  } catch {
    return DEFAULT;
  }
}

export function usePaneLayout() {
  const [layout, setLayout] = useState<PaneLayout>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      /* storage unavailable: the layout just isn't remembered */
    }
  }, [layout]);

  const update = useCallback((next: (current: PaneLayout) => PaneLayout) => setLayout((current) => {
    const candidate = next(current);
    return openPaneCount(candidate) ? candidate : current;
  }), []);
  const toggle = useCallback((id: PaneId) => update((l) => ({ ...l, collapsed: { ...l.collapsed, [id]: !l.collapsed[id] } })), [update]);
  return { layout, update, toggle };
}

/** Grid columns: left, divider, centre, divider, right. The centre (or, when it is collapsed, the preview) takes the rest. */
export function paneColumns({ collapsed, leftWidth, rightWidth }: PaneLayout): string {
  const left = collapsed.left ? `${RAIL}px` : `${leftWidth}px`;
  const center = collapsed.center ? `${RAIL}px` : `minmax(${MIN.center}px, 1fr)`;
  const right = collapsed.right ? `${RAIL}px` : collapsed.center ? 'minmax(0, 1fr)' : `minmax(0, ${rightWidth}px)`;
  return [left, `${DIVIDER}px`, center, `${DIVIDER}px`, right].join(' ');
}

/** A collapsed column: click it to open it again. */
export function PaneRail({ label, side, onOpen }: { label: string; side: PaneId; onOpen: () => void }) {
  return (
    <button type="button" className={`pane-rail pane-rail-${side}`} onClick={onOpen} title={`Show ${label}`} aria-label={`Show ${label}`}>
      <span aria-hidden className="pane-rail-icon">
        {side === 'right' ? '‹' : '›'}
      </span>
      <span className="pane-rail-label">{label}</span>
    </button>
  );
}

/**
 * The divider between two columns. `which` says which divider: between the sections and the editor
 * ('left') or between the editor and the preview ('right').
 */
export function PaneDivider({
  which,
  container,
  layout,
  update,
  toggle,
}: {
  which: 'left' | 'right';
  container: RefObject<HTMLElement | null>;
  layout: PaneLayout;
  update: (next: (current: PaneLayout) => PaneLayout) => void;
  toggle: (id: PaneId) => void;
}) {
  const dragging = useRef(false);

  /** New layout for the divider placed at `x` (px from the container's left edge). */
  const placeAt = (current: PaneLayout, x: number, total: number): PaneLayout => {
    const { collapsed } = current;
    const leftNow = collapsed.left ? RAIL : current.leftWidth;
    if (which === 'left') {
      // Widening the sections squeezes the preview (it shrinks to fit), never below its minimum; the editor keeps its minimum too.
      const left = x - DIVIDER / 2;
      if (left < COLLAPSE_BELOW.left) return { ...current, collapsed: { ...collapsed, left: true } };
      const others = (collapsed.center ? RAIL : MIN.center) + (collapsed.right ? RAIL : MIN.right) + 2 * DIVIDER;
      const leftWidth = Math.max(MIN.left, Math.min(MAX_LEFT, left, total - others));
      return { ...current, leftWidth, collapsed: { ...collapsed, left: false } };
    }
    const right = total - x - DIVIDER / 2;
    const centerSpace = total - leftNow - right - 2 * DIVIDER;
    if (right < COLLAPSE_BELOW.right) return { ...current, collapsed: { ...collapsed, right: true } };
    if (centerSpace < COLLAPSE_BELOW.center) return { ...current, collapsed: { ...collapsed, right: false, center: true } };
    const rightWidth = Math.max(MIN.right, Math.min(right, total - leftNow - MIN.center - 2 * DIVIDER));
    return { ...current, rightWidth, collapsed: { ...collapsed, right: false, center: false } };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.classList.add('resizing-panes'); // the preview iframe must not swallow the pointer
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = container.current?.getBoundingClientRect();
    if (!dragging.current || !box) return;
    update((current) => placeAt(current, e.clientX - box.left, box.width));
  };
  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove('resizing-panes');
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      return toggle(which);
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' ? -24 : 24;
    update((current) => {
      const leftNow = current.collapsed.left ? RAIL : current.leftWidth;
      const rightNow = current.collapsed.right ? RAIL : current.rightWidth;
      const x = which === 'left' ? leftNow + DIVIDER / 2 : box.width - rightNow - DIVIDER / 2;
      return placeAt(current, x + step, box.width);
    });
  };

  const side = which === 'left' ? 'sections' : 'preview';
  return (
    <div
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${side} panel`}
      tabIndex={0}
      title={`Drag to resize · drag to the edge or double-click to ${layout.collapsed[which] ? 'open' : 'collapse'} the ${side}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => toggle(which)}
      onKeyDown={onKeyDown}
    >
      <span className="pane-divider-grip" aria-hidden />
    </div>
  );
}
