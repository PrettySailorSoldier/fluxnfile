import { ExternalLink, Package } from 'lucide-react';
import type { Item } from '@/hooks/useInventory';

/** "2026-10-14" → "Oct 14, 2026" (read as a calendar date, not shifted by time zone) */
function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function money(value: number | null | undefined): string | null {
  return value != null && value > 0 ? `$${value.toFixed(2)}` : null;
}

const SOURCE_LABELS: Record<string, string> = {
  lattice_csv: 'Lattice export',
  vine_report: 'Vine Itemized Report',
  order_history_extension: 'Amazon order history',
  amazon_csv: 'Amazon orders',
  vine_html: 'Vine orders page',
  list_import: 'List import',
  barcode_scan: 'Barcode scan',
};

const REVIEW_LABELS: Record<string, string> = {
  reviewed_grant: 'Reviewed',
  pending: 'Not reviewed yet',
};

/**
 * Everything the imported order files say about an item — shown before a
 * scanned box is confirmed, so the right order can be told apart from
 * look-alikes (same brand, same kind of product).
 */
export function OrderDetails({ item, showPhoto = true }: { item: Item; showPhoto?: boolean }) {
  const orderNumber = item.amazon_order_number || item.amazon_order_id;
  const orderUrl =
    item.amazon_order_url ||
    (orderNumber ? `https://www.amazon.com/gp/your-account/order-details?orderID=${orderNumber}` : null);
  const review =
    item.lattice_review_status ||
    (item.amazon_review_status ? REVIEW_LABELS[item.amazon_review_status] ?? item.amazon_review_status : null);
  const hasOrderDates = !!(item.ordered_date || item.shipped_date || item.delivered_date);

  const rows: [string, React.ReactNode][] = [
    ['ETV', money(item.vine_etv) ?? money(item.original_cost)],
    ['FMV', money(item.vine_fmv)],
    ['Ordered', formatDay(item.ordered_date)],
    ['Shipped', formatDay(item.shipped_date)],
    ['Delivered', formatDay(item.delivered_date)],
    // Imported before the order dates were kept — the date the list gave
    ['Date on list', hasOrderDates ? null : formatDay(item.acquisition_date)],
    ['Delivery', item.delivery_status || item.amazon_shipment_status],
    ['Review', review],
    [
      'Order #',
      orderNumber &&
        (orderUrl ? (
          <a href={orderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary font-mono">
            {orderNumber}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="font-mono">{orderNumber}</span>
        )),
    ],
    [
      'ASIN',
      item.amazon_asin && (
        <a
          href={`https://www.amazon.com/dp/${item.amazon_asin}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary font-mono"
        >
          {item.amazon_asin}
          <ExternalLink className="w-3 h-3" />
        </a>
      ),
    ],
    ['Sticker', item.fnsku && <span className="font-mono">{item.fnsku}</span>],
    ['UPC', item.upc && <span className="font-mono">{item.upc}</span>],
    ['From', (item.data_sources ?? []).map((s) => SOURCE_LABELS[s] ?? s).join(', ') || null],
  ];

  const photo = item.photos?.[0];

  return (
    <div className="space-y-3">
      {showPhoto && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-20 h-20 rounded-md overflow-hidden bg-muted flex items-center justify-center">
            {photo ? (
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-7 h-7 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm font-medium leading-snug">{item.title || 'Untitled item'}</p>
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
