import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { backgroundImageUrl } = useTheme();
  const navigate = useNavigate();

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
      
      <main className="max-w-lg mx-auto relative z-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
