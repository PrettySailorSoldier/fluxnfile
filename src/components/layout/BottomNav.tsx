import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Plus, BarChart2, ClipboardList } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

  const navLink = (path: string, icon: React.ElementType, label: string, showBadge = false) => {
    const isActive = location.pathname === path;
    const Icon = icon;
    return (
      <Link
        to={path}
        className={cn(
          'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors flex-1',
          isActive ? 'text-nav-active' : 'text-nav-foreground'
        )}
      >
        <div className="relative">
          <Icon className="w-5 h-5" />
          {showBadge && unconfirmedCount > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
              {unconfirmedCount > 99 ? '99+' : unconfirmedCount}
            </span>
          )}
        </div>
        <span className="text-xs font-medium">{label}</span>
      </Link>
    );
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-nav border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center w-full max-w-lg mx-auto h-16">
        {navLink('/', LayoutDashboard, 'Home')}
        {navLink('/inventory', Package, 'Items')}

        {/* Center + button */}
        <div className="flex items-center justify-center flex-1 -mt-6">
          <Link to="/add" className="flex items-center justify-center">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg">
              <Plus className="w-7 h-7 text-primary-foreground" />
            </div>
          </Link>
        </div>

        {navLink('/order-sheet', ClipboardList, 'Orders', true)}
        {navLink('/sales-check', BarChart2, 'Sales')}
      </div>
    </nav>
  );
}
