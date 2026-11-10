import { useState } from 'react';
import {
  useWorkflowSettings,
  useUpdateWorkflowSettings,
  DEFAULT_WORKFLOW_SETTINGS,
  WorkflowSettings,
} from '@/hooks/useUserPreferences';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Settings2,
  DollarSign,
  Package,
  Star,
  ScanLine,
  Bell,
  RotateCcw,
  Store,
  CreditCard,
} from 'lucide-react';

/** Small numeric field; keeps what you type until it's a valid number. */
function NumField({
  value,
  onChange,
  prefix,
  suffix,
  step = 0.1,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-1 w-28">
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
        className="h-8 text-sm text-right"
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function PrefRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-2">
      <Icon className="w-4 h-4 text-primary" />
      <p className="text-xs font-semibold text-primary uppercase tracking-wide">{title}</p>
    </div>
  );
}

export function WorkflowSettingsCard() {
  const settings = useWorkflowSettings();
  const updateSettings = useUpdateWorkflowSettings();
  const [hasChanges, setHasChanges] = useState(false);
  const [local, setLocal] = useState<WorkflowSettings>(settings);

  const update = <K extends keyof WorkflowSettings>(key: K, value: WorkflowSettings[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      // navTabs is edited elsewhere; don't overwrite it with this card's stale copy
      await updateSettings.mutateAsync({ ...local, navTabs: settings.navTabs });
      setHasChanges(false);
      toast.success('Preferences saved!');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  const handleReset = () => {
    setLocal(DEFAULT_WORKFLOW_SETTINGS);
    setHasChanges(true);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Workflow Preferences
        </CardTitle>
        <CardDescription>
          Customize how Flux&amp;File behaves for your resale workflow
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">

        {/* ── IMPORT DEFAULTS ── */}
        <SectionHeader icon={Package} title="Import Defaults" />

        <PrefRow
          label="Default Markup %"
          description={`Target price = ETV × ${local.defaultMarkupPercent}%`}
        >
          <div className="flex items-center gap-2 w-32">
            <Slider
              min={100}
              max={300}
              step={5}
              value={[local.defaultMarkupPercent]}
              onValueChange={([v]) => update('defaultMarkupPercent', v)}
              className="flex-1"
            />
            <span className="text-sm font-mono w-10 text-right">
              {local.defaultMarkupPercent}%
            </span>
          </div>
        </PrefRow>

        <PrefRow
          label="Skip $0 ETV Items"
          description="Don't import consumables and supplements with no taxable value"
        >
          <Switch
            checked={local.skipZeroEtvItems}
            onCheckedChange={(v) => update('skipZeroEtvItems', v)}
          />
        </PrefRow>

        <PrefRow
          label="Skip Cancellations"
          description="Automatically exclude cancelled orders from imports"
        >
          <Switch
            checked={local.skipCancellations}
            onCheckedChange={(v) => update('skipCancellations', v)}
          />
        </PrefRow>

        <PrefRow
          label="Auto-select All Items"
          description="Select all items by default in import preview"
        >
          <Switch
            checked={local.autoSelectAll}
            onCheckedChange={(v) => update('autoSelectAll', v)}
          />
        </PrefRow>

        <Separator className="my-2" />

        {/* ── PRICING ── */}
        <SectionHeader icon={DollarSign} title="Pricing" />

        <PrefRow
          label="Round to .99"
          description="Auto-round target prices (e.g. $26.10 → $25.99)"
        >
          <Switch
            checked={local.roundPricesToNinetyNine}
            onCheckedChange={(v) => update('roundPricesToNinetyNine', v)}
          />
        </PrefRow>

        <PrefRow
          label="Minimum Margin %"
          description="Items below this margin show a warning"
        >
          <div className="flex items-center gap-2 w-32">
            <Slider
              min={0}
              max={80}
              step={5}
              value={[local.minimumMarginPercent]}
              onValueChange={([v]) => update('minimumMarginPercent', v)}
              className="flex-1"
            />
            <span className="text-sm font-mono w-10 text-right">
              {local.minimumMarginPercent}%
            </span>
          </div>
        </PrefRow>

        <PrefRow
          label="Default Platform Fee %"
          description="Used when no platform is assigned to an item"
        >
          <div className="flex items-center gap-2 w-32">
            <Slider
              min={0}
              max={25}
              step={1}
              value={[local.defaultPlatformFeePercent]}
              onValueChange={([v]) => update('defaultPlatformFeePercent', v)}
              className="flex-1"
            />
            <span className="text-sm font-mono w-10 text-right">
              {local.defaultPlatformFeePercent}%
            </span>
          </div>
        </PrefRow>

        <Separator className="my-2" />

        {/* ── INVENTORY ── */}
        <SectionHeader icon={Package} title="Inventory" />

        <PrefRow
          label="Default Sort Order"
          description="How items appear when you open Inventory"
        >
          <Select
            value={local.defaultSortOrder}
            onValueChange={(v) =>
              update('defaultSortOrder', v as WorkflowSettings['defaultSortOrder'])
            }
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="value_high">Highest value</SelectItem>
              <SelectItem value="value_low">Lowest value</SelectItem>
              <SelectItem value="review_urgent">Review urgency</SelectItem>
              <SelectItem value="title_az">A → Z</SelectItem>
            </SelectContent>
          </Select>
        </PrefRow>

        <PrefRow
          label="Stale Listing Threshold"
          description="Days before a listed item is flagged as stale"
        >
          <div className="flex items-center gap-2 w-32">
            <Slider
              min={7}
              max={90}
              step={7}
              value={[local.staleDaysThreshold]}
              onValueChange={([v]) => update('staleDaysThreshold', v)}
              className="flex-1"
            />
            <span className="text-sm font-mono w-12 text-right">
              {local.staleDaysThreshold}d
            </span>
          </div>
        </PrefRow>

        <PrefRow
          label="Reprice Threshold"
          description="Days before suggesting a price drop"
        >
          <div className="flex items-center gap-2 w-32">
            <Slider
              min={7}
              max={60}
              step={7}
              value={[local.repriceDaysThreshold]}
              onValueChange={([v]) => update('repriceDaysThreshold', v)}
              className="flex-1"
            />
            <span className="text-sm font-mono w-12 text-right">
              {local.repriceDaysThreshold}d
            </span>
          </div>
        </PrefRow>

        <PrefRow
          label="Show Swipe Hint"
          description="Show 'swipe left/right' tip on inventory list"
        >
          <Switch
            checked={local.showSwipeHint}
            onCheckedChange={(v) => update('showSwipeHint', v)}
          />
        </PrefRow>

        <Separator className="my-2" />

        {/* ── REVIEW WORKFLOW ── */}
        <SectionHeader icon={Star} title="Review Workflow" />

        <PrefRow
          label="Review Reminder Delay"
          description="Days after delivery before review reminder fires"
        >
          <div className="flex items-center gap-2 w-32">
            <Slider
              min={1}
              max={14}
              step={1}
              value={[local.reviewReminderDays]}
              onValueChange={([v]) => update('reviewReminderDays', v)}
              className="flex-1"
            />
            <span className="text-sm font-mono w-12 text-right">
              {local.reviewReminderDays}d
            </span>
          </div>
        </PrefRow>

        <PrefRow
          label="Primary Reviewer"
          description="Who is responsible for writing Vine reviews"
        >
          <Select
            value={local.primaryReviewer}
            onValueChange={(v) => update('primaryReviewer', v)}
          >
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grant">Grant</SelectItem>
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="none">Neither</SelectItem>
            </SelectContent>
          </Select>
        </PrefRow>

        <PrefRow
          label="Show Review Urgency"
          description="Show ⏱ badge on items needing review"
        >
          <Switch
            checked={local.showReviewUrgency}
            onCheckedChange={(v) => update('showReviewUrgency', v)}
          />
        </PrefRow>

        <Separator className="my-2" />

        {/* ── SCANNING ── */}
        <SectionHeader icon={ScanLine} title="Scanning" />

        <PrefRow
          label="Auto-open on Match"
          description="Automatically open item editor when a barcode matches"
        >
          <Switch
            checked={local.scanAutoOpenEdit}
            onCheckedChange={(v) => update('scanAutoOpenEdit', v)}
          />
        </PrefRow>

        <PrefRow
          label="Haptic Feedback"
          description="Vibrate phone on successful scan"
        >
          <Switch
            checked={local.scanHapticFeedback}
            onCheckedChange={(v) => update('scanHapticFeedback', v)}
          />
        </PrefRow>

        <Separator className="my-2" />

        {/* ── NOTIFICATIONS ── */}
        <SectionHeader icon={Bell} title="Notifications" />

        <PrefRow
          label="Stale Listing Alerts"
          description="Notify when items have been listed too long"
        >
          <Switch
            checked={local.notifyStaleListings}
            onCheckedChange={(v) => update('notifyStaleListings', v)}
          />
        </PrefRow>

        <PrefRow
          label="Pending Review Alerts"
          description="Notify when Vine items need reviews written"
        >
          <Switch
            checked={local.notifyPendingReviews}
            onCheckedChange={(v) => update('notifyPendingReviews', v)}
          />
        </PrefRow>

        <Separator className="my-2" />

        {/* ── MARKET DAY ── */}
        <SectionHeader icon={Store} title="Market Day" />

        <PrefRow
          label="Tag buffer %"
          description="Sticker = your floor price + this (guides suggest 15–25%)"
        >
          <NumField value={local.marketTagBufferPercent} onChange={(v) => update('marketTagBufferPercent', v)} suffix="%" />
        </PrefRow>

        <PrefRow label="Round tags to" description="Clean numbers for cash and quick maths (instead of .99)">
          <Select
            value={String(local.marketRoundStep)}
            onValueChange={(v) => update('marketRoundStep', v === '5' ? 5 : 1)}
          >
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Whole $1</SelectItem>
              <SelectItem value="5">Nearest $5</SelectItem>
            </SelectContent>
          </Select>
        </PrefRow>

        <PrefRow label="Card fee %" description="Your reader's rate — check your own, it varies by reader and plan">
          <NumField value={local.marketCardFeePercent} onChange={(v) => update('marketCardFeePercent', v)} suffix="%" />
        </PrefRow>

        <PrefRow label="Card fee per sale" description="Flat part of the fee, in dollars">
          <NumField value={local.marketCardFeeFlat} onChange={(v) => update('marketCardFeeFlat', v)} prefix="$" />
        </PrefRow>

        <PrefRow label="Venmo / app fee %" description="0 for personal transfers">
          <NumField value={local.marketAppFeePercent} onChange={(v) => update('marketAppFeePercent', v)} suffix="%" />
        </PrefRow>

        <PrefRow
          label="Sales tax %"
          description="0 = don't add tax at the register. Ask CDTFA/your accountant what applies to you."
        >
          <NumField value={local.marketSalesTaxPercent} onChange={(v) => update('marketSalesTaxPercent', v)} suffix="%" />
        </PrefRow>

        <PrefRow label="Tag prices include tax" description="Back the tax out of the price instead of adding it on top">
          <Switch
            checked={local.marketTaxIncluded}
            onCheckedChange={(v) => update('marketTaxIncluded', v)}
          />
        </PrefRow>

        <PrefRow label="“Book again” at $/hour" description="Needs gross of at least 3× the booth fee too">
          <NumField value={local.marketGoodProfitPerHour} onChange={(v) => update('marketGoodProfitPerHour', v)} prefix="$" />
        </PrefRow>

        <PrefRow label="“Skip” under $/hour" description="Profit per hour below this suggests skipping that market">
          <NumField value={local.marketMinProfitPerHour} onChange={(v) => update('marketMinProfitPerHour', v)} prefix="$" />
        </PrefRow>

        <PrefRow label="Tax set-aside %" description="Share of each market's profit to move aside (rough starting point)">
          <NumField value={local.marketTaxSetAsidePercent} onChange={(v) => update('marketTaxSetAsidePercent', v)} suffix="%" />
        </PrefRow>

        <PrefRow label="Mileage rate $/mile" description="Update each year — confirm the current IRS business rate">
          <NumField value={local.marketMileageRate} onChange={(v) => update('marketMileageRate', v)} prefix="$" step={0.01} />
        </PrefRow>

        {/* ── ONLINE & DIGITAL PAYMENTS ── */}
        <SectionHeader icon={CreditCard} title="Online & Digital Payments" />

        <PrefRow label="Venmo @handle" description="For generating instant QR codes and payment deep links">
          <Input
            value={local.venmoHandle || ''}
            onChange={(e) => update('venmoHandle', e.target.value.replace(/^@/, ''))}
            placeholder="username"
            className="h-8 text-sm w-36"
          />
        </PrefRow>

        <PrefRow label="Cash App $tag" description="For Cash App QR codes and payment requests">
          <Input
            value={local.cashAppTag || ''}
            onChange={(e) => update('cashAppTag', e.target.value.replace(/^\$/, ''))}
            placeholder="cashtag"
            className="h-8 text-sm w-36"
          />
        </PrefRow>

        <PrefRow label="PayPal.me username" description="For PayPal payment links and QR codes">
          <Input
            value={local.paypalUsername || ''}
            onChange={(e) => update('paypalUsername', e.target.value.replace(/^@/, ''))}
            placeholder="username"
            className="h-8 text-sm w-36"
          />
        </PrefRow>

        <PrefRow label="Zelle recipient" description="Email or phone number for Zelle payments">
          <Input
            value={local.zelleContact || ''}
            onChange={(e) => update('zelleContact', e.target.value)}
            placeholder="team@example.com"
            className="h-8 text-sm w-36"
          />
        </PrefRow>

        {/* ── SAVE / RESET ── */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="gap-2 text-muted-foreground"
          >
            <RotateCcw className="w-3 h-3" />
            Reset defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            className="flex-1"
          >
            {updateSettings.isPending
              ? 'Saving...'
              : hasChanges
                ? 'Save Changes'
                : 'Saved ✓'}
          </Button>
        </div>

      </CardContent>
    </Card>
  );
}
