import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';
import { TaskCard } from '@/components/tasks/TaskCard';
import { Plus } from 'lucide-react';

export default function Tasks() {
  const { team, user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', team?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          item:items(id, title),
          assigned_user:profiles!tasks_assigned_to_fkey(id, full_name),
          created_user:profiles!tasks_created_by_fkey(id, full_name)
        `)
        .eq('team_id', team?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!team?.id,
  });

  // In progress first, then by due date (no date last), then newest
  const byUrgency = (a: NonNullable<typeof tasks>[number], b: NonNullable<typeof tasks>[number]) => {
    const rank = (s: string) => (s === 'in_progress' ? 0 : 1);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };
  const myTasks = tasks
    ?.filter((t) => (t.assigned_to === user?.id || !t.assigned_to) && t.status !== 'completed')
    .sort(byUrgency);
  const teamTasks = tasks?.filter((t) => t.status !== 'completed').sort(byUrgency);
  const completedTasks = tasks?.filter((t) => t.status === 'completed');

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      <Tabs defaultValue="my" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="my">
            My Tasks ({myTasks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="team">
            All open ({teamTasks?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="done">
            Done ({completedTasks?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="space-y-3 mt-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : myTasks && myTasks.length > 0 ? (
            myTasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Nothing on your plate. Tasks assigned to you or to anyone show up here.
            </p>
          )}
        </TabsContent>

        <TabsContent value="team" className="space-y-3 mt-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : teamTasks && teamTasks.length > 0 ? (
            teamTasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No active tasks
            </p>
          )}
        </TabsContent>

        <TabsContent value="done" className="space-y-3 mt-4">
          {completedTasks && completedTasks.length > 0 ? (
            completedTasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No completed tasks
            </p>
          )}
        </TabsContent>
      </Tabs>

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
