import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useLocationIndex, type StorageLocation } from '@/hooks/useInventory';
import { MAX_DEPTH, locationSaveError, sameLocationName } from '@/lib/locationTree';
import { sanitizeError } from '@/lib/errorHandler';
import { cn } from '@/lib/utils';

const NONE = '__none';
const ANY = '__any';
const NEW = '__new';

interface LocationPickerProps {
  /** A storage location id, or '' for none */
  value: string;
  onChange: (id: string) => void;
  /** One small button that opens the picker in a bottom sheet (for tight toolbars) */
  compact?: boolean;
  /** Label for the empty choice ("None", "No location") */
  noneLabel?: string;
  className?: string;
  /** Extra classes for the compact trigger button */
  triggerClassName?: string;
}

/**
 * Cascading location dropdowns: Location → spot inside it → … until a spot has
 * nothing inside. Each level can add a new spot in place. The chain is always
 * derived from `value`, so setting it from outside restores every level.
 */
export function LocationPicker({ compact, ...props }: LocationPickerProps) {
  return compact ? <CompactLocationPicker {...props} /> : <LocationCascade {...props} />;
}

function CompactLocationPicker({ value, onChange, noneLabel = 'No location', triggerClassName }: LocationPickerProps) {
  const { index } = useLocationIndex();
  const [open, setOpen] = useState(false);
  const node = value ? index.byId.get(value) : undefined;
  const path = node ? index.pathText(node.id) : '';
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title={path || noneLabel}
        onClick={() => setOpen(true)}
        className={cn('h-8 text-xs justify-start gap-1.5 min-w-0 font-normal', triggerClassName)}
      >
        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
        <span className={cn('truncate', !node && 'text-muted-foreground')}>{node?.name ?? noneLabel}</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-3 text-left">
            <SheetTitle>Location</SheetTitle>
          </SheetHeader>
          <LocationCascade value={value} onChange={onChange} noneLabel={noneLabel} />
          <Button className="w-full h-11 mt-4" onClick={() => setOpen(false)}>
            Done
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}

function LocationCascade({ value, onChange, noneLabel = 'None', className }: LocationPickerProps) {
  const { index, loaded } = useLocationIndex();
  const { team } = useAuth();
  const queryClient = useQueryClient();
  /** Which parent the inline "add new" input is adding under (null = top level) */
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const chain = index.pathOf(value);

  // The selected spot was deleted (or moved out of reach) by a teammate, or a
  // remembered location no longer exists → fall back to none.
  const missing = loaded && !!value && !index.byId.has(value);
  useEffect(() => {
    if (missing) onChange('');
  }, [missing, onChange]);

  const startAdding = (parentId: string | null) => {
    setAdding({ parentId });
    setNewName('');
  };

  const whereLabel = (parentId: string | null) => (parentId ? `"${index.byId.get(parentId)?.name ?? 'that spot'}"` : 'the top level');

  const saveNew = async () => {
    if (!adding || !team?.id) return;
    const name = newName.trim();
    if (!name) return;
    if (name.length > 100) {
      toast.error('Keep the name under 100 characters');
      return;
    }
    const { parentId } = adding;
    if (index.children(parentId).some((c) => sameLocationName(c.name, name))) {
      toast.error(`"${name}" already exists in ${whereLabel(parentId)}`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('storage_locations')
      // parent_id only when nested, so top-level adds work before the hierarchy migration is applied
      .insert({ team_id: team.id, name, ...(parentId ? { parent_id: parentId } : {}) })
      .select('*')
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(locationSaveError(error, name, whereLabel(parentId)) ?? sanitizeError(error));
      return;
    }
    // Show it immediately (so selecting it doesn't look like a missing id), then refetch
    queryClient.setQueryData<StorageLocation[]>(['storage_locations', team.id], (old) =>
      old ? [...old, data as StorageLocation] : old
    );
    queryClient.invalidateQueries({ queryKey: ['storage_locations'] });
    setAdding(null);
    setNewName('');
    onChange(data.id);
    toast.success(`Added ${name}`);
  };

  const addRow = (parentId: string | null) =>
    adding && adding.parentId === parentId ? (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveNew();
            } else if (e.key === 'Escape') setAdding(null);
          }}
          placeholder={parentId ? `New spot in ${index.byId.get(parentId)?.name ?? ''}` : 'New location (e.g. Garage)'}
          maxLength={100}
          className="h-11 min-w-0"
        />
        <Button type="button" size="icon" className="h-11 w-11 flex-shrink-0" onClick={saveNew} disabled={saving || !newName.trim()} aria-label="Save location">
          <Check className="w-4 h-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-11 w-11 flex-shrink-0" onClick={() => setAdding(null)} aria-label="Cancel">
          <X className="w-4 h-4" />
        </Button>
      </div>
    ) : null;

  // Level 0 = top-level places; level k lists the children of chain[k-1]
  const levels: { parentId: string | null; options: StorageLocation[]; selected: string }[] = [
    { parentId: null, options: index.roots, selected: chain[0]?.id ?? NONE },
  ];
  for (let k = 1; k < MAX_DEPTH && k <= chain.length; k++) {
    const parent = chain[k - 1];
    const options = index.children(parent.id);
    if (options.length === 0) break;
    levels.push({ parentId: parent.id, options, selected: chain[k]?.id ?? ANY });
  }
  const deepest = chain[chain.length - 1];
  const leafCanHoldMore = !!deepest && chain.length < MAX_DEPTH && index.children(deepest.id).length === 0;

  return (
    <div className={cn('space-y-2 min-w-0', className)}>
      {levels.map((lvl, k) => {
        const parent = lvl.parentId ? index.byId.get(lvl.parentId) : undefined;
        return (
          <div key={lvl.parentId ?? 'root'} className="space-y-2">
            <Select
              value={lvl.selected}
              onValueChange={(v) => {
                if (v === NEW) return startAdding(lvl.parentId);
                setAdding(null);
                if (v === NONE) onChange('');
                else if (v === ANY) onChange(lvl.parentId ?? '');
                else onChange(v);
              }}
            >
              <SelectTrigger className="h-11 min-w-0 [&>span]:truncate" aria-label={k === 0 ? 'Location' : `Spot in ${parent?.name}`}>
                <SelectValue placeholder={k === 0 ? 'Location' : 'Spot'} />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {k === 0 ? (
                  <SelectItem value={NONE} className="min-h-11">{noneLabel}</SelectItem>
                ) : (
                  <SelectItem value={ANY} className="min-h-11">
                    <span className="truncate">Any spot in {parent?.name}</span>
                  </SelectItem>
                )}
                {lvl.options.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="min-h-11">
                    <span className="truncate">{o.name}</span>
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW} className="min-h-11 text-primary">
                  + Add new…
                </SelectItem>
              </SelectContent>
            </Select>
            {addRow(lvl.parentId)}
          </div>
        );
      })}

      {leafCanHoldMore &&
        (adding?.parentId === deepest.id ? (
          addRow(deepest.id)
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-full justify-start text-muted-foreground font-normal min-w-0"
            onClick={() => startAdding(deepest.id)}
          >
            <Plus className="w-4 h-4 mr-1.5 flex-shrink-0" />
            <span className="truncate">Add a spot inside {deepest.name}</span>
          </Button>
        ))}

      {chain.length > 1 && (
        <p className="text-xs text-muted-foreground break-words">{index.pathText(value)}</p>
      )}
    </div>
  );
}
