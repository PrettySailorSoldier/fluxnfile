import { useState } from 'react';
import { useCreateTask, taskTypeLabels, TaskType } from '@/hooks/useTasks';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface CreateTaskDialogProps {
  itemId?: string;
  trigger?: React.ReactNode;
}

export function CreateTaskDialog({ itemId, trigger }: CreateTaskDialogProps) {
  const { team } = useAuth();
  const createTask = useCreateTask();
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>('needs_photos');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [deadline, setDeadline] = useState('');

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team.id);
      if (error) throw error;
      return data;
    },
    enabled: !!team?.id,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createTask.mutateAsync({
        item_id: itemId,
        task_type: taskType,
        assigned_to: assignedTo || undefined,
        notes: notes || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      });
      toast.success('Task created');
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Failed to create task');
    }
  };

  const resetForm = () => {
    setTaskType('needs_photos');
    setAssignedTo('');
    setNotes('');
    setDeadline('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Task Type</Label>
            <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(taskTypeLabels).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Anyone (unassigned)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Anyone</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name || 'Team Member'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Deadline (optional)</Label>
            <Input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional details..."
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={createTask.isPending}>
            Create Task
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
