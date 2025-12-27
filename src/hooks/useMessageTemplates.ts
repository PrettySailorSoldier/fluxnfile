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

// SEO keywords that help FB Marketplace visibility
const fbKeywords: Record<string, string[]> = {
  Electronics: ['works great', 'tested', 'fully functional'],
  Furniture: ['solid', 'sturdy', 'must see'],
  Clothing: ['size', 'fits', 'worn once'],
  'Home & Garden': ['great condition', 'works perfectly'],
  Sports: ['ready to use', 'great for'],
  Toys: ['complete', 'all pieces included'],
  default: ['great deal', 'priced to sell'],
};

// Generate FB-optimized listing text from item
export function generateFBListingText(item: {
  title?: string | null;
  category?: { name: string } | null;
  condition: string;
  target_price?: number | null;
  actual_price?: number | null;
  description?: string | null;
  refurbish_notes?: string | null;
  default_pickup_location?: string | null;
}): { title: string; description: string; price: number; seoTitle: string } {
  // Generate SEO-optimized title
  const conditionMap: Record<string, string> = {
    new: 'Brand New',
    like_new: 'Like New',
    good: 'Great Condition',
    fair: 'Good Condition',
    for_parts: 'For Parts/Repair',
  };

  const shortConditionMap: Record<string, string> = {
    new: 'NEW',
    like_new: 'Like New',
    good: 'Great Cond',
    fair: 'Good Cond',
    for_parts: 'Parts/Repair',
  };

  const conditionText = conditionMap[item.condition] || '';
  const shortCondition = shortConditionMap[item.condition] || '';
  const categoryText = item.category?.name || '';
  const baseTitle = item.title || categoryText;
  const price = item.actual_price || item.target_price || 0;

  // Generate multiple title options
  const title = `${baseTitle} - ${conditionText}`.slice(0, 100);

  // SEO-optimized title with price and urgency
  const seoTitle = `${baseTitle} | ${shortCondition} | $${price}`.slice(0, 100);

  // Generate enhanced description with emojis and structure
  const descParts: string[] = [];

  // Header with condition
  if (conditionText) {
    descParts.push(`✨ ${conditionText} ✨`);
  }

  // Main description
  if (item.description) {
    descParts.push(item.description);
  }

  // Category-specific keywords
  const keywords = fbKeywords[categoryText] || fbKeywords.default;
  if (keywords.length > 0 && !item.description?.toLowerCase().includes(keywords[0])) {
    descParts.push(`${keywords[0].charAt(0).toUpperCase() + keywords[0].slice(1)}!`);
  }

  // Refurbish notes as selling points
  if (item.refurbish_notes) {
    descParts.push(`📝 ${item.refurbish_notes}`);
  }

  // Pricing info
  descParts.push(`💰 Asking $${price} - Price is firm/negotiable`);

  // Pickup info
  if (item.default_pickup_location) {
    descParts.push(`📍 Pickup: ${item.default_pickup_location}`);
  } else {
    descParts.push('📍 Local pickup available');
  }

  // Call to action
  descParts.push('');
  descParts.push('💬 Message me with any questions!');
  descParts.push('⚡ First come, first served');

  const description = descParts.join('\n\n');

  return { title, description, price, seoTitle };
}

// Generate title variations for A/B testing
export function generateTitleVariations(item: {
  title?: string | null;
  category?: { name: string } | null;
  condition: string;
  target_price?: number | null;
  actual_price?: number | null;
}): string[] {
  const conditionMap: Record<string, string[]> = {
    new: ['Brand New', 'NEW', 'Never Used'],
    like_new: ['Like New', 'Excellent', 'Mint'],
    good: ['Great Condition', 'Good Cond', 'Works Great'],
    fair: ['Good Condition', 'Works Well', 'Functional'],
    for_parts: ['For Parts', 'Parts/Repair', 'As-Is'],
  };

  const conditions = conditionMap[item.condition] || [''];
  const baseTitle = item.title || item.category?.name || 'Item';
  const price = item.actual_price || item.target_price || 0;

  const variations: string[] = [];

  // Standard: Title - Condition
  variations.push(`${baseTitle} - ${conditions[0]}`);

  // With price: Title | Condition | $Price
  variations.push(`${baseTitle} | ${conditions[1] || conditions[0]} | $${price}`);

  // Urgent style: Title - Condition - Must Go!
  variations.push(`${baseTitle} - ${conditions[0]} - Must See!`);

  // Simple: Condition Title
  variations.push(`${conditions[0]} ${baseTitle}`);

  return variations.map(v => v.slice(0, 100));
}

// Generate description templates
export function getDescriptionTemplates(item: {
  title?: string | null;
  category?: { name: string } | null;
  condition: string;
  target_price?: number | null;
  actual_price?: number | null;
  description?: string | null;
  default_pickup_location?: string | null;
}): { name: string; template: string }[] {
  const price = item.actual_price || item.target_price || 0;
  const title = item.title || item.category?.name || 'Item';
  const location = item.default_pickup_location || 'Local area';

  return [
    {
      name: 'Simple',
      template: `${title} for sale.

${item.description || 'Great item in good condition.'}

$${price} - Message for details.
Pickup: ${location}`,
    },
    {
      name: 'Detailed',
      template: `${title}

✨ Condition: ${item.condition.replace('_', ' ')}

${item.description || 'Well maintained and ready to use.'}

💰 Price: $${price}
📍 Pickup: ${location}
💬 Message me with questions!

⚡ Serious buyers only, please.`,
    },
    {
      name: 'Urgent',
      template: `🔥 ${title} - MUST GO! 🔥

${item.description || 'Great condition!'}

💰 Only $${price}!
📍 ${location}

First come first served!
Message NOW before it's gone! 💨`,
    },
  ];
}

// Map condition to FB Marketplace options
export const fbConditionMap: Record<string, string> = {
  new: 'New',
  like_new: 'Used - Like New',
  good: 'Used - Good',
  fair: 'Used - Fair',
  for_parts: 'Used - Fair',
};
