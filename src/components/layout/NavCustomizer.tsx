import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useNavTabs } from '@/hooks/useNavTabs';
import { DEFAULT_NAV_TABS, MAX_NAV_TABS, NAV_DESTINATIONS } from '@/lib/navConfig';
import { sanitizeError } from '@/lib/errorHandler';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick which screens sit in the bottom bar (and their order); everything else lives in More. */
export function NavCustomizer({ open, onOpenChange }: Props) {
  const { tabIds, setTabs, isSaving } = useNavTabs();
  const [draft, setDraft] = useState<string[]>(tabIds);

  useEffect(() => {
    if (open) setDraft(tabIds);
    // only reset when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const full = draft.length >= MAX_NAV_TABS;
  const toggle = (id: string) =>
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length >= MAX_NAV_TABS ? d : [...d, id]));
  const move = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const i = d.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    try {
      await setTabs(draft);
      toast.success('Navigation saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]">
        <SheetHeader className="text-left pb-2">
          <SheetTitle>Customize navigation</SheetTitle>
          <SheetDescription>
            Choose up to {MAX_NAV_TABS} screens for the bottom bar ({draft.length}/{MAX_NAV_TABS}). The rest stay in More. The + and More
            buttons are always there.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-1">
          {/* Bar first, in order */}
          {draft.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">In the bar</p>}
          {draft.map((id, idx) => {
            const d = NAV_DESTINATIONS.find((x) => x.id === id);
            if (!d) return null;
            const Icon = d.icon;
            return (
              <div key={id} className="flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-2">
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-sm font-medium">{d.label}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={idx === 0} onClick={() => move(id, -1)} aria-label={`Move ${d.label} earlier`}>
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={idx === draft.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${d.label} later`}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => toggle(id)}>
                  Remove
                </Button>
              </div>
            );
          })}

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-3">In More</p>
          {NAV_DESTINATIONS.filter((d) => !draft.includes(d.id)).map((d) => {
            const Icon = d.icon;
            return (
              <div key={d.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2', 'hover:bg-muted')}>
                <Icon className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{d.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{d.description}</span>
                </span>
                <Button size="sm" variant="outline" className="h-8" disabled={full} onClick={() => toggle(d.id)}>
                  Add to bar
                </Button>
              </div>
            );
          })}
        </div>

        {draft.length === 0 && (
          <p className="text-xs text-muted-foreground pt-2">Nothing selected — saving will restore the default tabs.</p>
        )}

        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="gap-2" onClick={() => setDraft(DEFAULT_NAV_TABS)}>
            <RotateCcw className="w-4 h-4" /> Defaults
          </Button>
          <Button className="flex-1" onClick={save} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
