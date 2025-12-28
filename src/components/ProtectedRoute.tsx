import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireTeam?: boolean;
}

export function ProtectedRoute({ children, requireTeam = true }: ProtectedRouteProps) {
  const { user, team, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Wait for profile to be loaded before making team decision
  // This prevents premature redirects while profile is still being fetched
  if (requireTeam && user && !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check both team state and profile.team_id to avoid false redirects
  if (requireTeam && !team && !profile?.team_id) {
    return <Navigate to="/team-setup" replace />;
  }

  return <>{children}</>;
}
