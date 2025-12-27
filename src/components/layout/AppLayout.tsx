import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';

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
      <main className="max-w-lg mx-auto relative z-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
