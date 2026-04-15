// Single source of truth for the viewport width at which the UI
// switches from the compact (no sidebar) layout to the full sidebar
// layout. Consumed by:
//   - tailwind.config.js (the `sidebar:` screen prefix)
//   - components/inbox/SidebarContext.tsx (the matchMedia check that
//     drives `useSidebar().isMobile`)
// Change this one value to move the breakpoint across every surface.
const MOBILE_BREAKPOINT = 1024;

module.exports = { MOBILE_BREAKPOINT };
