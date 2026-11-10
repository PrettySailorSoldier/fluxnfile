import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CreditCard,
  DollarSign,
  Package,
  Truck,
  Store,
  ExternalLink,
  RotateCcw,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Copy,
  Plus,
  Users,
  Download,
  Filter,
  FileSpreadsheet,
  AlertCircle,
  QrCode,
  MapPin,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSales, useUndoSale, useEvents, MARKET_CHANNEL, type SaleRow } from '@/hooks/useMarket';
import { useItems, type Item } from '@/hooks/useInventory';
import { useTeamMembers, memberName } from '@/hooks/useTeam';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { TakePaymentDialog } from '@/components/sales/TakePaymentDialog';
import { sanitizeError } from '@/lib/errorHandler';
import { itemBasis } from '@/lib/market';
import { parseLocalDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

const money = (n: number) => `$${n.toFixed(2)}`;

export default function Sales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { data: sales = [], isLoading: salesLoading } = useSales();
  const { data: items = [] } = useItems();
  const { data: events = [] } = useEvents();
  const { data: teamMembers = [] } = useTeamMembers();
  const undoSale = useUndoSale();

  // If URL has ?action=pay, automatically open payment dialog
  const [takePaymentOpen, setTakePaymentOpen] = useState(searchParams.get('action') === 'pay');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'market' | 'facebook' | 'meetup' | 'online'>('all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'all' | 'needs_shipping' | 'shipped'>('all');

  // Modals
  const [shippingDialogSale, setShippingDialogSale] = useState<SaleRow | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);
  const [undoDialogSale, setUndoDialogSale] = useState<SaleRow | null>(null);

  // Quick lookup maps
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // Today in local format YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // Channel filter
      if (channelFilter === 'market') {
        const isMarket = s.channel === MARKET_CHANNEL || s.event_id != null || s.channel.toLowerCase().includes('market');
        if (!isMarket) return false;
      } else if (channelFilter === 'facebook') {
        if (!s.channel.toLowerCase().includes('facebook')) return false;
      } else if (channelFilter === 'meetup') {
        const isMeetup = s.channel.toLowerCase().includes('in person') || s.channel.toLowerCase().includes('meetup');
        if (!isMeetup) return false;
      } else if (channelFilter === 'online') {
        const isOnline =
          s.channel.toLowerCase().includes('online') ||
          s.channel.toLowerCase().includes('ebay') ||
          s.channel.toLowerCase().includes('offerup') ||
          s.channel.toLowerCase().includes('craigslist') ||
          s.shipping_cost > 0;
        if (!isOnline) return false;
      }

      // Fulfillment filter
      if (fulfillmentFilter === 'needs_shipping') {
        const needsShipping = s.lines.some((l) => {
          if (!l.item_id) return false;
          const it = itemsById.get(l.item_id);
          return it?.status === 'sold' && s.shipping_cost > 0;
        });
        if (!needsShipping) return false;
      } else if (fulfillmentFilter === 'shipped') {
        const hasShipped = s.lines.some((l) => {
          if (!l.item_id) return false;
          const it = itemsById.get(l.item_id);
          return it?.status === 'shipped';
        });
        if (!hasShipped) return false;
      }

      // Search query
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const matchBuyer = s.buyer_name?.toLowerCase().includes(q);
      const matchNotes = s.notes?.toLowerCase().includes(q);
      const matchMethod = s.payment_method?.toLowerCase().includes(q);
      const matchEvent = s.event_id ? eventsById.get(s.event_id)?.name?.toLowerCase().includes(q) : false;
      const matchLines = s.lines.some(
        (l) => l.item?.title?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q)
      );
      return matchBuyer || matchNotes || matchMethod || matchEvent || matchLines;
    });
  }, [sales, channelFilter, fulfillmentFilter, search, itemsById, eventsById]);

  // Real-time team metrics
  const stats = useMemo(() => {
    let todayRev = 0;
    let todayFlea = 0;
    let todayOnline = 0;
    let todayCost = 0;
    let todayFees = 0;
    let todayShipping = 0;
    let todayCount = 0;
    let totalAwaitingShipping = 0;

    for (const s of sales) {
      const soldDate = (s.sold_at || '').slice(0, 10);
      const isToday = soldDate === todayStr;

      // Check shipping need
      for (const l of s.lines) {
        if (l.item_id) {
          const it = itemsById.get(l.item_id);
          if (it?.status === 'sold' && s.shipping_cost > 0) {
            totalAwaitingShipping++;
          }
        }
      }

      if (isToday) {
        todayRev += s.total;
        todayFees += s.fee_amount;
        todayShipping += s.shipping_cost;
        todayCount++;

        const isMarket = s.channel === MARKET_CHANNEL || s.event_id != null || s.channel.toLowerCase().includes('market');
        if (isMarket) {
          todayFlea += s.total;
        } else {
          todayOnline += s.total;
        }

        for (const l of s.lines) {
          if (l.item_id) {
            const it = itemsById.get(l.item_id);
            if (it) {
              todayCost += it.original_cost + (it.refurbish_cost || 0);
            }
          }
        }
      }
    }

    const todayProfit = todayRev - todayCost - todayFees - todayShipping;

    return {
      todayRev,
      todayFlea,
      todayOnline,
      todayProfit,
      todayCount,
      totalAwaitingShipping,
    };
  }, [sales, itemsById, todayStr]);

  // Mark shipped handler
  const handleMarkShipped = async () => {
    if (!shippingDialogSale) return;
    setIsUpdatingTracking(true);
    try {
      const itemIds = shippingDialogSale.lines.map((l) => l.item_id).filter(Boolean) as string[];
      if (itemIds.length > 0) {
        const { error } = await supabase
          .from('items')
          .update({ status: 'shipped', delivery_status: 'shipped' } as any)
          .in('id', itemIds);
        if (error) throw error;
      }
      if (trackingNumber.trim()) {
        const existingNotes = shippingDialogSale.notes || '';
        const notes = existingNotes
          ? `${existingNotes} · Tracking: ${trackingNumber.trim()}`
          : `Tracking: ${trackingNumber.trim()}`;
        const db = supabase as any;
        await db.from('sales').update({ notes }).eq('id', shippingDialogSale.id);
      }
      toast.success('Items marked as shipped!');
      setShippingDialogSale(null);
      setTrackingNumber('');
    } catch (e) {
      toast.error(sanitizeError(e));
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  // Undo / Void Sale
  const handleConfirmUndo = async () => {
    if (!undoDialogSale) return;
    try {
      await undoSale.mutateAsync(undoDialogSale);
      toast.success('Sale voided and items restored to inventory');
      setUndoDialogSale(null);
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  // Export Sales to CSV
  const handleExportCSV = () => {
    if (filteredSales.length === 0) {
      toast.error('No sales to export');
      return;
    }
    const headers = [
      'Sale Date',
      'Time',
      'Channel',
      'Event',
      'Payment Method',
      'Buyer Name',
      'Items',
      'Total Paid',
      'Fee',
      'Shipping',
      'Net Profit',
      'Recorded By',
      'Notes',
    ];

    const rows = filteredSales.map((s) => {
      const dateObj = new Date(s.sold_at);
      const evName = s.event_id ? eventsById.get(s.event_id)?.name || '' : '';
      const itemsList = s.lines.map((l) => l.item?.title || l.description || 'Item').join('; ');
      const recordedByName = memberName(teamMembers, s.created_by, user?.id) || 'Teammate';

      let lineCost = 0;
      for (const l of s.lines) {
        if (l.item_id) {
          const it = itemsById.get(l.item_id);
          if (it) lineCost += itemBasis(it);
        }
      }
      const netProfit = s.total - lineCost - s.fee_amount - s.shipping_cost;

      return [
        `"${dateObj.toLocaleDateString()}"`,
        `"${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}"`,
        `"${s.channel}"`,
        `"${evName}"`,
        `"${s.payment_method}"`,
        `"${(s.buyer_name || '').replace(/"/g, '""')}"`,
        `"${itemsList.replace(/"/g, '""')}"`,
        s.total.toFixed(2),
        s.fee_amount.toFixed(2),
        s.shipping_cost.toFixed(2),
        netProfit.toFixed(2),
        `"${recordedByName}"`,
        `"${(s.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `team-sales-${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Sales CSV downloaded');
  };

  return (
    <div className="p-4 space-y-6 pb-28 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
            <DollarSign className="w-6 h-6 text-primary" />
            Sales Hub
          </h1>
          <p className="text-sm text-muted-foreground">
            Take payments and track team sales across flea markets, online, and meetups
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <Button
            onClick={() => setTakePaymentOpen(true)}
            className="gap-1.5 shadow-sm flex-1 sm:flex-none"
            size="default"
          >
            <CreditCard className="w-4 h-4" /> Take Payment & Sell
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="gap-1.5 flex-shrink-0"
            size="default"
          >
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Real-time Team Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Sales</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{money(stats.todayRev)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.todayCount} sale{stats.todayCount !== 1 ? 's' : ''} across team
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Flea Markets</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{money(stats.todayFlea)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">In-person booths today</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Online & Meetups</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{money(stats.todayOnline)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">FB, shipping & meetups</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Profit</p>
            <p className={cn('text-2xl font-bold mt-1', stats.todayProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
              {stats.todayProfit >= 0 ? '+' : ''}
              {money(stats.todayProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Net after cost, fees & ship</p>
          </CardContent>
        </Card>
      </div>

      {/* Needs Shipping Alert Banner */}
      {stats.totalAwaitingShipping > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {stats.totalAwaitingShipping} item{stats.totalAwaitingShipping !== 1 ? 's' : ''} awaiting shipping
              </p>
              <p className="text-xs text-muted-foreground">Orders marked for delivery that haven't been fulfilled yet</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setFulfillmentFilter(fulfillmentFilter === 'needs_shipping' ? 'all' : 'needs_shipping')}
          >
            {fulfillmentFilter === 'needs_shipping' ? 'Show All' : 'View Orders'}
          </Button>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="space-y-3">
        <Tabs value={channelFilter} onValueChange={(val: any) => setChannelFilter(val)}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="all">All Channels</TabsTrigger>
            <TabsTrigger value="market" className="gap-1">
              <Store className="w-3.5 h-3.5" /> Markets
            </TabsTrigger>
            <TabsTrigger value="facebook" className="gap-1">
              Facebook
            </TabsTrigger>
            <TabsTrigger value="meetup" className="gap-1">
              <Users className="w-3.5 h-3.5" /> Meetups
            </TabsTrigger>
            <TabsTrigger value="online" className="gap-1">
              <Truck className="w-3.5 h-3.5" /> Shipped
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by buyer, item title, notes, or payment..."
              className="pl-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {fulfillmentFilter !== 'all' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFulfillmentFilter('all')}
              className="text-xs"
            >
              Reset Filter
            </Button>
          )}
        </div>
      </div>

      {/* Sales Feed / Ledger */}
      {salesLoading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Loading sales ledger...</div>
      ) : filteredSales.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Package className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
            <p className="font-semibold text-foreground">No sales found</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Ring up a sale at a flea market, record a Facebook Marketplace deal, or take a card payment.
            </p>
            <Button onClick={() => setTakePaymentOpen(true)} className="gap-1.5 mt-2">
              <CreditCard className="w-4 h-4" /> Take Payment & Sell
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSales.map((sale) => {
            const saleDateObj = new Date(sale.sold_at);
            const timeStr = saleDateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const dateStr = saleDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isFlea = sale.channel === MARKET_CHANNEL || sale.event_id != null || sale.channel.toLowerCase().includes('market');
            const eventObj = sale.event_id ? eventsById.get(sale.event_id) : null;
            const recordedByName = memberName(teamMembers, sale.created_by, user?.id);

            // Compute line costs for net profit
            let lineCost = 0;
            let needsShipping = false;
            let isShipped = false;

            for (const l of sale.lines) {
              if (l.item_id) {
                const it = itemsById.get(l.item_id);
                if (it) {
                  lineCost += itemBasis(it);
                  if (it.status === 'sold' && sale.shipping_cost > 0) needsShipping = true;
                  if (it.status === 'shipped') isShipped = true;
                }
              }
            }
            const profit = sale.total - lineCost - sale.fee_amount - sale.shipping_cost;

            return (
              <Card key={sale.id} className="overflow-hidden hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  {/* Top Row: Channel, Event, Teammate & Date */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'capitalize font-medium gap-1',
                          isFlea && 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
                          sale.channel.toLowerCase().includes('facebook') && 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
                          sale.channel.toLowerCase().includes('in person') && 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                        )}
                      >
                        {isFlea ? <Store className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                        {isFlea ? 'Flea Market' : sale.channel}
                      </Badge>

                      {eventObj && (
                        <Badge variant="outline" className="text-xs gap-1 border-muted-foreground/30">
                          <MapPin className="w-2.5 h-2.5" />
                          {eventObj.name}
                        </Badge>
                      )}

                      <Badge variant="outline" className="capitalize text-xs">
                        {sale.payment_method}
                      </Badge>

                      {needsShipping && (
                        <Badge className="bg-amber-500 text-white text-[10px] gap-1">
                          <Truck className="w-2.5 h-2.5" /> Needs Shipping
                        </Badge>
                      )}

                      {isShipped && (
                        <Badge variant="secondary" className="text-[10px] text-green-700 dark:text-green-400 gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Shipped
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      {recordedByName && (
                        <span className="font-medium text-foreground">
                          {recordedByName === 'You' ? 'You' : `By ${recordedByName}`}
                        </span>
                      )}
                      <span>·</span>
                      <span>
                        {dateStr} at {timeStr}
                      </span>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="space-y-1.5 pt-1">
                    {sale.lines.map((line, idx) => {
                      const itemTitle = line.item?.title || line.description || 'Custom Item';
                      const itemObj = line.item_id ? itemsById.get(line.item_id) : null;
                      const itemPhoto = itemObj?.photos?.[0];
                      return (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            {itemPhoto ? (
                              <img src={itemPhoto} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              {line.item_id ? (
                                <Link
                                  to={`/item/${line.item_id}`}
                                  className="font-medium hover:underline text-foreground truncate block max-w-xs sm:max-w-md"
                                >
                                  {itemTitle}
                                </Link>
                              ) : (
                                <span className="font-medium text-foreground truncate block max-w-xs sm:max-w-md">
                                  {itemTitle}
                                </span>
                              )}
                              {line.tag_price && line.tag_price !== line.sold_price && (
                                <span className="text-xs text-muted-foreground">
                                  Tag: {money(line.tag_price)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-semibold text-foreground flex-shrink-0 ml-2">
                            {money(line.sold_price)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Buyer & Notes info */}
                  {(sale.buyer_name || sale.notes) && (
                    <div className="bg-muted/40 rounded-lg p-2 text-xs text-muted-foreground space-y-0.5">
                      {sale.buyer_name && (
                        <p>
                          <span className="font-medium text-foreground">Buyer:</span> {sale.buyer_name}
                        </p>
                      )}
                      {sale.notes && (
                        <p>
                          <span className="font-medium text-foreground">Notes:</span> {sale.notes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Financial Breakdown & Actions */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-bold text-sm text-foreground">{money(sale.total)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Profit: </span>
                        <span
                          className={cn(
                            'font-semibold',
                            profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                          )}
                        >
                          {profit >= 0 ? '+' : ''}
                          {money(profit)}
                        </span>
                      </div>
                      {sale.fee_amount > 0 && (
                        <span className="text-muted-foreground hidden sm:inline">Fee {money(sale.fee_amount)}</span>
                      )}
                      {sale.shipping_cost > 0 && (
                        <span className="text-muted-foreground hidden sm:inline">Ship {money(sale.shipping_cost)}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {needsShipping && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-amber-500/50 hover:bg-amber-500/10"
                          onClick={() => {
                            setShippingDialogSale(sale);
                            setTrackingNumber('');
                          }}
                        >
                          <Truck className="w-3 h-3 text-amber-600 dark:text-amber-400" /> Ship
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setReceiptSale(sale)}
                      >
                        Receipt
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => setUndoDialogSale(sale)}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Void
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Global Take Payment Dialog */}
      <TakePaymentDialog open={takePaymentOpen} onOpenChange={setTakePaymentOpen} />

      {/* Shipping / Fulfillment Modal */}
      <Dialog open={!!shippingDialogSale} onOpenChange={(open) => !open && setShippingDialogSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" /> Fulfill & Mark Shipped
            </DialogTitle>
            <DialogDescription>
              Mark order items as shipped and save carrier tracking details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Carrier Tracking Number (Optional)</label>
              <Input
                placeholder="e.g. 9400 1000 0000 0000 0000 00 (USPS / UPS / FedEx)"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Tracking numbers automatically generate direct tracking links for buyers.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShippingDialogSale(null)}>
              Cancel
            </Button>
            <Button onClick={handleMarkShipped} disabled={isUpdatingTracking}>
              {isUpdatingTracking ? 'Saving...' : 'Confirm Shipped'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={!!receiptSale} onOpenChange={(open) => !open && setReceiptSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" /> Sale Receipt
            </DialogTitle>
          </DialogHeader>

          {receiptSale && (
            <div className="space-y-3 py-2 text-sm">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1.5 border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span>{new Date(receiptSale.sold_at).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Channel:</span>
                  <span className="capitalize">{receiptSale.channel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="capitalize">{receiptSale.payment_method}</span>
                </div>
                {receiptSale.buyer_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buyer:</span>
                    <span>{receiptSale.buyer_name}</span>
                  </div>
                )}
                <div className="border-t pt-1.5 flex justify-between font-bold text-base">
                  <span>Total:</span>
                  <span>{money(receiptSale.total)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Line Items</p>
                {receiptSale.lines.map((l, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5">
                    <span className="truncate max-w-[250px]">{l.item?.title || l.description || 'Item'}</span>
                    <span className="font-medium">{money(l.sold_price)}</span>
                  </div>
                ))}
              </div>

              <Button
                className="w-full mt-2"
                variant="outline"
                onClick={() => {
                  const summary = receiptSale.lines.map((l) => l.item?.title || l.description || 'Item').join(', ');
                  const text = `Receipt\nItems: ${summary}\nTotal Paid: ${money(receiptSale.total)}\nMethod: ${receiptSale.payment_method}\nDate: ${new Date(receiptSale.sold_at).toLocaleDateString()}`;
                  navigator.clipboard.writeText(text);
                  toast.success('Receipt copied to clipboard!');
                }}
              >
                <Copy className="w-4 h-4 mr-1.5" /> Copy Text for Buyer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Undo Confirmation Alert */}
      <AlertDialog open={!!undoDialogSale} onOpenChange={(open) => !open && setUndoDialogSale(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the sale record and return all line items back to their previous inventory status.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUndo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Void Sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
