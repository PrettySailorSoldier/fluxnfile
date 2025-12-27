import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Users, Plus, UserPlus, LogOut, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export function TeamManager() {
  const { team, createTeam, joinTeam, leaveTeam } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    setIsSubmitting(true);
    const { error } = await createTeam(teamName.trim());

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Team created successfully!');
      setCreateDialogOpen(false);
      setTeamName('');
    }

    setIsSubmitting(false);
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamCode.trim()) {
      toast.error('Please enter a team ID');
      return;
    }

    setIsSubmitting(true);
    const { error } = await joinTeam(teamCode.trim());

    if (error) {
      toast.error('Invalid team ID or team not found');
    } else {
      toast.success('Joined team successfully!');
      setJoinDialogOpen(false);
      setTeamCode('');
    }

    setIsSubmitting(false);
  };

  const handleLeaveTeam = async () => {
    setIsSubmitting(true);
    const { error } = await leaveTeam();

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('You have left the team');
    }

    setIsSubmitting(false);
  };

  const copyTeamId = () => {
    if (team?.id) {
      navigator.clipboard.writeText(team.id);
      setCopied(true);
      toast.success('Team ID copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4" />
          Team Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {team ? (
          <>
            {/* Current Team Info */}
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Team</span>
                <span className="font-medium">{team.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Team ID</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={copyTeamId}
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy ID
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Leave Team */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full text-destructive hover:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave Team
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Leave Team?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to leave "{team.name}"? You will lose access to all team inventory and tasks. You can rejoin later with the team ID.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeaveTeam}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isSubmitting ? 'Leaving...' : 'Leave Team'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            {/* No Team - Create or Join */}
            <p className="text-sm text-muted-foreground text-center py-2">
              You're not part of a team yet
            </p>
            <div className="flex gap-2">
              {/* Create Team Dialog */}
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Create
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create a Team</DialogTitle>
                    <DialogDescription>
                      Create a new team to start tracking inventory
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateTeam} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-team-name">Team Name</Label>
                      <Input
                        id="new-team-name"
                        type="text"
                        placeholder="My Resale Business"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        required
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Team'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Join Team Dialog */}
              <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Join
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Join a Team</DialogTitle>
                    <DialogDescription>
                      Enter a team ID to join an existing team
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleJoinTeam} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="join-team-id">Team ID</Label>
                      <Input
                        id="join-team-id"
                        type="text"
                        placeholder="Enter team ID"
                        value={teamCode}
                        onChange={(e) => setTeamCode(e.target.value)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Ask your team admin for the team ID
                      </p>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Joining...' : 'Join Team'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
