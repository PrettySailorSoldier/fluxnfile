import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, PanelBottom, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavTabs } from '@/hooks/useNavTabs';
import { DEFAULT_NAV_TABS, MAX_NAV_TABS, NAV_DESTINATIONS } from '@/lib/navConfig';
import { sanitizeError } from '@/lib/errorHandler';

/** Pick which screens sit in your bottom bar (and their order); everything else lives in More. Saved per user. */
export function NavSettingsCard() {
  const { tabIds, setTabs, isSaving } = useNavTabs();
  const [draft, setDraft] = useState<string[]>(tabIds);

  // Follow the saved layout until the user starts editing
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(tabIds);
  }, [tabIds, dirty]);

  const edit = (next: string[]) => {
    setDraft(next);
    setDirty(true);
  };

  const full = draft.length >= MAX_NAV_TABS;
  const toggle = (id: string) =>
    edit(draft.includes(id) ? draft.filter((x) => x !== id) : full ? draft : [...draft, id]);
  const move = (id: string, dir: -1 | 1) => {
    const i = draft.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    edit(next);
  };

  const save = async () => {
    try {
      await setTabs(draft);
      setDirty(false);
      toast.success('Navigation saved');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PanelBottom className="w-4 h-4" />
          Navigation
        </CardTitle>
        <CardDescription>
          Choose up to {MAX_NAV_TABS} screens for your bottom bar ({draft.length}/{MAX_NAV_TABS}); the rest stay in More. The +
          and More buttons are always there. This only changes your own bar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {draft.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">In the bar</p>}
        {draft.map((id, idx) => {
          const d = NAV_DESTINATIONS.find((x) => x.id === id);
          if (!d) return null;
          const Icon = d.icon;
          return (
            <div key={id} className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
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
            <div key={d.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
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

        {draft.length === 0 && (
          <p className="text-xs text-muted-foreground pt-2">Nothing selected — saving will restore the default tabs.</p>
        )}

        <div className="flex gap-2 pt-3">
          <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={() => edit(DEFAULT_NAV_TABS)}>
            <RotateCcw className="w-3 h-3" /> Defaults
          </Button>
          <Button size="sm" className="flex-1" onClick={save} disabled={!dirty || isSaving}>
            {isSaving ? 'Saving…' : dirty ? 'Save navigation' : 'Saved ✓'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
