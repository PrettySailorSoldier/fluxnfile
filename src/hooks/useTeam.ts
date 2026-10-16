import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

/** Everyone on the current team (including you). Shared cache key across the app. */
export function useTeamMembers() {
  const { team } = useAuth();
  return useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('team_id', team.id)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    enabled: !!team?.id,
    staleTime: 5 * 60 * 1000,
  });
}

export function memberName(members: TeamMember[] | undefined, id: string | null | undefined, you?: string | null): string | null {
  if (!id) return null;
  if (you && id === you) return 'You';
  return members?.find((m) => m.id === id)?.full_name || 'Teammate';
}

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  link?: string | null;
}

/**
 * Notify specific teammates. Never throws — a failed notification
 * shouldn't undo the work that triggered it.
 */
export async function notifyUsers(teamId: string, userIds: string[], n: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await supabase.from('notifications').insert(
      unique.map((user_id) => ({
        user_id,
        team_id: teamId,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link ?? null,
      }))
    );
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

/** Notify everyone on the team except the current user. */
export async function notifyTeammates(
  teamId: string,
  currentUserId: string,
  n: NotificationInput
): Promise<void> {
  const { data } = await supabase.from('profiles').select('id').eq('team_id', teamId).neq('id', currentUserId);
  await notifyUsers(teamId, (data ?? []).map((p) => p.id), n);
}

/** Open tasks that are yours: assigned to you, or unassigned (anyone can take them). */
export function useMyOpenTaskCount() {
  const { team, user } = useAuth();
  return useQuery({
    queryKey: ['tasks', 'my-open-count', team?.id, user?.id],
    queryFn: async () => {
      if (!team?.id || !user?.id) return 0;
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .neq('status', 'completed')
        .or(`assigned_to.eq.${user.id},assigned_to.is.null`);
      return count ?? 0;
    },
    enabled: !!team?.id && !!user?.id,
    refetchInterval: 60_000,
  });
}

/**
 * Live team sync: when a teammate imports, scans, edits items or changes
 * tasks, refresh the affected lists. Mount once (AppLayout).
 * Needs items/tasks in the supabase_realtime publication (team_workflow migration).
 */
export function useTeamRealtime() {
  const { team } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!team?.id) return;
    let itemsTimer: ReturnType<typeof setTimeout> | undefined;
    let tasksTimer: ReturnType<typeof setTimeout> | undefined;

    // Debounce — a 200-row import fires 200 events
    const refreshItems = () => {
      clearTimeout(itemsTimer);
      itemsTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['items'] });
        queryClient.invalidateQueries({ queryKey: ['unconfirmed-count'] });
      }, 800);
    };
    const refreshTasks = () => {
      clearTimeout(tasksTimer);
      tasksTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      }, 500);
    };

    const channel = supabase
      .channel(`team-sync:${team.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `team_id=eq.${team.id}` }, refreshItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `team_id=eq.${team.id}` }, refreshTasks)
      .subscribe();

    return () => {
      clearTimeout(itemsTimer);
      clearTimeout(tasksTimer);
      supabase.removeChannel(channel);
    };
  }, [team?.id, queryClient]);
}
