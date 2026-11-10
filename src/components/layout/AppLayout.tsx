import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useTeamRealtime } from '@/hooks/useTeam';
import { usePendingSaleCount, useSaleQueueSync } from '@/hooks/useMarket';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { backgroundImageUrl } = useTheme();
  const navigate = useNavigate();
  // Teammates' imports, scans and task changes appear without a refresh
  useTeamRealtime();
  // Sales made with no signal go out as soon as there is one
  useSaleQueueSync();
  const pending = usePendingSaleCount();

  return (
    <div className="min-h-screen pb-20 relative">
      {/* Background overlay - only show when custom background is set for readability */}
      {backgroundImageUrl && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-[2px] -z-10" />
      )}

      {/* Header with notification bell */}
      <header
        className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <Link to="/" className="font-semibold text-foreground hover:text-primary transition-colors">
            Flux&File
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => navigate('/settings')}
              className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {pending > 0 && (
        <div className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs text-center py-1.5 px-4">
          {pending} sale{pending === 1 ? '' : 's'} saved on this phone, waiting for a connection
        </div>
      )}

      <main className="max-w-lg mx-auto relative z-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
