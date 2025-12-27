import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
<<<<<<< HEAD
import { LogOut, MessageSquare } from 'lucide-react';
=======
import { LogOut, Users, Copy, MessageSquare, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
>>>>>>> c2eb81959cf42c59472a9c09f1df34ae13472867
import { TemplateLibrary } from '@/components/fb/TemplateLibrary';
import { CategoryManager } from '@/components/settings/CategoryManager';
import { StorageLocationManager } from '@/components/settings/StorageLocationManager';
import { MeetupLocationManager } from '@/components/settings/MeetupLocationManager';
import { ThemeCustomizer } from '@/components/settings/ThemeCustomizer';
import { ProfileEditor } from '@/components/settings/ProfileEditor';
<<<<<<< HEAD
import { TeamManager } from '@/components/settings/TeamManager';

export default function Settings() {
  const { signOut } = useAuth();
=======
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function Settings() {
  const { team, leaveTeam, signOut } = useAuth();
>>>>>>> c2eb81959cf42c59472a9c09f1df34ae13472867
  const [showTemplates, setShowTemplates] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const navigate = useNavigate();

<<<<<<< HEAD
=======
  const copyTeamId = () => {
    if (team?.id) {
      navigator.clipboard.writeText(team.id);
      toast.success('Team ID copied!');
    }
  };

  const handleLeaveTeam = async () => {
    setIsLeaving(true);
    const { error } = await leaveTeam();
    setIsLeaving(false);
    
    if (error) {
      toast.error('Failed to leave team');
      return;
    }
    
    toast.success('You have left the team');
    navigate('/team-setup');
  };

>>>>>>> c2eb81959cf42c59472a9c09f1df34ae13472867
  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">Settings</h1>

      {/* Profile */}
      <ProfileEditor />

<<<<<<< HEAD
      {/* Team Management */}
      <TeamManager />
=======
      {/* Team */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" />
            Team
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive">
                <UserMinus className="w-4 h-4 mr-2" />
                Leave Team
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave team?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will lose access to all team data. You can rejoin later with the team ID.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleLeaveTeam}
                  disabled={isLeaving}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isLeaving ? 'Leaving...' : 'Leave Team'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
>>>>>>> c2eb81959cf42c59472a9c09f1df34ae13472867

      {/* Categories */}
      <CategoryManager />

      {/* Storage Locations */}
      <StorageLocationManager />

      {/* Meetup Locations */}
      <MeetupLocationManager />

      {/* Theme */}
      <ThemeCustomizer />

      {/* Message Templates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Message Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Quick responses for buyer messages on Facebook Marketplace
          </p>
          <Button variant="outline" onClick={() => setShowTemplates(true)} className="w-full">
            Manage Templates
          </Button>
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

      {/* Template Library Dialog */}
      <TemplateLibrary
        open={showTemplates}
        onOpenChange={setShowTemplates}
      />
    </div>
  );
}
