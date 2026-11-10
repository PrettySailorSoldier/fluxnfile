import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DollarSign,
  TrendingUp,
  Package,
  Truck,
  CreditCard,
  Plus,
  ExternalLink,
  RotateCcw,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Printer,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useSales, useUndoSale, MARKET_CHANNEL, type SaleRow } from '@/hooks/useMarket';
import { useItems, type Item, type ItemStatus } from '@/hooks/useInventory';
import { supabase } from '@/integrations/supabase/client';
import { TakePaymentDialog } from '@/components/sales/TakePaymentDialog';
import { sanitizeError } from '@/lib/errorHandler';
import { cn } from '@/lib/utils';

const money = (n: number) => `$${n.toFixed(2)}`;

export function OnlineSalesTracker() {
  const { data: sales = [], isLoading: salesLoading } = useSales();
  const { data: items = [] } = useItems();
  const undoSale = useUndoSale();

  const [takePaymentOpen, setTakePaymentOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [shippingDialogSale, setShippingDialogSale] = useState<SaleRow | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);

  // Map of items by ID for quick lookup
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Online sales (non-market sales or sales explicitly marked with online channels)
  const onlineSales = useMemo(() => {
    return sales
      .filter((s) => s.channel !== MARKET_CHANNEL)
      .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
  }, [sales]);

  // Filtered
  const filteredSales = useMemo(() => {
    return onlineSales.filter((s) => {
      if (channelFilter !== 'all' && s.channel !== channelFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const matchBuyer = s.buyer_name?.toLowerCase().includes(q);
      const matchNotes = s.notes?.toLowerCase().includes(q);
      const matchLines = s.lines.some(
        (l) => l.item?.title?.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q)
      );
      return matchBuyer || matchNotes || matchLines;
    });
  }, [onlineSales, channelFilter, search]);

  // Stats
  const stats = useMemo(() => {
    let revenue = 0;
    let fees = 0;
    let shipping = 0;
    let cost = 0;
    let toShipCount = 0;

    for (const s of onlineSales) {
      revenue += s.total;
      fees += s.fee_amount;
      shipping += s.shipping_cost;
      for (const l of s.lines) {
        if (l.item_id) {
          const it = itemsById.get(l.item_id);
          if (it) {
            cost += it.original_cost + (it.refurbish_cost || 0);
            if (it.status === 'sold' && s.shipping_cost > 0) {
              toShipCount++;
            }
          }
        }
      }
    }

    const netProfit = revenue - cost - fees - shipping;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return { revenue, netProfit, margin, count: onlineSales.length, toShipCount };
  }, [onlineSales, itemsById]);

  // Mark shipped handler
  const handleMarkShipped = async () => {
    if (!shippingDialogSale) return;
    setIsUpdatingTracking(true);
    try {
      const itemIds = shippingDialogSale.lines.map((l) => l.item_id).filter(Boolean) as string[];
      if (itemIds.length > 0) {
        const { error } = await supabase
          .from('items')
          .update({ status: 'shipped', delivery_status: 'shipped' })
          .in('id', itemIds);
        if (error) throw error;
      }
      if (trackingNumber.trim()) {
        const existingNotes = shippingDialogSale.notes || '';
        const notes = existingNotes ? `${existingNotes} · Tracking: ${trackingNumber.trim()}` : `Tracking: ${trackingNumber.trim()}`;
        const db = supabase as any;
        await db.from('sales').update({ notes }).eq('id', shippingDialogSale.id);
      }
      toast.success('Marked as shipped!');
      setShippingDialogSale(null);
      setTrackingNumber('');
    } catch (e) {
      toast.error(sanitizeError(e));
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const handleRefund = async (sale: SaleRow) => {
    if (!window.confirm(`Refund/Void this sale of ${money(sale.total)}? Items will return to inventory.`)) return;
    try {
      await undoSale.mutateAsync(sale);
      toast.success('Sale voided and items restored to inventory');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Online Sales & Payments
          </h3>
          <p className="text-xs text-muted-foreground">
            Take payments for Facebook Marketplace, remote sales, and shipped orders.
          </p>
        </div>
        <Button onClick={() => setTakePaymentOpen(true)} className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" /> Take Payment / New Sale
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> Online Revenue
            </p>
            <p className="text-xl font-bold text-foreground mt-1">{money(stats.revenue)}</p>
            <p className="text-[11px] text-muted-foreground">{stats.count} sales recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-600" /> Net Profit
            </p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">+{money(stats.netProfit)}</p>
            <p className="text-[11px] text-muted-foreground">{stats.margin.toFixed(0)}% profit margin</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> To Ship
            </p>
            <p className="text-xl font-bold text-foreground mt-1">{stats.toShipCount}</p>
            <p className="text-[11px] text-muted-foreground">Orders awaiting label/ship</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> Avg Sale
            </p>
            <p className="text-xl font-bold text-foreground mt-1">
              {stats.count > 0 ? money(stats.revenue / stats.count) : '$0.00'}
            </p>
            <p className="text-[11px] text-muted-foreground">Per online transaction</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by buyer, item, or notes…"
            className="pl-8 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-40 h-9 text-xs">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="Facebook Marketplace">Facebook Marketplace</SelectItem>
            <SelectItem value="Online">Online Link</SelectItem>
            <SelectItem value="eBay">eBay</SelectItem>
            <SelectItem value="OfferUp">OfferUp</SelectItem>
            <SelectItem value="Craigslist">Craigslist</SelectItem>
            <SelectItem value="In person">In person</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sales List */}
      {salesLoading ? (
        <p className="text-center py-8 text-sm text-muted-foreground">Loading online sales…</p>
      ) : filteredSales.length === 0 ? (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="py-10 text-center space-y-2">
            <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/60" />
            <p className="font-semibold text-sm">No online sales recorded yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              When an item sells on Facebook Marketplace or online, tap "Take Payment" to generate a live QR code, take
              card payment, and keep track of the sale.
            </p>
            <Button size="sm" variant="outline" onClick={() => setTakePaymentOpen(true)} className="mt-2">
              <Plus className="w-4 h-4 mr-1" /> Take Your First Payment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredSales.map((s) => {
            const first = s.lines[0];
            const item = first?.item_id ? itemsById.get(first.item_id) : null;
            const isShipped = item?.status === 'shipped';
            const hasShipping = s.shipping_cost > 0;

            return (
              <Card key={s.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">
                          {first?.item?.title || first?.description || 'Online Sale'}
                          {s.lines.length > 1 && ` (+${s.lines.length - 1} more)`}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                          {s.channel}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 capitalize font-normal">
                          {s.payment_method}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.buyer_name ? `Buyer: ${s.buyer_name} · ` : ''}
                        {new Date(s.sold_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold text-foreground tabular-nums">{money(s.total)}</p>
                      {s.fee_amount > 0 && (
                        <p className="text-[10px] text-muted-foreground">Fee: −{money(s.fee_amount)}</p>
                      )}
                    </div>
                  </div>

                  {/* Notes / Tracking status */}
                  {(s.notes || hasShipping) && (
                    <div className="text-xs bg-muted/50 rounded p-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-muted-foreground truncate max-w-[280px]">
                        {s.notes || (hasShipping ? `Shipping paid: ${money(s.shipping_cost)}` : '')}
                      </span>
                      {hasShipping && (
                        <Badge
                          variant={isShipped ? 'default' : 'destructive'}
                          className="text-[10px] py-0 px-1.5 font-normal"
                        >
                          {isShipped ? 'Shipped' : 'Needs Shipping'}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Quick action buttons */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t text-xs">
                    {hasShipping && !isShipped && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setShippingDialogSale(s)}
                      >
                        <Truck className="w-3.5 h-3.5 text-primary" /> Mark Shipped
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1"
                      onClick={() => setReceiptSale(s)}
                    >
                      <Printer className="w-3.5 h-3.5" /> Receipt
                    </Button>
                    {first?.item_id && (
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
                        <Link to={`/item/${first.item_id}`}>
                          <ExternalLink className="w-3.5 h-3.5" /> Item
                        </Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => handleRefund(s)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Void
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Take Payment Dialog */}
      <TakePaymentDialog open={takePaymentOpen} onOpenChange={setTakePaymentOpen} />

      {/* Mark Shipped Dialog */}
      <Dialog open={!!shippingDialogSale} onOpenChange={(o) => !o && setShippingDialogSale(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" /> Mark as Shipped
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Update order status to shipped and record tracking number for the buyer.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium">Tracking Number (optional)</label>
              <Input
                placeholder="e.g. 9400 1000 0000 0000 0000 00"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShippingDialogSale(null)}>
              Cancel
            </Button>
            <Button onClick={handleMarkShipped} disabled={isUpdatingTracking}>
              {isUpdatingTracking ? 'Updating…' : 'Confirm Shipped'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={!!receiptSale} onOpenChange={(o) => !o && setReceiptSale(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Sale Receipt</DialogTitle>
          </DialogHeader>
          {receiptSale && (
            <div className="space-y-3 text-xs border rounded-lg p-3 bg-muted/20 font-mono">
              <div className="text-center border-b pb-2">
                <p className="font-bold text-sm">FLUX & FILE</p>
                <p className="text-muted-foreground text-[10px]">Online Sales Ledger</p>
                <p className="text-muted-foreground text-[10px]">{new Date(receiptSale.sold_at).toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                {receiptSale.lines.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate max-w-[180px]">{l.item?.title || l.description || 'Item'}</span>
                    <span>{money(l.sold_price)}</span>
                  </div>
                ))}
                {receiptSale.shipping_cost > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span>{money(receiptSale.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-1 text-sm">
                  <span>TOTAL PAID</span>
                  <span>{money(receiptSale.total)}</span>
                </div>
              </div>
              <div className="border-t pt-2 space-y-0.5 text-muted-foreground text-[10px]">
                <p>Channel: {receiptSale.channel}</p>
                <p>Payment: {receiptSale.payment_method}</p>
                {receiptSale.buyer_name && <p>Buyer: {receiptSale.buyer_name}</p>}
                {receiptSale.notes && <p>Notes: {receiptSale.notes}</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!receiptSale) return;
                const text = `FLUX & FILE RECEIPT\nDate: ${new Date(receiptSale.sold_at).toLocaleDateString()}\nTotal: ${money(receiptSale.total)}\nChannel: ${receiptSale.channel}\nBuyer: ${receiptSale.buyer_name || 'Customer'}`;
                navigator.clipboard.writeText(text);
                toast.success('Receipt text copied!');
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy Text
            </Button>
            <Button size="sm" onClick={() => setReceiptSale(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
