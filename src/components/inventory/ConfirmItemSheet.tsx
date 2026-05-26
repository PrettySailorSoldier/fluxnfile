import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Item, useStorageLocations } from '@/hooks/useInventory';

interface ConfirmItemSheetProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
}

export function ConfirmItemSheet({ item, open, onClose }: ConfirmItemSheetProps) {
  const queryClient = useQueryClient();
  const { user, team } = useAuth();
  const { data: storageLocations = [] } = useStorageLocations();

  const [decision, setDecision] = useState<'keep' | 'sell' | null>(null);
  const [storageLocationId, setStorageLocationId] = useState('');
  const [heldBy, setHeldBy] = useState('');

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team.id);
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    enabled: !!team?.id,
  });

  useEffect(() => {
    if (!open) {
      setDecision(null);
      setStorageLocationId('');
      setHeldBy('');
    }
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item || !decision) return;
      const { error } = await supabase
        .from('items')
        .update({
          physical_status: decision,
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id ?? null,
          held_by: heldBy || null,
          storage_location_id: storageLocationId || null,
          status: 'acquired',
        } as any)
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['unconfirmed-count'] });
      toast.success('Item confirmed!');
      onClose();
    },
    onError: () => {
      toast.error('Failed to confirm item');
    },
  });

  const photo = item?.photos?.[0];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4 text-left">
          <SheetTitle>{item?.title || 'Untitled Item'}</SheetTitle>
          {photo ? (
            <div className="mt-2">
              <img src={photo} alt="" className="h-24 w-auto rounded-md object-cover" />
            </div>
          ) : (
            <div className="mt-2 w-16 h-16 rounded-md bg-muted flex items-center justify-center">
              <Package className="w-7 h-7 text-muted-foreground" />
            </div>
          )}
        </SheetHeader>

        <div className="space-y-5 pb-6">
          <div className="space-y-2">
            <Label>What are you doing with this?</Label>
            <div className="flex flex-col gap-2">
              <Button
                variant={decision === 'keep' ? 'default' : 'outline'}
                className="w-full h-12 text-base"
                onClick={() => setDecision('keep')}
              >
                Keep
              </Button>
              <Button
                variant={decision === 'sell' ? 'default' : 'outline'}
                className="w-full h-12 text-base"
                onClick={() => setDecision('sell')}
              >
                Sell
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Storage location</Label>
            <Select
              value={storageLocationId || 'none'}
              onValueChange={(v) => setStorageLocationId(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Where is it right now?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {storageLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Who has it?</Label>
            <Select
              value={heldBy || 'none'}
              onValueChange={(v) => setHeldBy(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name || member.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={!decision || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Confirming...' : 'Confirm Item'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
