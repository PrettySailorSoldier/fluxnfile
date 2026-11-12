import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LocationPicker } from '@/components/inventory/LocationPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  statusConfig,
  conditionLabels,
  type Category,
  type ItemCondition,
  type ItemStatus,
  type StorageLocation,
} from '@/hooks/useInventory';

/** Only the fields that are set get changed. `null` clears a field. */
export interface BulkEdit {
  status?: ItemStatus;
  categoryId?: string | null;
  storageLocationId?: string | null;
  decision?: 'keep' | 'sell';
  condition?: ItemCondition;
  targetPrice?: number | null;
  /** Set target price to cost + N% for each item */
  markupPercent?: number;
  /** Pack for this market (id), or unpack (null) */
  eventId?: string | null;
  /** Flag for this teammate (they get a notification), or clear the flag (null) */
  flagFor?: string | null;
  flagNote?: string;
  /** Who physically has these now, or nobody (null) */
  heldBy?: string | null;
  /** Market sticker price for every item, or clear it (null) */
  tagPrice?: number | null;
  /** Sticker price = each item's own asking price */
  tagFromAsking?: boolean;
}

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  categories: Category[];
  storageLocations: StorageLocation[];
  /** Markets that can still be packed for */
  events?: { id: string; name: string; event_date: string }[];
  /** Teammates, for flagging and "who has it" */
  members?: { id: string; full_name: string | null }[];
  currentUserId?: string | null;
  isSaving: boolean;
  onApply: (edit: BulkEdit) => void;
}

const KEEP = '__keep__';
const CLEAR = '__clear__';
/** "Choose a location…" picked, but no location chosen yet */
const PICK = '__pick__';

