import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, MessageSquare, Check } from 'lucide-react';

interface MessageTemplatesProps {
  item?: {
    title?: string;
    target_price?: number;
  };
}

const TEMPLATE_CATEGORIES: Record<string, string> = {
  initial: '📬 Initial Contact',
  pricing: '💰 Pricing',
  meetup: '📍 Meetup',
  followup: '🔔 Follow-up',
};

interface Template {
  id: string;
  name: string;
  category: string;
  template_text: string;
  use_count: number;
}

export function MessageTemplates({ item }: MessageTemplatesProps) {
  const { team } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: ['message-templates', team?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('team_id', team?.id)
        .order('category')
        .order('use_count', { ascending: false });

      if (error) throw error;
      return data as Template[];
    },
    enabled: !!team?.id,
  });

  const fillTemplate = (template: string) => {
    let filled = template;
    
    // Replace variables
    if (item?.title) {
      filled = filled.replace(/\[item_name\]/g, item.title);
    }
    
    if (item?.target_price) {
      filled = filled.replace(/\[price\]/g, `$${item.target_price.toFixed(2)}`);
      const lowestPrice = (item.target_price * 0.9).toFixed(2);
      filled = filled.replace(/\[lowest_price\]/g, `$${lowestPrice}`);
    }
    
    // You can add more variable replacements here
    filled = filled.replace(/\[location\]/g, 'my area');
    filled = filled.replace(/\[meetup_spot\]/g, 'a public location');
    
    return filled;
  };

  const handleCopy = async (template: Template) => {
    const filledText = fillTemplate(template.template_text);
    
    try {
      await navigator.clipboard.writeText(filledText);
      setCopiedId(template.id);
      toast.success('Response copied!');
      
      // Increment use count
      await supabase
        .from('message_templates')
        .update({ use_count: template.use_count + 1 })
        .eq('id', template.id);
      
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const groupedTemplates = templates?.reduce((acc, template) => {
    const category = template.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, Template[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="w-5 h-5" />
          Quick Responses
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {groupedTemplates &&
          Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category} className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {TEMPLATE_CATEGORIES[category] || category}
              </h4>
              <div className="space-y-2">
                {categoryTemplates.map((template) => {
                  const filledText = fillTemplate(template.template_text);
                  const isCopied = copiedId === template.id;
                  
                  return (
                    <div
                      key={template.id}
                      className="bg-muted p-3 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{template.name}</span>
                        {template.use_count > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Used {template.use_count}x
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {filledText}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(template)}
                        className="w-full"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Response
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

        {!templates || templates.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No templates yet. Add some in Settings!
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
