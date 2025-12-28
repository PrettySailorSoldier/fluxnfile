import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle, Trash2, Calendar, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const TASK_LABELS: Record<string, string> = {
  needs_photos: '📸 Needs Photos',
  needs_cleaning: '🧹 Needs Cleaning',
  needs_pricing: '💰 Needs Pricing',
  ready_to_list: '✍️ Ready to List',
  needs_packaging: '📦 Needs Packaging',
  ready_to_ship: '🚚 Ready to Ship',
  meetup_scheduled: '🤝 Meetup Scheduled',
  needs_discussion: '💬 Needs Discussion',
};

interface Task {
  id: string;
  task_type: keyof typeof TASK_LABELS;
  status: 'pending' | 'in_progress' | 'completed';
  notes: string | null;
  created_at: string;
  assigned_to: string | null;
  created_by: string | null;
  item_id: string | null;
  deadline: string | null;
  item?: {
    id: string;
    title: string;
  };
  assigned_user?: {
    id: string;
    full_name: string;
  };
  created_user?: {
    id: string;
    full_name: string;
  };
}

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);

  const isAssignedToMe = task.assigned_to === user?.id || !task.assigned_to;

  const completeTask = useMutation({
    mutationFn: async () => {
      setIsCompleting(true);
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
        })
        .eq('id', task.id);

      if (error) throw error;

      // Notify task creator if different from completer
      if (task.created_by && task.created_by !== user?.id) {
        await (supabase as any).from('notifications').insert({
          user_id: task.created_by,
          type: 'task_completed',
          title: 'Task Completed',
          message: `${user?.user_metadata?.full_name || 'Your partner'} completed: ${TASK_LABELS[task.task_type]}`,
          link: task.item_id ? `/item/${task.item_id}` : '/tasks',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task marked as complete!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsCompleting(false);
    },
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <Card className={task.status === 'completed' ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base font-medium">
                {TASK_LABELS[task.task_type]}
              </span>
              <Badge variant={task.status === 'completed' ? 'secondary' : 'default'}>
                {task.status}
              </Badge>
            </div>

            {task.item && (
              <p className="text-sm text-muted-foreground mb-1">
                Item: {task.item.title}
              </p>
            )}

            {task.notes && (
              <p className="text-sm text-muted-foreground mb-2">{task.notes}</p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {task.assigned_user && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>{task.assigned_user.full_name}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {task.status !== 'completed' && isAssignedToMe && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => completeTask.mutate()}
                disabled={isCompleting}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Complete
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteTask.mutate()}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
