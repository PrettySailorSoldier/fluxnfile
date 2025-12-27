import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type TaskType = 
  | 'needs_photos'
  | 'needs_cleaning'
  | 'needs_pricing'
  | 'ready_to_list'
  | 'needs_packaging'
  | 'ready_to_ship'
  | 'meetup_scheduled'
  | 'needs_discussion';

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  item_id: string | null;
  team_id: string;
  task_type: TaskType;
  assigned_to: string | null;
  created_by: string | null;
  status: TaskStatus;
  notes: string | null;
  deadline: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
  item?: {
    id: string;
    title: string | null;
    photos: string[];
  } | null;
  assignee?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const taskTypeLabels: Record<TaskType, { label: string; icon: string }> = {
  needs_photos: { label: 'Needs Photos', icon: 'Camera' },
  needs_cleaning: { label: 'Needs Cleaning', icon: 'Sparkles' },
  needs_pricing: { label: 'Needs Pricing', icon: 'DollarSign' },
  ready_to_list: { label: 'Ready to List', icon: 'Upload' },
  needs_packaging: { label: 'Needs Packaging', icon: 'Package' },
  ready_to_ship: { label: 'Ready to Ship', icon: 'Truck' },
  meetup_scheduled: { label: 'Meetup Scheduled', icon: 'MapPin' },
  needs_discussion: { label: 'Needs Discussion', icon: 'MessageSquare' },
};

export function useTasks() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['tasks', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          item:items(id, title, photos),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .eq('team_id', team.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Task[];
    },
    enabled: !!team?.id,
  });
}

export function useMyTasks() {
  const { team, user } = useAuth();

  return useQuery({
    queryKey: ['my-tasks', team?.id, user?.id],
    queryFn: async () => {
      if (!team?.id || !user?.id) return [];

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          item:items(id, title, photos),
          assignee:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .eq('team_id', team.id)
        .eq('assigned_to', user.id)
        .neq('status', 'completed')
        .order('deadline', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as Task[];
    },
    enabled: !!team?.id && !!user?.id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { team, user } = useAuth();

  return useMutation({
    mutationFn: async (task: {
      item_id?: string;
      task_type: TaskType;
      assigned_to?: string;
      notes?: string;
      deadline?: string;
    }) => {
      if (!team?.id) throw new Error('No team');

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...task,
          team_id: team.id,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const updateData: Record<string, unknown> = { ...updates };
      
      if (updates.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = user?.id;
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}
