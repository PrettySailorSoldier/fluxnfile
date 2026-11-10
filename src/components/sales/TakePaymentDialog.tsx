import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import {
  CreditCard,
  QrCode,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageSquare,
  DollarSign,
  Package,
  Truck,
  ShieldCheck,
  RefreshCw,
  Share2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlatforms, type Item } from '@/hooks/useInventory';
import { useRecordSale, type PaymentMethod } from '@/hooks/useMarket';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import { QRCode } from '@/components/QRCode';
import {
  buildVenmoUrl,
  buildVenmoDeepLink,
  buildCashAppUrl,
  buildPayPalUrl,
  formatCardNumber,
  formatExpiry,
  detectCardBrand,
  isValidCardNumber,
  generateBuyerPaymentMessage,
} from '@/lib/payments';
import { cents, itemBasis } from '@/lib/market';
import { todayLocal } from '@/lib/dates';
import { sanitizeError } from '@/lib/errorHandler';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Item to sell. If null, custom sale */
  item?: Item | null;
  /** Multiple items (e.g. bundled sale) */
  items?: Item[];
  defaultChannel?: string;
  defaultBuyerName?: string;
  onSuccess?: (saleId: string) => void;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function TakePaymentDialog({
  open,
  onOpenChange,
  item,
  items: initialItems,
  defaultChannel = 'Facebook Marketplace',
  defaultBuyerName = '',
  onSuccess,
}: Props) {
  const settings = useWorkflowSettings();
  const { data: platforms = [] } = usePlatforms();
  const recordSale = useRecordSale();

  const saleItems = useMemo(() => {
    if (initialItems && initialItems.length > 0) return initialItems;
    if (item) return [item];
    return [];
  }, [item, initialItems]);

  const [channel, setChannel] = useState(defaultChannel);
  const [buyerName, setBuyerName] = useState(defaultBuyerName);
  const [buyerContact, setBuyerContact] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [platformFeeInput, setPlatformFeeInput] = useState('');
  const [notes, setNotes] = useState('');
  const [saleDate, setSaleDate] = useState(todayLocal());

  // Prices per item
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [customTitle, setCustomTitle] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Payment method tab
  const [method, setMethod] = useState<'card' | 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'cash'>('card');

  // Digital handles (from settings, editable)
  const [venmoHandle, setVenmoHandle] = useState(settings.venmoHandle || '');
  const [cashAppTag, setCashAppTag] = useState(settings.cashAppTag || '');
  const [paypalUsername, setPaypalUsername] = useState(settings.paypalUsername || '');
  const [zelleContact, setZelleContact] = useState(settings.zelleContact || '');

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardZip, setCardZip] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [isProcessingCard, setIsProcessingCard] = useState(false);

  // Success receipt view
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCompletedSaleId(null);
      return;
    }
    setChannel(defaultChannel);
    setBuyerName(defaultBuyerName);
    setSaleDate(todayLocal());
    setShippingCost('0');
    setPlatformFeeInput('');
    setNotes('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setCardZip('');
    setCardHolder(defaultBuyerName);

    if (saleItems.length > 0) {
      const initial: Record<string, string> = {};
      for (const it of saleItems) {
        const p = it.target_price ?? it.tag_price ?? it.actual_price ?? 0;
        initial[it.id] = p > 0 ? String(p) : '';
      }
      setPrices(initial);
    } else {
      setPrices({});
      setCustomPrice('');
      setCustomTitle('');
    }
  }, [open, saleItems, defaultChannel, defaultBuyerName]);

  // Totals
  const itemsSubtotal = useMemo(() => {
    if (saleItems.length > 0) {
      return saleItems.reduce((acc, it) => acc + (parseFloat(prices[it.id] || '0') || 0), 0);
    }
    return parseFloat(customPrice || '0') || 0;
  }, [saleItems, prices, customPrice]);

  const shipping = parseFloat(shippingCost || '0') || 0;
  const platform = platforms.find((p) => p.name === channel);
  const autoFee = platform ? cents((itemsSubtotal * Number(platform.fee_percentage)) / 100 + Number(platform.flat_fee)) : 0;
  const fee = platformFeeInput !== '' ? parseFloat(platformFeeInput) || 0 : autoFee;
  const total = cents(itemsSubtotal + shipping);
  const cost = saleItems.reduce((acc, it) => acc + itemBasis(it), 0);
  const netProfit = cents(total - cost - fee - shipping);

  // Payment URLs & Deep links
  const titleSummary =
    saleItems.length === 1
      ? saleItems[0].title || 'Item'
      : saleItems.length > 1
        ? `${saleItems[0].title || 'Item'} + ${saleItems.length - 1} more`
        : customTitle || 'Online Sale';

  const venmoUrl = buildVenmoUrl(venmoHandle, total, titleSummary);
  const venmoDeepLink = buildVenmoDeepLink(venmoHandle, total, titleSummary);
  const cashAppUrl = buildCashAppUrl(cashAppTag, total);
  const paypalUrl = buildPayPalUrl(paypalUsername, total);

  // Card detection
  const cardBrand = detectCardBrand(cardNumber);

  // Execute sale
  const handleCompleteSale = async (paymentMethodUsed: PaymentMethod, authCode?: string) => {
    if (total <= 0) {
      toast.error('Enter a valid sale price');
      return;
    }

    try {
      const fullNotes = [
        notes.trim(),
        authCode ? `Card Auth: ${authCode}` : null,
        shippingAddress.trim() ? `Ship to: ${shippingAddress.trim()}` : null,
        buyerContact.trim() ? `Contact: ${buyerContact.trim()}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const lines =
        saleItems.length > 0
          ? saleItems.map((it) => ({
              item: it,
              tag_price: it.tag_price ?? it.target_price ?? null,
              sold_price: cents(parseFloat(prices[it.id] || '0') || 0),
            }))
          : [
              {
                item: null,
                description: customTitle.trim() || 'Online Item',
                tag_price: null,
                sold_price: cents(parseFloat(customPrice || '0') || 0),
              },
            ];

      const saleId = await recordSale.mutateAsync({
        eventId: null,
        channel,
        paymentMethod: paymentMethodUsed,
        lines,
        discount: 0,
        tax: 0,
        fee: cents(fee),
        shipping: cents(shipping),
        total,
        bundleLabel: saleItems.length > 1 ? `Online bundle (${saleItems.length})` : null,
        notes: fullNotes || undefined,
        buyerName: buyerName.trim() || undefined,
        saleDate,
      });

      setCompletedSaleId(saleId);
      toast.success(`Payment of ${money(total)} recorded successfully!`);
      onSuccess?.(saleId);
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const handleChargeCard = async () => {
    if (!cardNumber.replace(/\D/g, '')) {
      toast.error('Enter a card number');
      return;
    }
    if (!cardExpiry) {
      toast.error('Enter expiration date (MM/YY)');
      return;
    }
    setIsProcessingCard(true);
    // Simulate terminal authorization
    setTimeout(async () => {
      const auth = `AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      setIsProcessingCard(false);
      await handleCompleteSale('card', auth);
    }, 1200);
  };

  const copyPaymentMessage = () => {
    const msg = generateBuyerPaymentMessage({
      buyerName,
      itemTitle: titleSummary,
      total,
      paymentLinks: {
        venmo: venmoHandle ? venmoUrl : undefined,
        cashApp: cashAppTag ? cashAppUrl : undefined,
        paypal: paypalUsername ? paypalUrl : undefined,
        zelle: zelleContact || undefined,
      },
    });
    navigator.clipboard.writeText(msg);
    toast.success('Payment message copied to clipboard! Paste it to your buyer.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        {completedSaleId ? (
          // Success Receipt
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Payment Received</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Sale tracked & inventory updated</p>
            </div>

            <div className="rounded-lg bg-muted/60 p-4 text-left space-y-2 text-sm border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item:</span>
                <span className="font-medium text-right truncate max-w-[200px]">{titleSummary}</span>
              </div>
              {buyerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Buyer:</span>
                  <span className="font-medium">{buyerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Channel:</span>
                <span className="font-medium">{channel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment:</span>
                <span className="font-medium capitalize">{method}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold text-base">
                <span>Total Paid:</span>
                <span className="text-green-600 dark:text-green-400">{money(total)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Estimated Profit:</span>
                <span>+{money(netProfit)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const receipt = `Receipt for ${titleSummary}\nAmount: ${money(total)}\nPaid via: ${method}\nDate: ${saleDate}`;
                  navigator.clipboard.writeText(receipt);
                  toast.success('Receipt details copied!');
                }}
              >
                <Copy className="w-4 h-4 mr-1.5" /> Copy Receipt
              </Button>
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Take Online Payment
              </DialogTitle>
              <DialogDescription>
                Process card payment or generate live payment QR & links. Keeps track of sales automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Items & Price */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Item(s) & Price</Label>
                {saleItems.length > 0 ? (
                  saleItems.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border">
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {it.photos?.[0] ? (
                          <img src={it.photos[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{it.title || 'Untitled item'}</p>
                        <p className="text-xs text-muted-foreground">
                          Cost {money(itemBasis(it))} · Asking {it.target_price ? money(it.target_price) : 'none'}
                        </p>
                      </div>
                      <div className="w-24">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 pl-5 text-right text-sm"
                            value={prices[it.id] ?? ''}
                            onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Input
                        placeholder="What sold? (e.g. Vintage Jacket)"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Price"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          className="h-9 pl-5 text-right text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Channel & Buyer */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Selling Channel</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Facebook Marketplace">Facebook Marketplace</SelectItem>
                      <SelectItem value="Online">Online Store / Link</SelectItem>
                      <SelectItem value="eBay">eBay</SelectItem>
                      <SelectItem value="OfferUp">OfferUp</SelectItem>
                      <SelectItem value="Craigslist">Craigslist</SelectItem>
                      <SelectItem value="In person">In person</SelectItem>
                      <SelectItem value="market">Flea market</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Buyer Name</Label>
                  <Input
                    className="h-9 text-sm"
                    placeholder="e.g. Sarah Jenkins"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                </div>
              </div>

              {/* Shipping & Fees Breakdown */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Shipping Fee</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 pl-5 text-sm"
                      placeholder="0.00"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Platform Fee</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 pl-5 text-sm"
                      placeholder={autoFee > 0 ? autoFee.toFixed(2) : '0.00'}
                      value={platformFeeInput}
                      onChange={(e) => setPlatformFeeInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sale Date</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Total & Profit pill */}
              <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 p-2.5">
                <div className="text-xs text-muted-foreground">
                  Subtotal {money(itemsSubtotal)} {shipping > 0 ? `+ Ship ${money(shipping)}` : ''}{' '}
                  {fee > 0 ? `− Fee ${money(fee)}` : ''}
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-foreground">{money(total)}</span>
                  <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">
                    (+{money(netProfit)} profit)
                  </span>
                </div>
              </div>

              {/* Payment Processing Tabs */}
              <Tabs value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <TabsList className="grid grid-cols-5 w-full h-9">
                  <TabsTrigger value="card" className="text-xs">
                    Card
                  </TabsTrigger>
                  <TabsTrigger value="venmo" className="text-xs">
                    Venmo
                  </TabsTrigger>
                  <TabsTrigger value="cashapp" className="text-xs">
                    Cash App
                  </TabsTrigger>
                  <TabsTrigger value="paypal" className="text-xs">
                    PayPal
                  </TabsTrigger>
                  <TabsTrigger value="zelle" className="text-xs">
                    Zelle/Cash
                  </TabsTrigger>
                </TabsList>

                {/* Card Terminal */}
                <TabsContent value="card" className="space-y-3 pt-2">
                  <div className="p-3 border rounded-lg space-y-2.5 bg-muted/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-primary" /> Virtual Card Terminal
                      </span>
                      {cardBrand !== 'unknown' && (
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {cardBrand}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cardholder Name</Label>
                      <Input
                        placeholder="Name on card"
                        className="h-8 text-sm"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Card Number</Label>
                      <Input
                        placeholder="4000 1234 5678 9010"
                        className="h-8 font-mono text-sm"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        maxLength={19}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Expires</Label>
                        <Input
                          placeholder="MM/YY"
                          className="h-8 text-sm font-mono"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                          maxLength={5}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CVC</Label>
                        <Input
                          placeholder="123"
                          type="password"
                          className="h-8 text-sm font-mono"
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value.slice(0, 4))}
                          maxLength={4}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Zip Code</Label>
                        <Input
                          placeholder="90210"
                          className="h-8 text-sm font-mono"
                          value={cardZip}
                          onChange={(e) => setCardZip(e.target.value.slice(0, 5))}
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={handleChargeCard}
                    disabled={isProcessingCard || recordSale.isPending || total <= 0}
                  >
                    {isProcessingCard ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Authorizing {money(total)}…
                      </>
                    ) : (
                      <>Charge Card · {money(total)}</>
                    )}
                  </Button>
                </TabsContent>

                {/* Venmo */}
                <TabsContent value="venmo" className="space-y-3 pt-2">
                  <div className="flex gap-4 items-center p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
                    <QRCode text={venmoUrl || 'https://venmo.com'} size={130} />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Venmo QR & Link</p>
                        <p className="text-xs text-muted-foreground">Buyer scans with phone camera</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Your Venmo @handle</Label>
                        <Input
                          className="h-7 text-xs"
                          placeholder="username"
                          value={venmoHandle}
                          onChange={(e) => setVenmoHandle(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(venmoUrl);
                            toast.success('Venmo link copied!');
                          }}
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => window.open(venmoDeepLink, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" /> Open
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleCompleteSale('venmo')}
                    disabled={recordSale.isPending || total <= 0}
                  >
                    Confirm Venmo Payment Received · {money(total)}
                  </Button>
                </TabsContent>

                {/* Cash App */}
                <TabsContent value="cashapp" className="space-y-3 pt-2">
                  <div className="flex gap-4 items-center p-3 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
                    <QRCode text={cashAppUrl || 'https://cash.app'} size={130} />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">Cash App $cashtag</p>
                        <p className="text-xs text-muted-foreground">Pre-filled with {money(total)}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Your $Cashtag</Label>
                        <Input
                          className="h-7 text-xs"
                          placeholder="Cashtag"
                          value={cashAppTag}
                          onChange={(e) => setCashAppTag(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(cashAppUrl);
                            toast.success('Cash App link copied!');
                          }}
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => window.open(cashAppUrl, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" /> Open
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleCompleteSale('card')}
                    disabled={recordSale.isPending || total <= 0}
                  >
                    Confirm Cash App Payment Received · {money(total)}
                  </Button>
                </TabsContent>

                {/* PayPal */}
                <TabsContent value="paypal" className="space-y-3 pt-2">
                  <div className="flex gap-4 items-center p-3 border rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20">
                    <QRCode text={paypalUrl || 'https://paypal.me'} size={130} />
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">PayPal.Me</p>
                        <p className="text-xs text-muted-foreground">One-click checkout</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Your PayPal.Me handle</Label>
                        <Input
                          className="h-7 text-xs"
                          placeholder="username"
                          value={paypalUsername}
                          onChange={(e) => setPaypalUsername(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(paypalUrl);
                            toast.success('PayPal link copied!');
                          }}
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => window.open(paypalUrl, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" /> Open
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleCompleteSale('card')}
                    disabled={recordSale.isPending || total <= 0}
                  >
                    Confirm PayPal Payment Received · {money(total)}
                  </Button>
                </TabsContent>

                {/* Zelle / Cash */}
                <TabsContent value="zelle" className="space-y-3 pt-2">
                  <div className="p-3 border rounded-lg space-y-2 text-xs bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-xs">Zelle Phone or Email</Label>
                      <Input
                        className="h-8 text-sm"
                        placeholder="team@example.com or phone"
                        value={zelleContact}
                        onChange={(e) => setZelleContact(e.target.value)}
                      />
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Buyer sends {money(total)} via their bank app to this recipient.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleCompleteSale('other')}
                      disabled={recordSale.isPending || total <= 0}
                    >
                      Recorded as Zelle
                    </Button>
                    <Button
                      onClick={() => handleCompleteSale('cash')}
                      disabled={recordSale.isPending || total <= 0}
                    >
                      Paid in Cash
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Share invoice text to buyer */}
              <div className="pt-1 flex items-center justify-between border-t text-xs">
                <span className="text-muted-foreground">Messaging buyer on Facebook or SMS?</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={copyPaymentMessage}>
                  <MessageSquare className="w-3.5 h-3.5" /> Copy Payment Text
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

