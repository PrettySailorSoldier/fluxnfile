import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLocationIndex, useRolledUpStock, type StorageLocation } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { MapPin, Plus, Pencil, Trash2, X, Check, ChevronRight, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { sanitizeError } from '@/lib/errorHandler';
import { MAX_DEPTH, locationSaveError, sameLocationName } from '@/lib/locationTree';
import { cn } from '@/lib/utils';

const locationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required').max(100, 'Location name must be less than 100 characters'),
  description: z.string().max(500, 'Notes must be less than 500 characters').optional(),
});

const TOP = '__top';
const TOP_SUGGESTIONS = ['Garage', 'Workshop', 'Closet', 'Storage unit', 'Car'];
const INNER_SUGGESTIONS = ['Shelf', 'Bin', 'Drawer', 'Box', 'Left', 'Right'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function StorageLocationManager() {
  const { team } = useAuth();
  const { index, locations } = useLocationIndex();
  const stock = useRolledUpStock();
  const unplaced = stock.get('') ?? { count: 0, value: 0 };
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Add form
  const [inside, setInside] = useState(TOP);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editParent, setEditParent] = useState(TOP);
  const [editNeedsMove, setEditNeedsMove] = useState(false);

  const needsMoving = locations.filter((l) => l.needs_move);

  /** Expand/collapse overrides; by default top-level places are open, deeper ones closed */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (n: StorageLocation) => toggled[n.id] ?? index.depthOf(n.id) === 1;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['storage_locations'] });
  };

  const whereLabel = (parentId: string | null) => (parentId ? `"${index.byId.get(parentId)?.name ?? 'that spot'}"` : 'the top level');

  const insideId = inside === TOP || !index.byId.has(inside) ? null : inside;
  const suggestions = insideId ? INNER_SUGGESTIONS : locations.length === 0 ? TOP_SUGGESTIONS : [];

  const addInside = (id: string) => {
    setInside(id);
    setToggled((t) => ({ ...t, [id]: true }));
    setNewName('');
    requestAnimationFrame(() => {
      nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      nameRef.current?.focus();
    });
  };

  const handleAdd = async () => {
    if (!team?.id) return;
    const parsed = locationSchema.safeParse({ name: newName, description: newDescription.trim() || undefined });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    const { name, description } = parsed.data;
    if (index.children(insideId).some((c) => sameLocationName(c.name, name))) {
      return toast.error(`"${name}" already exists in ${whereLabel(insideId)}`);
    }
    const { error } = await supabase
      .from('storage_locations')
      // parent_id only when nested, so top-level adds work before the hierarchy migration is applied
      .insert({ name, description: description || null, team_id: team.id, ...(insideId ? { parent_id: insideId } : {}) });
    if (error) return toast.error(locationSaveError(error, name, whereLabel(insideId)) ?? sanitizeError(error));
    toast.success(insideId ? `Added ${name} in ${index.byId.get(insideId)?.name}` : `Added ${name}`);
    setNewName('');
    setNewDescription('');
    setShowNotes(false);
    refresh();
  };

  const startEdit = (loc: StorageLocation) => {
    setEditingId(loc.id);
    setEditName(loc.name);
    setEditDescription(loc.description || '');
    setEditParent(loc.parent_id && index.byId.has(loc.parent_id) ? loc.parent_id : TOP);
    setEditNeedsMove(!!loc.needs_move);
  };

  const handleUpdate = async (loc: StorageLocation) => {
    const parsed = locationSchema.safeParse({ name: editName, description: editDescription.trim() || undefined });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    const { name, description } = parsed.data;
    const parentId = editParent === TOP ? null : editParent;
    if (index.wouldCreateCycle(loc.id, parentId)) return toast.error("Can't move a location inside one of its own spots");
    if (index.children(parentId).some((c) => c.id !== loc.id && sameLocationName(c.name, name))) {
      return toast.error(`"${name}" already exists in ${whereLabel(parentId)}`);
    }
    const { error } = await supabase
      .from('storage_locations')
      .update({
        name,
        description: description || null,
        ...((loc.parent_id ?? null) !== parentId ? { parent_id: parentId } : {}),
        // Only sent when changed, so renames keep working before the needs_move migration is applied
        ...(!!loc.needs_move !== editNeedsMove ? { needs_move: editNeedsMove } : {}),
      })
      .eq('id', loc.id);
    if (error) return toast.error(locationSaveError(error, name, whereLabel(parentId)) ?? sanitizeError(error));
    toast.success('Location updated');
    setEditingId(null);
    if (parentId) setToggled((t) => ({ ...t, [parentId]: true }));
    refresh();
    // Item rows embed the location; paths are rebuilt from the list, but refresh anyway
    queryClient.invalidateQueries({ queryKey: ['items'] });
  };

  const setNeedsMove = async (loc: StorageLocation, value: boolean) => {
    const { error } = await supabase.from('storage_locations').update({ needs_move: value }).eq('id', loc.id);
    if (error) return toast.error(sanitizeError(error));
    refresh();
    queryClient.invalidateQueries({ queryKey: ['items'] });
    if (!value) {
      toast.success(`${loc.name} marked as moved`, {
        action: { label: 'Undo', onClick: () => setNeedsMove(loc, true) },
      });
    }
  };

  const handleDelete = async (loc: StorageLocation) => {
    const spots = index.descendantIds(loc.id).size - 1;
    const inIt = stock.get(loc.id)?.count ?? 0;
    const head = spots > 0 ? `Delete "${loc.name}" and the ${plural(spots, 'spot')} inside it?` : `Delete "${loc.name}"?`;
    const tail =
      inIt > 0
        ? ` The ${plural(inIt, 'item')} in ${spots > 0 ? 'them' : 'it'} will have no location.`
        : spots > 0
          ? ' They are empty.'
          : '';
    if (!window.confirm(head + tail)) return;
    const { error } = await supabase.from('storage_locations').delete().eq('id', loc.id);
    if (error) return toast.error(sanitizeError(error));
    toast.success(spots > 0 ? `Deleted ${loc.name} and ${plural(spots, 'spot')} inside` : 'Location deleted');
    refresh();
    queryClient.invalidateQueries({ queryKey: ['items'] });
  };

  const renderNode = (loc: StorageLocation, depth: number): JSX.Element => {
    const kids = index.children(loc.id);
    const expanded = isOpen(loc);
    const s = stock.get(loc.id) ?? { count: 0, value: 0 };
    const moveTargets = editingId === loc.id ? index.validParents(loc.id) : [];
    return (
      <div key={loc.id}>
        <div
          className={cn(
            'rounded-lg py-1.5 pr-1',
            loc.needs_move && editingId !== loc.id ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/40' : 'bg-muted'
          )}
          style={{ marginLeft: `${Math.min(depth - 1, MAX_DEPTH - 1) * 12}px` }}
        >
          {editingId === loc.id ? (
            <div className="space-y-2 px-2 py-1">
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" className="h-11" maxLength={100} />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Inside</Label>
                <Select value={editParent} onValueChange={setEditParent}>
                  <SelectTrigger className="h-11 min-w-0 [&>span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value={TOP} className="min-h-11">Top level</SelectItem>
                    {moveTargets.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="min-h-11">
                        <span className="truncate">{index.pathText(p.id)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Notes (optional)" rows={2} />
              <label className="flex min-h-11 items-center gap-3 rounded-md border bg-background px-3 py-2 cursor-pointer">
                <Truck className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">Needs to be moved</span>
                  <span className="block text-xs text-muted-foreground">Stuff is here for now but shouldn't stay. Say where it goes in the notes.</span>
                </span>
                <Switch checked={editNeedsMove} onCheckedChange={setEditNeedsMove} aria-label="Needs to be moved" />
              </label>
              <div className="flex gap-2">
                <Button size="sm" className="h-11 flex-1" onClick={() => handleUpdate(loc)}>
                  <Check className="w-4 h-4 mr-1" /> Save
                </Button>
                <Button size="sm" variant="ghost" className="h-11" onClick={() => setEditingId(null)}>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 min-w-0">
              <button
                type="button"
                className={cn('h-11 w-8 flex-shrink-0 flex items-center justify-center text-muted-foreground', kids.length === 0 && 'invisible')}
                onClick={() => setToggled((t) => ({ ...t, [loc.id]: !expanded }))}
                aria-label={expanded ? `Collapse ${loc.name}` : `Expand ${loc.name}`}
                aria-expanded={expanded}
              >
                <ChevronRight className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" title={index.pathText(loc.id)}>
                  {loc.name}
                </p>
                {loc.needs_move && (
                  <div className="flex flex-wrap items-center gap-x-2 my-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <Truck className="w-3 h-3" /> Needs moving
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline py-1"
                      onClick={() => setNeedsMove(loc, false)}
                    >
                      Mark moved
                    </button>
                  </div>
                )}
                {loc.description && <p className="text-xs text-muted-foreground truncate">{loc.description}</p>}
                <Link
                  to={`/inventory?loc=${loc.id}`}
                  onClick={() => setOpen(false)}
                  className="text-xs text-primary hover:underline"
                >
                  {s.count} in stock
                  {s.value > 0 && ` · $${Math.round(s.value)} asking`} · view
                </Link>
              </div>
              {depth < MAX_DEPTH && (
                <Button size="icon" variant="ghost" className="h-11 w-10 flex-shrink-0" onClick={() => addInside(loc.id)} aria-label={`Add a spot inside ${loc.name}`}>
                  <Plus className="w-4 h-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-11 w-10 flex-shrink-0" onClick={() => startEdit(loc)} aria-label={`Edit ${loc.name}`}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-11 w-10 flex-shrink-0" onClick={() => handleDelete(loc)} aria-label={`Delete ${loc.name}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        {expanded && kids.length > 0 && <div className="mt-1.5 space-y-1.5">{kids.map((k) => renderNode(k, depth + 1))}</div>}
      </div>
    );
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
          {plural(index.roots.length, 'place')}
          {locations.length > index.roots.length && ` · ${plural(locations.length - index.roots.length, 'spot')} inside them`}
        </p>
        {needsMoving.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
            <Truck className="w-4 h-4 flex-shrink-0" />
            {needsMoving.length === 1 ? '1 place needs' : `${needsMoving.length} places need`} moving
          </p>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              Manage Locations
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden px-4 sm:px-6">
            <DialogHeader>
              <DialogTitle>Manage Storage Locations</DialogTitle>
            </DialogHeader>

            <div className="space-y-2 mb-4 min-w-0">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Inside</Label>
                <Select value={insideId ?? TOP} onValueChange={setInside}>
                  <SelectTrigger className="h-11 min-w-0 [&>span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value={TOP} className="min-h-11">Top level</SelectItem>
                    {index.canHoldChildren().map((p) => (
                      <SelectItem key={p.id} value={p.id} className="min-h-11">
                        <span className="truncate">{index.pathText(p.id)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                ref={nameRef}
                className="h-11"
                placeholder={insideId ? `Name (e.g. Bottom shelf)` : 'Name (e.g. Garage)'}
                value={newName}
                maxLength={100}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewName(s)}
                      className={cn(
                        'min-h-11 rounded-full border px-3 text-sm',
                        newName === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {showNotes ? (
                <Textarea
                  placeholder="Notes (optional)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                />
              ) : (
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground py-2" onClick={() => setShowNotes(true)}>
                  + Add notes
                </button>
              )}
              <Button onClick={handleAdd} className="w-full h-11 min-w-0" disabled={!newName.trim()}>
                <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">{insideId ? `Add inside ${index.byId.get(insideId)?.name}` : 'Add Location'}</span>
              </Button>
            </div>

            <div className="space-y-1.5 min-w-0">
              {index.roots.map((loc) => renderNode(loc, 1))}
              {unplaced.count > 0 && (
                <Link
                  to="/inventory?loc=none"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  {unplaced.count} item{unplaced.count === 1 ? '' : 's'} have no location yet · view
                </Link>
              )}
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No storage locations yet. Start with a place, like Garage — then add shelves and bins inside it.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
