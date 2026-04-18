'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { MOBILE_BREAKPOINT } from '@/lib/breakpoints';

interface SidebarState {
  /** Sidebar width in pixels (only used when expanded). */
  width: number;
  /** Whether the sidebar is collapsed to icon-only mode. */
  collapsed: boolean;
  /** Whether the mobile drawer is open. */
  mobileOpen: boolean;
  /** Whether the viewport is below the mobile breakpoint (lg). */
  isMobile: boolean;
  setWidth: (w: number) => void;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
}

const SidebarCtx = createContext<SidebarState | null>(null);

const DEFAULT_WIDTH = 288; // w-72
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
/** Below this width the sidebar auto-collapses to icon-only mode. */
const COLLAPSE_THRESHOLD = 180;

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidthRaw] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile breakpoint
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    setIsMobile(mql.matches);
    function onChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
      if (!e.matches) {
        setMobileOpen(false);
      }
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const setWidth = useCallback((w: number) => {
    if (w < COLLAPSE_THRESHOLD) {
      setCollapsed(true);
    } else {
      const clamped = Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH);
      setWidthRaw(clamped);
      setCollapsed(false);
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <SidebarCtx.Provider
      value={{ width, collapsed, mobileOpen, isMobile, setWidth, toggleCollapsed, setMobileOpen }}
    >
      {children}
    </SidebarCtx.Provider>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarCtx);
  if (ctx == null) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return ctx;
}

/**
 * Override wrapper that forces `collapsed: false` for all descendants.
 * Used by the mobile drawer so it always renders the full sidebar
 * content regardless of the desktop collapse state.
 */
export function SidebarExpandedOverride({ children }: { children: React.ReactNode }) {
  const parent = useSidebar();
  const value = useMemo(() => ({ ...parent, collapsed: false }), [parent]);
  return <SidebarCtx.Provider value={value}>{children}</SidebarCtx.Provider>;
}

/**
 * Drag handle for resizing the sidebar. Renders as a thin vertical
 * strip on the right edge of the sidebar that shows a visible bar
 * on hover and during drag.
 */
export function SidebarResizeHandle() {
  const { setWidth } = useSidebar();
  const dragging = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onPointerMove(ev: PointerEvent) {
      if (dragging.current) {
        setWidth(ev.clientX);
      }
    }

    function onPointerUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="group absolute right-0 top-0 z-20 flex h-full w-1.5 cursor-col-resize items-center justify-center hover:bg-blue-200/50 active:bg-blue-300/50"
      role="separator"
      aria-label="Resize sidebar"
    >
      <div className="h-8 w-0.5 rounded-full bg-gray-300 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100" />
    </div>
  );
}
