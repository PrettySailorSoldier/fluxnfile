import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { CalendarClock, Flag, HandCoins, Store } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import type { Item } from '@/hooks/useInventory';
import { MARKET_CHANNEL, useEvents, useSales } from '@/hooks/useMarket';
import { useUpcomingMeetups } from '@/hooks/useMeetups';
import { memberName, useTeamMembers } from '@/hooks/useTeam';

const money = (n: number) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
const WEEK = 7 * 86_400_000;

/**
 * The team's shared picture on the home screen: who sold what and where, which
 * meetups are coming, what's waiting on you. Partners working in different
 * places see the same thing without having to ask.
 */
export function TeamActivity({ items }: { items: Item[] }) {
  const { user } = useAuth();
  const { data: members = [] } = useTeamMembers();
  const { data: sales = [] } = useSales();
  const { data: events = [] } = useEvents();
  const { data: meetups = [] } = useUpcomingMeetups();

  const eventName = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);
  const recent = useMemo(() => [...sales].sort((a, b) => b.sold_at.localeCompare(a.sold_at)).slice(0, 6), [sales]);

  const week = useMemo(() => {
    const since = Date.now() - WEEK;
    const byChannel = new Map<string, number>();
    let total = 0;
    for (const s of sales) {
      if (new Date(s.sold_at).getTime() < since) continue;
      const net = s.total - s.tax_amount;
      total += net;
      const label = s.channel === MARKET_CHANNEL ? 'Markets' : s.channel;
      byChannel.set(label, (byChannel.get(label) ?? 0) + net);
    }
    return { total, byChannel: [...byChannel.entries()].sort((a, b) => b[1] - a[1]) };
  }, [sales]);

  const flaggedForMe = items.filter((i) => i.flagged_for && i.flagged_for === user?.id).length;
  const openMarket = events.find((e) => e.status === 'open');

  if (recent.length === 0 && meetups.length === 0 && flaggedForMe === 0 && !openMarket) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>Team activity</span>
          {week.total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">{money(week.total)} sold in 7 days</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {week.byChannel.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {week.byChannel.map(([label, total]) => (
              <Badge key={label} variant="secondary" className="font-normal">
                {label} · {money(total)}
              </Badge>
            ))}
          </div>
        )}

        {openMarket && (
          <Link to={`/market/${openMarket.id}`} className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
            <Store className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium">{openMarket.name}</span> is open — sales show here live
            </span>
          </Link>
        )}

        {flaggedForMe > 0 && (
          <Link to="/inventory?show=flagged" className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
            <Flag className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="flex-1">
              {flaggedForMe} item{flaggedForMe === 1 ? '' : 's'} flagged for you
            </span>
          </Link>
        )}

        {meetups.slice(0, 3).map((m) => (
          <Link key={m.id} to={`/item/${m.item_id}`} className="flex items-center gap-2 text-sm">
            <CalendarClock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">
              Meetup: {m.item?.title || 'an item'}
              {m.buyer_name ? ` with ${m.buyer_name}` : ''}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {format(new Date(m.scheduled_at), 'EEE h:mm a')}
              {m.created_by && ` · ${memberName(members, m.created_by, user?.id)}`}
            </span>
          </Link>
        ))}

        {recent.map((s) => {
          const first = s.lines[0];
          const what = first?.item?.title || first?.description || (s.lines.length ? 'Quick sale' : 'Sale');
          const where = s.channel === MARKET_CHANNEL ? (s.event_id && eventName.get(s.event_id)) || 'Market' : s.channel;
          const to = s.event_id ? `/market/${s.event_id}` : first?.item_id ? `/item/${first.item_id}` : '/analytics';
          return (
            <Link key={s.id} to={to} className="flex items-center gap-2 text-sm">
              <HandCoins className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block truncate">
                  {memberName(members, s.created_by, user?.id) ?? 'Someone'} sold {what}
                  {s.lines.length > 1 && ` + ${s.lines.length - 1} more`}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  {where} · {formatDistanceToNow(new Date(s.sold_at), { addSuffix: true })}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{money(s.total)}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
