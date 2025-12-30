import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { backgroundImageUrl } = useTheme();

  return (
    <div className="min-h-screen pb-20 relative">
      {/* Background overlay - only show when custom background is set for readability */}
      {backgroundImageUrl && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-[2px] -z-10" />
      )}
      
      {/* Header with notification bell */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <Link to="/" className="font-semibold text-foreground hover:text-primary transition-colors">
            Flux&File
          </Link>
          <NotificationBell />
        </div>
      </header>
      
      <main className="max-w-lg mx-auto relative z-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
