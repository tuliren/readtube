/**
 * Shared primitive for every row in the /inbox sidebar. Centralizes the
 * styling contract so Views, channels, folder headers, and the Add-channel
 * button all look identical — same padding, same icon slot, same active
 * and hover states.
 *
 * Usage
 *
 *   // As a Link
 *   <Link href={href} className={sidebarRowClass(active)}>
 *     <SidebarRowContent icon={Star} label="Starred" trailing={<Badge>12</Badge>} />
 *   </Link>
 *
 *   // As a button (e.g. folder toggle header)
 *   <button className={sidebarRowClass(false)} onClick={onToggle}>
 *     <ChevronDown className="h-3.5 w-3.5" />
 *     <SidebarRowContent icon={FolderIcon} label={folder.name} trailing={...} />
 *   </button>
 *
 * The function returns a plain className string rather than rendering a
 * wrapper element because the consumer varies — Link, button, li + Link,
 * etc. — and forcing one wrapper would push stopPropagation hacks on the
 * drag-and-drop callers.
 */
import type { LucideIcon } from 'lucide-react';

const BASE_ROW_CLASS = 'flex min-w-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm';
const ACTIVE_ROW_CLASS =
  'bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300';
const INACTIVE_ROW_CLASS = 'text-foreground hover:bg-accent';

export function sidebarRowClass(active: boolean): string {
  return `${BASE_ROW_CLASS} ${active ? ACTIVE_ROW_CLASS : INACTIVE_ROW_CLASS}`;
}

/**
 * Standard unread-count badge. Blue by default. Every row that shows a
 * count uses this so folder headers, channels, and the Inbox row all
 * share one badge style — no more gray-200 folder badges vs blue-600
 * channel badges.
 */
export function SidebarBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-medium text-white">
      {count}
    </span>
  );
}

interface ContentProps {
  /** Optional leading icon. Channel rows omit this — the visual list is
   *  cleaner without per-row icons fighting the folder/category labels
   *  for attention. View rows and folder headers still pass one. */
  icon?: LucideIcon;
  label: string;
  /** Optional trailing slot — usually a SidebarBadge, but callers can pass
   *  custom nodes (e.g. a priority dot). Rendered on the right edge and
   *  auto-pushed via `ml-auto` so the label gets the remaining space. */
  trailing?: React.ReactNode;
}

/**
 * Standard row body: optional icon on the left at `h-4 w-4`, label that
 * truncates, and an optional trailing slot. Callers wrap this in whatever
 * interactive element (Link / button / li) they need.
 */
export function SidebarRowContent({ icon: Icon, label, trailing }: ContentProps) {
  return (
    <>
      {Icon != null && <Icon className="h-4 w-4 shrink-0" />}
      <span className="truncate">{label}</span>
      {trailing}
    </>
  );
}
