import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Plus,
  ClipboardList,
  ListChecks,
  Menu,
  BarChart2,
  TrendingUp,
  StickyNote,
  Facebook,
  ScanLine,
  Settings,
  PencilLine,
  FileSpreadsheet,
  ChevronRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyOpenTaskCount } from '@/hooks/useTeam';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface NavEntry {
  path: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

/** Everything that isn't a bottom tab lives here — every screen is reachable in two taps. */
const MORE_ENTRIES: NavEntry[] = [
  { path: '/sales-check', label: 'Sales Check', description: 'Price checks, flags for you, what’s selling', icon: BarChart2 },
  { path: '/analytics', label: 'Analytics', description: 'Profit, sell-through and trends', icon: TrendingUp },
  { path: '/rough-notes', label: 'Rough Notes', description: 'Quick notes on boxes and lots to process later', icon: StickyNote },
  { path: '/facebook-tools', label: 'Facebook Tools', description: 'Marketplace listings, offers, meetups', icon: Facebook },
  { path: '/scan', label: 'Scan Session', description: 'Scan items in a row — receive, add or find', icon: ScanLine },
  { path: '/settings', label: 'Settings', description: 'Team, categories, locations, workflow', icon: Settings },
];

const QUICK_ADD: (NavEntry & { to: string })[] = [
  { path: '/scan', to: '/scan', label: 'Scan items', description: 'Barcode → autofilled item, one after another', icon: ScanLine },
  { path: '/add', to: '/add', label: 'Add one item', description: 'Fill in the form (barcode lookup optional)', icon: PencilLine },
  { path: '/inventory', to: '/inventory?import=list', label: 'Import a list', description: 'CSV, Excel or rows pasted from a sheet', icon: FileSpreadsheet },
  { path: '/rough-notes', to: '/rough-notes?new=1', label: 'Rough note', description: 'Jot it down now, process it later', icon: StickyNote },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { team } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { data: myTaskCount = 0 } = useMyOpenTaskCount();

  const { data: unconfirmedCount = 0 } = useQuery({
    queryKey: ['unconfirmed-count', team?.id],
    queryFn: async () => {
      if (!team?.id) return 0;
      const { count } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('physical_status', 'unconfirmed');
      return count ?? 0;
    },
    enabled: !!team?.id,
    refetchInterval: 30_000,
  });

  const isMoreActive = MORE_ENTRIES.some((e) => location.pathname === e.path);

  const badge = (count: number) =>
    count > 0 ? (
      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
        {count > 99 ? '99+' : count}
      </span>
    ) : null;

  const navLink = (path: string, Icon: React.ElementType, label: string, count = 0) => {
    const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`));
    return (
      <Link
        to={path}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-1 px-1 py-2 transition-colors flex-1 min-w-0',
          isActive ? 'text-nav-active' : 'text-nav-foreground'
        )}
      >
        <div className="relative">
          <Icon className="w-5 h-5" />
          {badge(count)}
        </div>
        <span className="text-[11px] font-medium truncate">{label}</span>
      </Link>
    );
  };

  const go = (to: string) => {
    setMoreOpen(false);
    setAddOpen(false);
    navigate(to);
  };

  const entryRow = (entry: NavEntry, to: string, extra?: React.ReactNode) => {
    const Icon = entry.icon;
    const active = location.pathname === entry.path;
    return (
      <button
        key={entry.label}
        type="button"
        onClick={() => go(to)}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
          active ? 'bg-primary/10' : 'hover:bg-muted'
        )}
      >
        <span className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-foreground" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-foreground">{entry.label}</span>
          <span className="block text-xs text-muted-foreground truncate">{entry.description}</span>
        </span>
        {extra}
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
    );
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-nav border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Main"
      >
        <div className="flex items-center w-full max-w-lg mx-auto h-16">
          {navLink('/', LayoutDashboard, 'Home')}
          {navLink('/inventory', Package, 'Items')}

          {/* Center + opens quick add */}
          <div className="flex items-center justify-center flex-1 -mt-6">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Add items"
              className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg"
            >
              <Plus className="w-7 h-7 text-primary-foreground" />
            </button>
          </div>

          {navLink('/order-sheet', ClipboardList, 'Orders', unconfirmedCount)}
          {navLink('/tasks', ListChecks, 'Tasks', myTaskCount)}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-col items-center justify-center gap-1 px-1 py-2 transition-colors flex-1 min-w-0',
              isMoreActive || moreOpen ? 'text-nav-active' : 'text-nav-foreground'
            )}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[11px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),16px)]">
          <SheetHeader className="text-left pb-2">
            <SheetTitle>Add items</SheetTitle>
          </SheetHeader>
          <div className="space-y-1">{QUICK_ADD.map((e) => entryRow(e, e.to))}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
          <SheetHeader className="text-left pb-2">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="space-y-1">{MORE_ENTRIES.map((e) => entryRow(e, e.path))}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
