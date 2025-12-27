import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Users, Plus, UserPlus, Package } from 'lucide-react';

export default function TeamSetup() {
  const navigate = useNavigate();
  const { createTeam, joinTeam, profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');

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
      navigate('/');
    }

    setIsSubmitting(false);
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamCode.trim()) {
      toast.error('Please enter a team code');
      return;
    }

    setIsSubmitting(true);
    const { error } = await joinTeam(teamCode.trim());

    if (error) {
      toast.error('Invalid team code or team not found');
    } else {
      toast.success('Joined team successfully!');
      navigate('/');
    }

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
            <Package className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">ResaleTracker</h1>
            <p className="text-sm text-muted-foreground">Team Setup</p>
          </div>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <Users className="w-5 h-5" />
              Set Up Your Team
            </CardTitle>
            <CardDescription>
              {profile?.full_name ? `Welcome, ${profile.full_name}!` : 'Welcome!'} Create a new team or join an existing one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="create" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="create" className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Team
                </TabsTrigger>
                <TabsTrigger value="join" className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Join Team
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create">
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-name">Team Name</Label>
                    <Input
                      id="team-name"
                      type="text"
                      placeholder="My Resale Business"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      This will be your team's display name
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Team'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="join">
                <form onSubmit={handleJoinTeam} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-code">Team ID</Label>
                    <Input
                      id="team-code"
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
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Joining...' : 'Join Team'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
