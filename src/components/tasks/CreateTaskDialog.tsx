import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const TASK_TYPES = [
  { value: 'needs_photos', label: '📸 Needs Photos' },
  { value: 'needs_cleaning', label: '🧹 Needs Cleaning' },
  { value: 'needs_pricing', label: '💰 Needs Pricing' },
  { value: 'ready_to_list', label: '✍️ Ready to List' },
  { value: 'needs_packaging', label: '📦 Needs Packaging' },
  { value: 'ready_to_ship', label: '🚚 Ready to Ship' },
  { value: 'meetup_scheduled', label: '🤝 Meetup Scheduled' },
  { value: 'needs_discussion', label: '💬 Needs Discussion' },
];

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId?: string;
  onSuccess?: () => void;
}

export function CreateTaskDialog({ open, onOpenChange, itemId, onSuccess }: CreateTaskDialogProps) {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();
  
  const [taskType, setTaskType] = useState('');
  const [assignedTo, setAssignedTo] = useState('unassigned');
  const [notes, setNotes] = useState('');

  // Fetch team members
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team?.id);
      return data || [];
    },
    enabled: !!team?.id,
  });

  const createTask = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');
      if (!taskType) throw new Error('Please select a task type');

      const { error } = await supabase.from('tasks').insert({
        team_id: team.id,
        item_id: itemId || null,
        task_type: taskType as 'needs_photos' | 'needs_cleaning' | 'needs_pricing' | 'ready_to_list' | 'needs_packaging' | 'ready_to_ship' | 'meetup_scheduled' | 'needs_discussion',
        assigned_to: assignedTo === 'unassigned' ? null : assignedTo,
        created_by: user.id,
        notes: notes.trim() || null,
        status: 'pending' as const,
      });

      if (error) throw error;

      const taskLabel = TASK_TYPES.find(t => t.value === taskType)?.label || taskType;
      
      // Create notification(s) for the task
      if (assignedTo && assignedTo !== 'unassigned') {
        // Task is assigned to a specific person - notify them
        await (supabase as any).from('notifications').insert({
          user_id: assignedTo,
          team_id: team.id,
          type: 'task_assigned',
          title: assignedTo === user.id ? '📋 Task Created' : '📋 New Task Assigned',
          message: assignedTo === user.id 
            ? `You created a task for yourself: ${taskLabel}`
            : `You have a new task: ${taskLabel}`,
          link: itemId ? `/item/${itemId}` : '/tasks',
        });
      } else {
        // Task is unassigned - notify all team members
        const teamMembersToNotify = teamMembers?.filter(m => m.id !== user.id) || [];
        if (teamMembersToNotify.length > 0) {
          const notifications = teamMembersToNotify.map(member => ({
            user_id: member.id,
            team_id: team.id,
            type: 'task_assigned',
            title: '📋 New Team Task',
            message: `A new task is available: ${taskLabel}`,
            link: itemId ? `/item/${itemId}` : '/tasks',
          }));
          await (supabase as any).from('notifications').insert(notifications);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      toast.success('Task created successfully!');
      setTaskType('');
      setAssignedTo('unassigned');
      setNotes('');
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            Assign a task to yourself or your partner
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="task-type">Task Type *</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger id="task-type">
                <SelectValue placeholder="Select task type" />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned-to">Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger id="assigned-to">
                <SelectValue placeholder="Either (first available)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Either (first available)</SelectItem>
                {teamMembers?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name || 'Team Member'} {member.id === user?.id ? '(You)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => createTask.mutate()} disabled={createTask.isPending || !taskType}>
            {createTask.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
