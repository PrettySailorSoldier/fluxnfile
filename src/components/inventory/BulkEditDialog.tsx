import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  categories: Category[];
  storageLocations: StorageLocation[];
  isSaving: boolean;
  onApply: (edit: BulkEdit) => void;
}

const KEEP = '__keep__';
const CLEAR = '__clear__';

export function BulkEditDialog({
  open,
  onOpenChange,
  count,
  categories,
  storageLocations,
  isSaving,
  onApply,
}: BulkEditDialogProps) {
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
    setPriceMode('keep');
    setPriceValue('');
  }, [open]);

  const edit: BulkEdit = {};
  if (status !== KEEP) edit.status = status as ItemStatus;
  if (category !== KEEP) edit.categoryId = category === CLEAR ? null : category;
  if (location !== KEEP) edit.storageLocationId = location === CLEAR ? null : location;
  if (decision !== KEEP) edit.decision = decision as 'keep' | 'sell';
  if (condition !== KEEP) edit.condition = condition as ItemCondition;
  const priceNum = parseFloat(priceValue);
  if (priceMode === 'fixed' && Number.isFinite(priceNum)) edit.targetPrice = Math.max(0, priceNum);
  if (priceMode === 'markup' && Number.isFinite(priceNum)) edit.markupPercent = priceNum;
  if (priceMode === 'clear') edit.targetPrice = null;
  const changes = Object.keys(edit).length;

  const keepItem = <SelectItem value={KEEP}>— No change —</SelectItem>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {count} item{count === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>Only the fields you change are updated.</DialogDescription>
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
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {keepItem}
                <SelectItem value={CLEAR}>None</SelectItem>
                {storageLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
