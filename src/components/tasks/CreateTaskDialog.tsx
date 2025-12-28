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
  const [assignedTo, setAssignedTo] = useState('');
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
        assigned_to: assignedTo || null,
        created_by: user.id,
        notes: notes.trim() || null,
        status: 'pending' as const,
      });

      if (error) throw error;

      // Create notification for assigned user
      if (assignedTo && assignedTo !== user.id) {
        await (supabase as any).from('notifications').insert({
          user_id: assignedTo,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `You have a new task: ${TASK_TYPES.find(t => t.value === taskType)?.label}`,
          link: itemId ? `/item/${itemId}` : '/tasks',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      toast.success('Task created successfully!');
      setTaskType('');
      setAssignedTo('');
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
                <SelectItem value="">Either (first available)</SelectItem>
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
