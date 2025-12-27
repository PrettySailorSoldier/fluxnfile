import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, Check, Edit2 } from 'lucide-react';
import {
  useMessageTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useIncrementTemplateUse,
  templateCategories,
  MessageTemplate,
} from '@/hooks/useMessageTemplates';

interface TemplateLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemContext?: {
    item_name?: string;
    price?: number;
    lowest_price?: number;
    location?: string;
    condition_notes?: string;
  };
  onSelectTemplate?: (text: string) => void;
}

export function TemplateLibrary({ open, onOpenChange, itemContext, onSelectTemplate }: TemplateLibraryProps) {
  const { data: templates = [], isLoading } = useMessageTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const incrementUse = useIncrementTemplateUse();

  const [activeTab, setActiveTab] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [templateText, setTemplateText] = useState('');

  const filteredTemplates = activeTab === 'all'
    ? templates
    : templates.filter((t) => t.category === activeTab);

  const replaceVariables = (text: string): string => {
    if (!itemContext) return text;
    return text
      .replace(/\[item_name\]/g, itemContext.item_name || '[item]')
      .replace(/\[price\]/g, itemContext.price?.toString() || '[price]')
      .replace(/\[lowest_price\]/g, itemContext.lowest_price?.toString() || '[lowest]')
      .replace(/\[location\]/g, itemContext.location || '[location]')
      .replace(/\[condition_notes\]/g, itemContext.condition_notes || '[condition]')
      .replace(/\[counter_price\]/g, '[your price]')
      .replace(/\[meetup_spot\]/g, '[meetup location]');
  };

  const copyTemplate = async (template: MessageTemplate) => {
    const finalText = replaceVariables(template.template_text);
    await navigator.clipboard.writeText(finalText);
    setCopied(template.id);
    incrementUse.mutate(template.id);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(null), 2000);

    if (onSelectTemplate) {
      onSelectTemplate(finalText);
      onOpenChange(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !templateText.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await createTemplate.mutateAsync({
        name: name.trim(),
        category,
        template_text: templateText.trim(),
      });
      toast.success('Template created!');
      resetForm();
    } catch {
      toast.error('Failed to create template');
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !name.trim() || !templateText.trim()) return;

    try {
      await updateTemplate.mutateAsync({
        id: editingId,
        name: name.trim(),
        category,
        template_text: templateText.trim(),
      });
      toast.success('Template updated!');
      resetForm();
    } catch {
      toast.error('Failed to update template');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const startEdit = (template: MessageTemplate) => {
    setEditingId(template.id);
    setName(template.name);
    setCategory(template.category);
    setTemplateText(template.template_text);
    setIsCreating(true);
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
    setName('');
    setCategory('general');
    setTemplateText('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Message Templates</DialogTitle>
          <DialogDescription>
            Quick responses for buyer messages
          </DialogDescription>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Is Available Response"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(templateCategories).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Template Text</Label>
              <Textarea
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                placeholder="Use [item_name], [price], [lowest_price], [location] as variables..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Variables: [item_name], [price], [lowest_price], [location], [condition_notes]
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={editingId ? handleUpdate : handleCreate}
                disabled={createTemplate.isPending || updateTemplate.isPending}
                className="flex-1"
              >
                {editingId ? 'Update' : 'Create'} Template
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="initial" className="text-xs">Contact</TabsTrigger>
                <TabsTrigger value="pricing" className="text-xs">Price</TabsTrigger>
                <TabsTrigger value="meetup" className="text-xs">Meetup</TabsTrigger>
                <TabsTrigger value="followup" className="text-xs">Follow</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-2">
                {isLoading ? (
                  <p className="text-center text-muted-foreground py-8">Loading...</p>
                ) : filteredTemplates.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No templates yet</p>
                ) : (
                  <div className="space-y-2">
                    {filteredTemplates.map((template) => (
                      <Card key={template.id} className="group">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm truncate">{template.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {templateCategories[template.category as keyof typeof templateCategories] || template.category}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {replaceVariables(template.template_text)}
                              </p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => startEdit(template)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDelete(template.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => copyTemplate(template)}
                              >
                                {copied === template.id ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button onClick={() => setIsCreating(true)} className="w-full mt-2">
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
