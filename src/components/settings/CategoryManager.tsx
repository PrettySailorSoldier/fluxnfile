import { useState } from 'react';
import { useCategories } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FolderOpen, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { sanitizeError } from '@/lib/errorHandler';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100, 'Category name must be less than 100 characters').trim(),
});

export function CategoryManager() {
  const { team } = useAuth();
  const { data: categories = [] } = useCategories();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!team?.id) return;

    try {
      const validated = categorySchema.parse({ name: newName });

      const { error } = await supabase
        .from('categories')
        .insert({ name: validated.name, team_id: team.id });

      if (error) {
        toast.error(sanitizeError(error));
      } else {
        toast.success('Category added');
        setNewName('');
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error(sanitizeError(err));
      }
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const validated = categorySchema.parse({ name: editName });

      const { error } = await supabase
        .from('categories')
        .update({ name: validated.name })
        .eq('id', id);

      if (error) {
        toast.error(sanitizeError(error));
      } else {
        toast.success('Category updated');
        setEditingId(null);
        queryClient.invalidateQueries({ queryKey: ['categories'] });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error(sanitizeError(err));
      }
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error(sanitizeError(error));
    } else {
      toast.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          Categories
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {categories.length} categories
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              Manage Categories
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Categories</DialogTitle>
            </DialogHeader>
            
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="New category name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd} size="icon">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate(cat.id)}
                      />
                      <Button size="icon" variant="ghost" onClick={() => handleUpdate(cat.id)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">{cat.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(cat.id);
                          setEditName(cat.name);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(cat.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No categories yet
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
