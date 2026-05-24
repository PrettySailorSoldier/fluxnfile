import * as XLSX from 'xlsx';

export interface VineReportItem {
  orderNumber: string;
  asin: string;
  productName: string;
  orderType: 'ORDER' | 'CANCELLATION';
  orderDate: string;
  shippedDate: string;
  estimatedTaxValue: number;
  selected: boolean;
}

export interface VineReportParseResult {
  items: VineReportItem[];
  totalFound: number;
  skippedCancellations: number;
  skippedFreeItems: number;
  parseWarnings: string[];
  isVineReport: boolean;
}

export function isVineReport(workbook: XLSX.WorkBook): boolean {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
  });

  if (rows.length === 0) return false;

  const headers = rows[0] as string[];
  const required = [
    'Order Number',
    'ASIN',
    'Product Name',
    'Order Type',
    'Estimated Tax Value',
  ];

  return required.every(h =>
    headers.some(header => header?.toString().trim() === h)
  );
}

export function parseVineReport(workbook: XLSX.WorkBook): VineReportParseResult {
  const warnings: string[] = [];
  const items: VineReportItem[] = [];
  let skippedCancellations = 0;
  let skippedFreeItems = 0;

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  for (const row of rows) {
    try {
      const orderType = String(row['Order Type'] || '').trim();

      if (orderType === 'CANCELLATION') {
        skippedCancellations++;
        continue;
      }

      if (orderType !== 'ORDER') {
        continue;
      }

      const etv = parseFloat(
        String(row['Estimated Tax Value'] || '0').replace(/[^0-9.-]/g, '')
      );

      if (etv === 0) {
        skippedFreeItems++;
        continue;
      }

      const orderNumber = String(row['Order Number'] || '').trim();
      const asin = String(row['ASIN'] || '').trim();
      const productName = String(row['Product Name'] || '').trim();
      const orderDate = String(row['Order Date'] || '').trim();
      const shippedDate = String(row['Shipped Date'] || '').trim();

      if (!productName || productName.length < 3) {
        warnings.push(`Skipped row: missing product name (Order: ${orderNumber})`);
        continue;
      }

      // Format is MM/DD/YYYY
      const parseDate = (dateStr: string): string => {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [month, day, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return new Date().toISOString().split('T')[0];
      };

      const acquisitionDate = parseDate(shippedDate || orderDate);

      items.push({
        orderNumber,
        asin,
        productName,
        orderType: 'ORDER',
        orderDate: parseDate(orderDate),
        shippedDate: acquisitionDate,
        estimatedTaxValue: etv,
        selected: true,
      });
    } catch (err) {
      warnings.push(
        `Error parsing row: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  return {
    items,
    totalFound: items.length,
    skippedCancellations,
    skippedFreeItems,
    parseWarnings: warnings,
    isVineReport: true,
  };
}
