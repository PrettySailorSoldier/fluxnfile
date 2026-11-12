import { useEffect, useState } from 'react';
import { Tag, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LABEL_PRESETS, MIN_COMFORTABLE_MM, isLabelTooSmall, useLabelSettings, type LabelPreset } from '@/lib/labelSettings';

/** mm field that keeps what you type until it's a number */
function MmField({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="space-y-1 flex-1 min-w-0">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label} (mm)
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        className="h-11"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(',', '.'));
          if (Number.isFinite(n) && n >= 10) onCommit(n);
        }}
        onBlur={() => setText(String(value))}
      />
    </div>
  );
}

/** Label printer size and the "offer to print after saving" switch, stored on this device. */
export function LabelSettingsCard() {
  const [s, update] = useLabelSettings();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Tag className="w-4 h-4" />
          Label printer
        </CardTitle>
        <CardDescription className="text-xs">
          One label per page through AirPrint, or share a label image to your printer's app. Saved on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Label size</Label>
          <Select
            value={s.preset}
            onValueChange={(v) => {
              const p = LABEL_PRESETS.find((x) => x.id === v);
              update(p ? { preset: p.id, widthMm: p.widthMm, heightMm: p.heightMm } : { preset: v as LabelPreset });
            }}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id} className="min-h-11">
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="custom" className="min-h-11">
                Custom…
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {s.preset === 'custom' && (
          <div className="flex gap-3">
            <MmField id="label-w" label="Width" value={s.widthMm} onCommit={(n) => update({ widthMm: n })} />
            <MmField id="label-h" label="Height" value={s.heightMm} onCommit={(n) => update({ heightMm: n })} />
          </div>
        )}

        {isLabelTooSmall(s) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex gap-1.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Labels smaller than about {MIN_COMFORTABLE_MM.width} × {MIN_COMFORTABLE_MM.height} mm get cramped — the barcode
            stays at least 8 mm tall, so the price and title shrink.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 min-h-11">
          <Label htmlFor="label-offer" className="text-sm font-normal">
            Offer to print a label after saving an item
          </Label>
          <Switch id="label-offer" checked={s.offerAfterSave} onCheckedChange={(v) => update({ offerAfterSave: v })} />
        </div>
      </CardContent>
    </Card>
  );
}
