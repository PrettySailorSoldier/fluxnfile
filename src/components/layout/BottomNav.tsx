import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Plus, BarChart2, Settings, ClipboardList } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/inventory', icon: Package, label: 'Items' },
  { path: '/add', icon: Plus, label: 'Add', isCenter: true },
  { path: '/order-sheet', icon: ClipboardList, label: 'Orders', showBadge: true },
  { path: '/sales-check', icon: BarChart2, label: 'Sales' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function BottomNav() {
  const location = useLocation();
  const { team } = useAuth();

  const { data: unconfirmedCount = 0 } = useQuery({
    queryKey: ['unconfirmed-count', team?.id],
    queryFn: async () => {
      if (!team?.id) return 0;
      const { count } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('physical_status' as any, 'unconfirmed');
      return count ?? 0;
    },
    enabled: !!team?.id,
    refetchInterval: 30_000,
  });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-nav border-t border-border pb-safe"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center -mt-6"
              >
                <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg">
                  <Icon className="w-7 h-7 text-primary-foreground" />
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors',
                isActive ? 'text-nav-active' : 'text-nav-foreground'
              )}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.showBadge && unconfirmedCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {unconfirmedCount > 99 ? '99+' : unconfirmedCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
