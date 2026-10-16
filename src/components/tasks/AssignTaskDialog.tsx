import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { taskTypeLabels, type TaskType } from '@/hooks/useTasks';
import { notifyTeammates, notifyUsers, useTeamMembers } from '@/hooks/useTeam';

const ANYONE = '__anyone__';

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One task is created per item */
  itemIds: string[];
  /** Pre-select a task type, e.g. 'needs_photos' from the Needs Details queue */
  defaultType?: TaskType;
  onDone?: () => void;
}

/**
 * Hand items to a teammate: creates one task per selected item and sends the
 * assignee a single notification (not one per item).
 */
export function AssignTaskDialog({ open, onOpenChange, itemIds, defaultType, onDone }: AssignTaskDialogProps) {
  const { team, user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: members = [] } = useTeamMembers();

  const [taskType, setTaskType] = useState<TaskType | ''>(defaultType ?? '');
  const [assignee, setAssignee] = useState(ANYONE);
  const [notes, setNotes] = useState('');
  const [deadline, setDeadline] = useState('');

  const teammates = members.filter((m) => m.id !== user?.id);

  useEffect(() => {
    if (!open) return;
    setTaskType(defaultType ?? '');
    // With exactly one teammate, assigning to them is the common case
    setAssignee(teammates.length === 1 ? teammates[0].id : ANYONE);
    setNotes('');
    setDeadline('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultType, members.length]);

  const count = itemIds.length;

  const create = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id || !taskType) throw new Error('Pick a task type');
      const assignedTo = assignee === ANYONE ? null : assignee;
      const { error } = await supabase.from('tasks').insert(
        itemIds.map((item_id) => ({
          team_id: team.id,
          item_id,
          task_type: taskType,
          assigned_to: assignedTo,
          created_by: user.id,
          status: 'pending' as const,
          notes: notes.trim() || null,
          deadline: deadline ? new Date(`${deadline}T17:00:00`).toISOString() : null,
        }))
      );
      if (error) throw error;

      const label = taskTypeLabels[taskType].label;
      const who = profile?.full_name || 'Your teammate';
      const summary = count === 1 ? label : `${label} · ${count} items`;
      const link = count === 1 ? `/item/${itemIds[0]}` : '/tasks';
      if (assignedTo && assignedTo !== user.id) {
        await notifyUsers(team.id, [assignedTo], {
          type: 'task_assigned',
          title: '📋 New task for you',
          message: `${who} assigned you: ${summary}`,
          link,
        });
      } else if (!assignedTo) {
        await notifyTeammates(team.id, user.id, {
          type: 'task_assigned',
          title: '📋 New team task',
          message: `${who} added: ${summary} — anyone can take it`,
          link,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast.success(count === 1 ? 'Task created' : `${count} tasks created`);
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Assign task{count > 1 ? `s for ${count} items` : ''}</DialogTitle>
          <DialogDescription>
            {count > 1 ? 'One task per item. ' : ''}The person you pick gets a notification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What needs doing?</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(taskTypeLabels) as TaskType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTaskType(t)}
                  className={`rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                    taskType === t ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'
                  }`}
                >
                  {taskTypeLabels[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Who</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANYONE}>Anyone</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id === user?.id ? 'Me' : m.full_name || 'Teammate'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due (optional)</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 300))}
              placeholder="e.g. photos on the white backdrop"
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!taskType || create.isPending || count === 0}>
            {create.isPending ? 'Assigning…' : count > 1 ? `Assign ${count}` : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
