import { useState } from 'react';
import { useStorageLocations } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MapPin, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

export function StorageLocationManager() {
  const { team } = useAuth();
  const { data: locations = [] } = useStorageLocations();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const handleAdd = async () => {
    if (!newName.trim() || !team?.id) return;

    const { error } = await supabase
      .from('storage_locations')
      .insert({ 
        name: newName.trim(), 
        description: newDescription.trim() || null,
        team_id: team.id 
      });

    if (error) {
      toast.error('Failed to add location');
    } else {
      toast.success('Location added');
      setNewName('');
      setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['storage_locations'] });
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;

    const { error } = await supabase
      .from('storage_locations')
      .update({ 
        name: editName.trim(),
        description: editDescription.trim() || null
      })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update location');
    } else {
      toast.success('Location updated');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['storage_locations'] });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('storage_locations')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete location');
    } else {
      toast.success('Location deleted');
      queryClient.invalidateQueries({ queryKey: ['storage_locations'] });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Storage Locations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {locations.length} locations
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              Manage Locations
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Storage Locations</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-2 mb-4">
              <Input
                placeholder="Location name (e.g., Garage Shelf 1)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Textarea
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
              <Button onClick={handleAdd} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </div>

            <div className="space-y-2">
              {locations.map((loc) => (
                <div key={loc.id} className="p-3 bg-muted rounded-lg">
                  {editingId === loc.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Name"
                      />
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdate(loc.id)}>
                          <Check className="w-4 h-4 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="w-4 h-4 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{loc.name}</p>
                        {loc.description && (
                          <p className="text-sm text-muted-foreground">{loc.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(loc.id);
                            setEditName(loc.name);
                            setEditDescription(loc.description || '');
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(loc.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No storage locations yet
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
