import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Users, User, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { profile, team, signOut } = useAuth();

  const copyTeamId = () => {
    if (team?.id) {
      navigator.clipboard.writeText(team.id);
      toast.success('Team ID copied!');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground pt-2">Settings</h1>
      
      {/* Profile */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="w-4 h-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{profile?.full_name || 'No name set'}</p>
        </CardContent>
      </Card>

      {/* Team */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Team
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{team?.name}</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
              {team?.id}
            </code>
            <Button size="sm" variant="outline" onClick={copyTeamId}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this ID to invite team members
          </p>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Button 
        variant="destructive" 
        className="w-full" 
        onClick={signOut}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}
