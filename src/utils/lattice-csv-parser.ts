import Papa from 'papaparse';

export interface LatticeItem {
  asin: string;
  description: string;
  etv: number;
  fmv: number;
  valueToUse: number;
  orderedDate: string;
  shippedDate: string;
  deliveredDate: string;
  deliveryStatus: string;
  reviewedDate: string;
  reviewStatus: 'Approved' | 'Not yet reviewed' | '';
  reviewRating: number | null;
  reviewQuality: string;
  reviewImages: boolean;
  selected: boolean;
}

export interface LatticeParseResult {
  items: LatticeItem[];
  totalFound: number;
  alreadyReviewed: number;
  pendingReview: number;
  parseWarnings: string[];
  isLatticeExport: boolean;
}

export function isLatticeCSV(csvText: string): boolean {
  const firstLine = csvText.split('\n')[0];
  return (
    firstLine.includes('ASIN') &&
    firstLine.includes('Description') &&
    firstLine.includes('ETV') &&
    firstLine.includes('FMV') &&
    firstLine.includes('Review Status') &&
    firstLine.includes('Delivery Status')
  );
}

function parseDollar(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseMMDDYYYY(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return '';
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return '';
}

export function parseLatticeCSV(csvText: string): LatticeParseResult {
  const warnings: string[] = [];
  const items: LatticeItem[] = [];

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0) {
    result.errors.forEach(err => {
      warnings.push(`Parse warning row ${err.row}: ${err.message}`);
    });
  }

  for (const row of result.data) {
    try {
      const asin = (row['ASIN'] || '').trim();
      const description = (row['Description'] || '').trim();

      if (!asin || !description) continue;

      const etv = parseDollar(row['ETV']);
      const fmv = parseDollar(row['FMV']);
      const valueToUse = etv > 0 ? etv : fmv;

      const reviewStatus = (row['Review Status'] || '').trim() as LatticeItem['reviewStatus'];

      const reviewRatingStr = (row['Review'] || '').trim();
      const reviewRatingParsed = reviewRatingStr ? parseInt(reviewRatingStr, 10) : null;

      items.push({
        asin,
        description,
        etv,
        fmv,
        valueToUse,
        orderedDate: (row['Ordered'] || '').trim(),
        shippedDate: (row['Shipped'] || '').trim(),
        deliveredDate: (row['Delivered'] || '').trim(),
        deliveryStatus: (row['Delivery Status'] || '').trim(),
        reviewedDate: (row['Reviewed'] || '').trim(),
        reviewStatus,
        reviewRating:
          reviewRatingParsed !== null && !isNaN(reviewRatingParsed)
            ? reviewRatingParsed
            : null,
        reviewQuality: (row['Review Quality'] || '').trim(),
        reviewImages: (row['Review Images'] || '').trim() === 'Yes',
        selected: true,
      });
    } catch (err) {
      warnings.push(
        `Error on row with ASIN ${row['ASIN']}: ${
          err instanceof Error ? err.message : 'Unknown'
        }`
      );
    }
  }

  const alreadyReviewed = items.filter(i => i.reviewStatus === 'Approved').length;

  return {
    items,
    totalFound: items.length,
    alreadyReviewed,
    pendingReview: items.length - alreadyReviewed,
    parseWarnings: warnings,
    isLatticeExport: true,
  };
}

export function getAcquisitionDate(item: LatticeItem): string {
  return (
    parseMMDDYYYY(item.deliveredDate) ||
    parseMMDDYYYY(item.shippedDate) ||
    parseMMDDYYYY(item.orderedDate) ||
    new Date().toISOString().split('T')[0]
  );
}
