import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LogOut, Users, Copy, MessageSquare, UserMinus, ShoppingBag, FileSpreadsheet, Megaphone, ChevronRight, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { TemplateLibrary } from '@/components/fb/TemplateLibrary';
import { CategoryManager } from '@/components/settings/CategoryManager';
import { StorageLocationManager } from '@/components/settings/StorageLocationManager';
import { MeetupLocationManager } from '@/components/settings/MeetupLocationManager';
import { ThemeCustomizer } from '@/components/settings/ThemeCustomizer';
import { ProfileEditor } from '@/components/settings/ProfileEditor';
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
  const [showTemplates, setShowTemplates] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const navigate = useNavigate();

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

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">Settings</h1>
      
      {/* Profile */}
      <ProfileEditor />

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

      {/* Categories */}
      <CategoryManager />

      {/* Storage Locations */}
      <StorageLocationManager />

      {/* Meetup Locations */}
      <MeetupLocationManager />

      {/* Tasks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListTodo className="w-4 h-4" />
            Tasks
          </CardTitle>
          <CardDescription>
            Manage and assign tasks to yourself or team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            className="w-full justify-between" 
            onClick={() => navigate('/tasks')}
          >
            View Tasks
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Theme */}
      <ThemeCustomizer />

      {/* Facebook Tools */}
      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-white dark:from-blue-950/30 dark:to-background">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
              alt="Facebook"
              className="w-4 h-4"
            />
            Facebook Tools
          </CardTitle>
          <CardDescription>
            Marketplace exports, custom audiences, and ad creation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-background rounded-lg border">
              <FileSpreadsheet className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <p className="text-xs text-muted-foreground">CSV Export</p>
            </div>
            <div className="p-2 bg-background rounded-lg border">
              <Users className="w-5 h-5 mx-auto mb-1 text-purple-500" />
              <p className="text-xs text-muted-foreground">Audiences</p>
            </div>
            <div className="p-2 bg-background rounded-lg border">
              <Megaphone className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <p className="text-xs text-muted-foreground">Ad Creator</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-between" 
            onClick={() => navigate('/facebook-tools')}
          >
            Open Facebook Tools
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

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
