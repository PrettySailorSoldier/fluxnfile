import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateEvent, useUpdateEvent, type MarketEvent } from '@/hooks/useMarket';
import { sanitizeError } from '@/lib/errorHandler';

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this event; omit to create one */
  event?: MarketEvent;
  onCreated?: (event: MarketEvent) => void;
}

export function EventFormDialog({ open, onOpenChange, event, onCreated }: Props) {
  const create = useCreateEvent();
  const update = useUpdateEvent();

  const [name, setName] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [location, setLocation] = useState('');
  const [boothFee, setBoothFee] = useState('');
  const [otherCosts, setOtherCosts] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [startCash, setStartCash] = useState('');
  const [weather, setWeather] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(event?.name ?? '');
    setDate(event?.event_date ?? todayLocal());
    setLocation(event?.location ?? '');
    setBoothFee(event ? String(event.booth_fee) : '');
    setOtherCosts(event ? String(event.other_costs) : '');
    setStartTime(event?.start_time ?? '');
    setEndTime(event?.end_time ?? '');
    setStartCash(event ? String(event.start_cash) : '');
    setWeather(event?.weather ?? '');
    setNotes(event?.notes ?? '');
  }, [open, event]);

  const money = (v: string) => Math.max(0, parseFloat(v) || 0);

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Give the market a name');
      return;
    }
    const payload = {
      name: name.trim(),
      event_date: date,
      location: location.trim() || null,
      booth_fee: money(boothFee),
      other_costs: money(otherCosts),
      start_time: startTime || null,
      end_time: endTime || null,
      start_cash: money(startCash),
      weather: weather.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (event) {
        await update.mutateAsync({ id: event.id, ...payload });
        toast.success('Market updated');
      } else {
        const created = await create.mutateAsync(payload);
        toast.success('Market created');
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const dollars = (label: string, value: string, set: (v: string) => void, id: string) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(e) => set(e.target.value)} className="pl-6" />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit market' : 'New market'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ev-name">Name</Label>
            <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday swap meet" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ev-date">Date</Label>
              <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-loc">Location</Label>
              <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {dollars('Booth fee', boothFee, setBoothFee, 'ev-booth')}
            {dollars('Other costs (gas, supplies)', otherCosts, setOtherCosts, 'ev-other')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ev-start">Opens</Label>
              <Input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-end">Closes</Label>
              <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {dollars('Starting cash (float)', startCash, setStartCash, 'ev-cash')}
            <div className="space-y-1">
              <Label htmlFor="ev-weather">Weather</Label>
              <Input id="ev-weather" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Sunny, windy…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-notes">Notes</Label>
            <Textarea id="ev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {event ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
