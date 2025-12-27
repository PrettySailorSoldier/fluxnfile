import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MessageTemplate {
  id: string;
  team_id: string;
  name: string;
  category: string;
  template_text: string;
  created_by: string | null;
  is_shared: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export const templateCategories = {
  initial: 'Initial Contact',
  pricing: 'Pricing',
  meetup: 'Meetup',
  followup: 'Follow Up',
  general: 'General',
};

export function useMessageTemplates() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['message_templates', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('team_id', team.id)
        .order('use_count', { ascending: false });

      if (error) throw error;
      return data as MessageTemplate[];
    },
    enabled: !!team?.id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { team, user } = useAuth();

  return useMutation({
    mutationFn: async (template: { name: string; category: string; template_text: string }) => {
      if (!team?.id) throw new Error('No team');

      const { data, error } = await supabase
        .from('message_templates')
        .insert({
          team_id: team.id,
          created_by: user?.id,
          ...template,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message_templates'] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; category?: string; template_text?: string }) => {
      const { error } = await supabase
        .from('message_templates')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message_templates'] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message_templates'] });
    },
  });
}

export function useIncrementTemplateUse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: current } = await supabase
        .from('message_templates')
        .select('use_count')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('message_templates')
        .update({ use_count: (current?.use_count || 0) + 1 })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message_templates'] });
    },
  });
}

// Generate FB-optimized listing text from item
export function generateFBListingText(item: {
  title?: string | null;
  category?: { name: string } | null;
  condition: string;
  target_price?: number | null;
  actual_price?: number | null;
  description?: string | null;
  refurbish_notes?: string | null;
}): { title: string; description: string; price: number } {
  // Generate SEO-optimized title
  const conditionMap: Record<string, string> = {
    new: 'Brand New',
    like_new: 'Like New',
    good: 'Great Condition',
    fair: 'Good Condition',
    for_parts: 'For Parts/Repair',
  };

  const conditionText = conditionMap[item.condition] || '';
  const categoryText = item.category?.name || '';
  const baseTitle = item.title || categoryText;
  
  const title = `${baseTitle} - ${conditionText}`.slice(0, 100);
  
  // Generate description
  const descParts = [];
  if (item.description) descParts.push(item.description);
  if (conditionText) descParts.push(`Condition: ${conditionText}`);
  if (item.refurbish_notes) descParts.push(`Notes: ${item.refurbish_notes}`);
  descParts.push('\n📍 Local pickup available');
  descParts.push('💬 Message me with any questions!');
  
  const description = descParts.join('\n\n');
  const price = item.actual_price || item.target_price || 0;

  return { title, description, price };
}

// Map condition to FB Marketplace options
export const fbConditionMap: Record<string, string> = {
  new: 'New',
  like_new: 'Used - Like New',
  good: 'Used - Good',
  fair: 'Used - Fair',
  for_parts: 'Used - Fair',
};