export function BulkEditDialog({
  open,
  onOpenChange,
  count,
  categories,
  storageLocations,
  events = [],
  members = [],
  currentUserId,
  isSaving,
  onApply,
}: BulkEditDialogProps) {
  const [market, setMarket] = useState(KEEP);
  const [flag, setFlag] = useState(KEEP);
  const [flagNote, setFlagNote] = useState('');
  const [holder, setHolder] = useState(KEEP);
  const [tagMode, setTagMode] = useState<'keep' | 'fixed' | 'asking' | 'clear'>('keep');
  const [tagValue, setTagValue] = useState('');
  const [status, setStatus] = useState(KEEP);
  const [category, setCategory] = useState(KEEP);
  const [location, setLocation] = useState(KEEP);
  const [decision, setDecision] = useState(KEEP);
  const [condition, setCondition] = useState(KEEP);
  const [priceMode, setPriceMode] = useState<'keep' | 'fixed' | 'markup' | 'clear'>('keep');
  const [priceValue, setPriceValue] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatus(KEEP);
    setCategory(KEEP);
    setLocation(KEEP);
    setDecision(KEEP);
    setCondition(KEEP);
    setMarket(KEEP);
    setFlag(KEEP);
    setFlagNote('');
    setHolder(KEEP);
    setTagMode('keep');
    setTagValue('');
    setPriceMode('keep');
    setPriceValue('');
  }, [open]);

  const edit: BulkEdit = {};
  if (status !== KEEP) edit.status = status as ItemStatus;
  if (category !== KEEP) edit.categoryId = category === CLEAR ? null : category;
  if (location !== KEEP && location !== PICK) edit.storageLocationId = location === CLEAR ? null : location;
  if (decision !== KEEP) edit.decision = decision as 'keep' | 'sell';
  if (condition !== KEEP) edit.condition = condition as ItemCondition;
  if (market !== KEEP) edit.eventId = market === CLEAR ? null : market;
  const priceNum = parseFloat(priceValue);
  if (priceMode === 'fixed' && Number.isFinite(priceNum)) edit.targetPrice = Math.max(0, priceNum);
  if (priceMode === 'markup' && Number.isFinite(priceNum)) edit.markupPercent = priceNum;
  if (priceMode === 'clear') edit.targetPrice = null;
  if (flag !== KEEP) {
    edit.flagFor = flag === CLEAR ? null : flag;
    if (flag !== CLEAR && flagNote.trim()) edit.flagNote = flagNote.trim();
  }
  if (holder !== KEEP) edit.heldBy = holder === CLEAR ? null : holder;
  const tagNum = parseFloat(tagValue);
  if (tagMode === 'fixed' && Number.isFinite(tagNum)) edit.tagPrice = Math.max(0, tagNum);
  if (tagMode === 'asking') edit.tagFromAsking = true;
  if (tagMode === 'clear') edit.tagPrice = null;
  const memberLabel = (m: { id: string; full_name: string | null }) =>
    `${m.full_name || 'Unnamed'}${m.id === currentUserId ? ' (you)' : ''}`;
  const changes = Object.keys(edit).length;

  const keepItem = <SelectItem value={KEEP}>— No change —</SelectItem>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {count} item{count === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>
            Only the fields you change are updated. Choosing “Sold” asks what each one sold for and where.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                {(Object.keys(statusConfig) as ItemStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Keep / Sell</Label>
            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value="sell">Sell</SelectItem>
                <SelectItem value="keep">Keep</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value={CLEAR}>None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={location === KEEP || location === CLEAR ? location : PICK} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value={CLEAR}>None</SelectItem>
                <SelectItem value={PICK}>Move to…</SelectItem>
              </SelectContent>
            </Select>
            {location !== KEEP && location !== CLEAR && (
              <LocationPicker
                value={location === PICK ? '' : location}
                onChange={(id) => setLocation(id || PICK)}
                noneLabel="Choose a location"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                {(Object.keys(conditionLabels) as ItemCondition[]).map((c) => (
                  <SelectItem key={c} value={c}>{conditionLabels[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Pack for market</Label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value={CLEAR}>Unpack</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} · {e.event_date}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Asking price</Label>
            <Select value={priceMode} onValueChange={(v) => setPriceMode(v as typeof priceMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">— No change —</SelectItem>
                <SelectItem value="fixed">Set to $…</SelectItem>
                <SelectItem value="markup">Cost + …%</SelectItem>
                <SelectItem value="clear">Clear price</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(priceMode === 'fixed' || priceMode === 'markup') && (
            <div className="col-span-2 space-y-1.5">
              <Label>{priceMode === 'fixed' ? 'Price for every selected item ($)' : 'Markup over each item’s cost (%)'}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step={priceMode === 'fixed' ? '0.01' : '1'}
                value={priceValue}
                placeholder={priceMode === 'fixed' ? '19.99' : '100'}
                onChange={(e) => setPriceValue(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Market tag price</Label>
            <Select value={tagMode} onValueChange={(v) => setTagMode(v as typeof tagMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">— No change —</SelectItem>
                <SelectItem value="fixed">Set to $…</SelectItem>
                <SelectItem value="asking">Same as asking price</SelectItem>
                <SelectItem value="clear">Clear tag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Who has it</Label>
            <Select value={holder} onValueChange={setHolder}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value={CLEAR}>Nobody</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{memberLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tagMode === 'fixed' && (
            <div className="col-span-2 space-y-1.5">
              <Label>Tag price for every selected item ($)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={tagValue}
                placeholder="5"
                onChange={(e) => setTagValue(e.target.value)}
              />
            </div>
          )}

          <div className="col-span-2 space-y-1.5">
            <Label>Flag for a teammate</Label>
            <Select value={flag} onValueChange={setFlag}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value={CLEAR}>Clear flag</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{memberLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {flag !== KEEP && flag !== CLEAR && (
              <Input
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value.slice(0, 200))}
                placeholder="Note (optional) — e.g. “photograph these”"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onApply(edit)} disabled={changes === 0 || isSaving}>
            {isSaving ? 'Saving…' : `Apply to ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
