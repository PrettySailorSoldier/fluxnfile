import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen pb-20 relative">
      {/* Background overlay for better readability when custom bg is set */}
      <div className="fixed inset-0 bg-background/80 backdrop-blur-[2px] -z-10" />
      <main className="max-w-lg mx-auto relative z-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
