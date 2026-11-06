import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/useInventory';
import { useBundleRules, useDeleteBundleRule, useSaveBundleRule } from '@/hooks/useMarket';
import { sanitizeError } from '@/lib/errorHandler';

/** "Any 3 items tagged $5 or less for $10" — applied automatically in Market Mode. */
export function BundleRulesCard() {
  const { data: rules = [] } = useBundleRules();
  const { data: categories = [] } = useCategories();
  const save = useSaveBundleRule();
  const del = useDeleteBundleRule();

  const [qty, setQty] = useState('3');
  const [tier, setTier] = useState('5');
  const [price, setPrice] = useState('10');
  const [category, setCategory] = useState('any');

  const add = async () => {
    const quantity = parseInt(qty, 10);
    const bundle = parseFloat(price);
    const max = tier === '' ? null : parseFloat(tier);
    if (!(quantity >= 2) || !(bundle > 0) || (max != null && !(max > 0))) {
      toast.error('Use 2 or more items and a bundle price above $0');
      return;
    }
    const catName = categories.find((c) => c.id === category)?.name;
    const name = `Any ${quantity}${catName ? ` ${catName}` : ''}${max != null ? ` ≤$${max}` : ''} for $${bundle}`;
    try {
      await save.mutateAsync({
        name,
        quantity,
        bundle_price: bundle,
        max_item_price: max,
        category_id: category === 'any' ? null : category,
        is_active: true,
      });
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Bundle rules</CardTitle>
        <CardDescription>
          Applied automatically at the register. Items you price by hand are left alone, and a bundle that costs more than the
          regular prices is skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 && <p className="text-sm text-muted-foreground">No bundles yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-md border p-2">
            <p className="flex-1 text-sm">{r.name}</p>
            <Switch
              checked={r.is_active}
              onCheckedChange={(v) => save.mutate({ ...r, is_active: v })}
              aria-label={`${r.name} active`}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => del.mutate(r.id)} aria-label="Delete rule">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <div className="grid grid-cols-3 gap-2 items-end">
          <Field label="Any"><Input type="number" min="2" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9" /></Field>
          <Field label="tagged ≤ $"><Input type="number" min="0" value={tier} onChange={(e) => setTier(e.target.value)} className="h-9" placeholder="any" /></Field>
          <Field label="for $"><Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" /></Field>
        </div>
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any category</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={add} disabled={save.isPending}>Add rule</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
