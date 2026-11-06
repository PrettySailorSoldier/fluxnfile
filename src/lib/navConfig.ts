import {
  LayoutDashboard,
  Package,
  ClipboardList,
  ListChecks,
  BarChart2,
  TrendingUp,
  StickyNote,
  Facebook,
  ScanLine,
  Settings,
  Store,
} from 'lucide-react';

export interface NavDestination {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

/** Every screen that can sit in the bottom bar or the More sheet. Order here = order in More. */
export const NAV_DESTINATIONS: NavDestination[] = [
  { id: 'home', path: '/', label: 'Home', description: 'Dashboard', icon: LayoutDashboard },
  { id: 'inventory', path: '/inventory', label: 'Items', description: 'Your inventory', icon: Package },
  { id: 'orders', path: '/order-sheet', label: 'Orders', description: 'Unconfirmed orders to receive', icon: ClipboardList },
  { id: 'tasks', path: '/tasks', label: 'Tasks', description: 'Your open tasks', icon: ListChecks },
  { id: 'market', path: '/market', label: 'Markets', description: 'Plan, sell and review flea market days', icon: Store },
  { id: 'sales-check', path: '/sales-check', label: 'Sales Check', description: 'Price checks, flags for you, what’s selling', icon: BarChart2 },
  { id: 'analytics', path: '/analytics', label: 'Analytics', description: 'Profit, sell-through and trends', icon: TrendingUp },
  { id: 'rough-notes', path: '/rough-notes', label: 'Rough Notes', description: 'Quick notes on boxes and lots to process later', icon: StickyNote },
  { id: 'facebook', path: '/facebook-tools', label: 'Facebook Tools', description: 'Marketplace listings, offers, meetups', icon: Facebook },
  { id: 'scan', path: '/scan', label: 'Scan Session', description: 'Scan items in a row — receive, add or find', icon: ScanLine },
  { id: 'settings', path: '/settings', label: 'Settings', description: 'Team, categories, locations, workflow', icon: Settings },
];

/** How many tabs fit beside the center + button and the More button. */
export const MAX_NAV_TABS = 4;
export const DEFAULT_NAV_TABS = ['home', 'inventory', 'orders', 'tasks'];

const BY_ID = new Map(NAV_DESTINATIONS.map((d) => [d.id, d]));

/** Saved ids → valid, de-duplicated, capped list. Falls back to the defaults when nothing usable is saved. */
export function resolveNavTabs(saved: unknown): string[] {
  if (!Array.isArray(saved)) return DEFAULT_NAV_TABS;
  const ids = [...new Set(saved.filter((x): x is string => typeof x === 'string' && BY_ID.has(x)))].slice(0, MAX_NAV_TABS);
  return ids.length > 0 ? ids : DEFAULT_NAV_TABS;
}

export function navSplit(tabIds: string[]): { tabs: NavDestination[]; more: NavDestination[] } {
  const tabs = tabIds.map((id) => BY_ID.get(id)).filter(Boolean) as NavDestination[];
  const inBar = new Set(tabIds);
  return { tabs, more: NAV_DESTINATIONS.filter((d) => !inBar.has(d.id)) };
}

const STORAGE_KEY = 'nav-tabs';

/** Local copy so the bar doesn't flash its defaults while preferences load. */
export function readCachedNavTabs(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? resolveNavTabs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function cacheNavTabs(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable — the saved preference still applies
  }
}
