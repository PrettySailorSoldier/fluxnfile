import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle, Trash2, Calendar, User, Hand, Play, ChevronRight, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { notifyUsers } from '@/hooks/useTeam';

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

const STATUS_LABEL: Record<string, string> = {
  pending: 'To do',
  in_progress: 'In progress',
  completed: 'Done',
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
  team_id?: string;
  item?: {
    id: string;
    title: string | null;
  } | null;
  assigned_user?: {
    id: string;
    full_name: string | null;
  } | null;
  created_user?: {
    id: string;
    full_name: string | null;
  } | null;
}

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const { user, team, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isUnassigned = !task.assigned_to;
  const isMine = task.assigned_to === user?.id;
  const canWork = isMine || isUnassigned;
  const isDone = task.status === 'completed';
  const isOverdue = !!task.deadline && !isDone && new Date(task.deadline) < new Date();
  const myName = profile?.full_name || 'Your teammate';
  const label = TASK_LABELS[task.task_type] ?? task.task_type;
  const link = task.item_id ? `/item/${task.item_id}` : '/tasks';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
  };

  const notifyCreator = async (title: string, message: string, type: string) => {
    if (team?.id && task.created_by && task.created_by !== user?.id) {
      await notifyUsers(team.id, [task.created_by], { type, title, message, link });
    }
  };

  const update = useMutation({
    mutationFn: async (action: 'claim' | 'start' | 'complete') => {
      const patch =
        action === 'claim'
          ? { assigned_to: user?.id ?? null }
          : action === 'start'
            ? { status: 'in_progress' as const, assigned_to: task.assigned_to ?? user?.id ?? null }
            : {
                status: 'completed' as const,
                completed_at: new Date().toISOString(),
                completed_by: user?.id ?? null,
                assigned_to: task.assigned_to ?? user?.id ?? null,
              };
      const { error } = await supabase.from('tasks').update(patch).eq('id', task.id);
      if (error) throw error;

      if (action === 'claim') {
        await notifyCreator('🙋 Task taken', `${myName} is taking: ${label}`, 'task_claimed');
      } else if (action === 'complete') {
        await notifyCreator('✅ Task completed', `${myName} completed: ${label}`, 'task_completed');
      }
      return action;
    },
    onSuccess: (action) => {
      refresh();
      toast.success(action === 'claim' ? 'It’s yours' : action === 'start' ? 'Marked in progress' : 'Task complete!');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success('Task deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assigneeText = isUnassigned ? 'Anyone' : isMine ? 'You' : task.assigned_user?.full_name || 'Teammate';
  const creatorText =
    task.created_by && task.created_by !== task.assigned_to
      ? task.created_by === user?.id
        ? 'from you'
        : `from ${task.created_user?.full_name || 'teammate'}`
      : null;

  return (
    <Card className={cn(isDone && 'opacity-60', isOverdue && 'border-destructive/60')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-base font-medium">{label}</span>
              <Badge variant={isDone ? 'secondary' : task.status === 'in_progress' ? 'default' : 'outline'}>
                {STATUS_LABEL[task.status]}
              </Badge>
              {isOverdue && <Badge variant="destructive">Overdue</Badge>}
            </div>

            {task.item && (
              <button
                type="button"
                onClick={() => navigate(`/item/${task.item?.id}`)}
                className="text-sm text-foreground hover:text-primary mb-1 flex items-center gap-0.5 max-w-full text-left"
              >
                <span className="truncate">{task.item.title || 'Untitled item'}</span>
                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              </button>
            )}

            {task.notes && <p className="text-sm text-muted-foreground mb-2">{task.notes}</p>}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className={cn('flex items-center gap-1', isUnassigned && 'text-amber-600')}>
                <User className="w-3 h-3" />
                {assigneeText}
                {creatorText && <span className="text-muted-foreground"> · {creatorText}</span>}
              </span>
              {task.deadline && (
                <span className={cn('flex items-center gap-1', isOverdue && 'text-destructive')}>
                  <Clock className="w-3 h-3" />
                  Due {format(new Date(task.deadline), 'MMM d')}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0 text-muted-foreground"
            onClick={() => deleteTask.mutate()}
            aria-label="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {!isDone && (
          <div className="flex flex-wrap gap-2 mt-3">
            {isUnassigned && (
              <Button size="sm" variant="outline" onClick={() => update.mutate('claim')} disabled={update.isPending}>
                <Hand className="w-4 h-4 mr-1" />
                Take it
              </Button>
            )}
            {canWork && task.status === 'pending' && (
              <Button size="sm" variant="outline" onClick={() => update.mutate('start')} disabled={update.isPending}>
                <Play className="w-4 h-4 mr-1" />
                Start
              </Button>
            )}
            {canWork && (
              <Button size="sm" onClick={() => update.mutate('complete')} disabled={update.isPending}>
                <CheckCircle className="w-4 h-4 mr-1" />
                Done
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
