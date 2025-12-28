/**
 * Amazon Smart Parser - Anti-Fragile HTML Parsing Engine
 * 
 * This parser uses multiple heuristic strategies to extract order data from
 * Amazon HTML, with fallback mechanisms to handle UI changes.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedAmazonItem {
  id: string; // Unique ID for React keys
  title: string;
  cleanTitle: string;
  orderDate: string; // ISO format
  price: number;
  asin: string | null;
  imageUrl: string | null;
  selected: boolean;
  confidence: 'high' | 'medium' | 'low';
  confidenceDetails: {
    titleFound: boolean;
    priceFound: boolean;
    priceGuessed: boolean;
    dateFound: boolean;
    dateGuessed: boolean;
    asinFound: boolean;
  };
}

export interface ParseResult {
  items: ParsedAmazonItem[];
  totalFound: number;
  parseWarnings: string[];
  isVineMode: boolean;
}

// ============================================================================
// TITLE SANITIZATION
// ============================================================================

const NOISE_PATTERNS = [
  /^Sponsored\s*/i,
  /\s*-\s*Amazon\.com$/i,
  /\s*\|\s*Amazon$/i,
  /\s*\(\s*\d+\s*-?\s*Pack\s*\)\s*/gi,
  /\s*\d+\s*-?\s*Pack\s*/gi,
  /\s*Pack\s+of\s+\d+\s*/gi,
  /\s*,\s*\d+\s*Count\s*/gi,
  /\s*\(\s*\d+\s*Count\s*\)\s*/gi,
  /\s*FREE\s+Shipping\s*/gi,
  /\s*Prime\s*$/i,
  /\s{2,}/g, // Multiple spaces
];

/**
 * Clean up Amazon product titles by removing noise words and SEO spam
 */
export function sanitizeTitle(title: string): string {
  console.log('[sanitizeTitle] Input:', title.substring(0, 80) + (title.length > 80 ? '...' : ''));
  let clean = title.trim();
  
  for (const pattern of NOISE_PATTERNS) {
    clean = clean.replace(pattern, ' ');
  }
  
  // Normalize whitespace and limit length
  clean = clean.replace(/\s+/g, ' ').trim();
  
  // Truncate very long titles (keep first 200 chars)
  if (clean.length > 200) {
    // Try to cut at a word boundary
    const truncated = clean.slice(0, 200);
    const lastSpace = truncated.lastIndexOf(' ');
    clean = lastSpace > 150 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
  }
  
  console.log('[sanitizeTitle] Output:', clean.substring(0, 80) + (clean.length > 80 ? '...' : ''));
  return clean;
}

// ============================================================================
// PRICE EXTRACTION (Heuristic Fallback Strategy with Contextual Hunting)
// ============================================================================

const PRICE_SELECTORS = [
  '.a-price .a-offscreen',
  '.a-price-whole',
  '.a-color-price',
  '.product-price',
  '.item-price',
  '.yohtmlc-item .a-text-bold',
  '[data-price]',
  '.a-price',
];

// Labels that indicate a good price context
const POSITIVE_PRICE_LABELS = [
  'item subtotal',
  'your price',
  'price',
  'unit price',
  'each',
  'buy now',
];

// Labels that indicate we should SKIP this price (it's not the item price)
const NEGATIVE_PRICE_LABELS = [
  'order total',
  'grand total',
  'shipping',
  'tax',
  'add-on',
  'suggested',
  'frequently bought',
  'customers also',
  'similar items',
  'save',
  'was',
  'list price',
];

/**
 * Parse price from text, handling various formats
 */
function parsePrice(text: string): number {
  console.log('[parsePrice] Input text:', text.substring(0, 50));
  // Remove currency symbols and clean up
  const cleaned = text.replace(/[^0-9.,]/g, '');
  
  // Handle formats like 1,234.56 or 1.234,56
  let normalized = cleaned;
  
  // If there's a comma followed by exactly 2 digits at the end, treat as decimal
  if (/,\d{2}$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard US format - remove commas
    normalized = cleaned.replace(/,/g, '');
  }
  
  const price = parseFloat(normalized);
  const result = isNaN(price) ? 0 : Math.round(price * 100) / 100;
  console.log('[parsePrice] Result:', result);
  return result;
}

/**
 * Check if text near a price indicates it's a good or bad context
 */
function getPriceContextScore(surroundingText: string): number {
  const lowerText = surroundingText.toLowerCase();
  
  // Check for negative indicators (skip this price)
  for (const negative of NEGATIVE_PRICE_LABELS) {
    if (lowerText.includes(negative)) {
      return -1;
    }
  }
  
  // Check for positive indicators (this is likely the item price)
  for (const positive of POSITIVE_PRICE_LABELS) {
    if (lowerText.includes(positive)) {
      return 1;
    }
  }
  
  return 0;
}

/**
 * Extract all prices from text with their context scores
 */
function extractPricesWithContext(textContent: string): Array<{ price: number; score: number }> {
  const priceRegex = /\$\s*(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/g;
  const prices: Array<{ price: number; score: number; index: number }> = [];
  
  let match;
  while ((match = priceRegex.exec(textContent)) !== null) {
    const price = parsePrice(match[1]);
    if (price > 0 && price < 10000) {
      // Get surrounding context (50 chars before and after)
      const start = Math.max(0, match.index - 50);
      const end = Math.min(textContent.length, match.index + match[0].length + 50);
      const context = textContent.slice(start, end);
      
      const score = getPriceContextScore(context);
      prices.push({ price, score, index: match.index });
    }
  }
  
  return prices;
}

/**
 * Extract price using CSS selectors first, then contextual regex fallback
 */
export function extractPrice(
  element: Element,
  textContent: string
): { price: number; guessed: boolean } {
  console.log('[extractPrice] Starting price extraction, text length:', textContent.length);
  
  // Strategy 1: Try CSS selectors (most reliable)
  for (const selector of PRICE_SELECTORS) {
    try {
      const el = element.querySelector(selector);
      if (el?.textContent) {
        // Check if this element is in a negative context
        const parentText = el.parentElement?.textContent?.toLowerCase() || '';
        if (!NEGATIVE_PRICE_LABELS.some(neg => parentText.includes(neg))) {
          const price = parsePrice(el.textContent);
          if (price > 0) {
            console.log('[extractPrice] Found via selector:', selector, '-> $' + price);
            return { price, guessed: false };
          }
        }
      }
    } catch {
      // Selector failed, continue
    }
  }
  
  // Strategy 2: Look for data-price attribute
  const priceAttr = element.querySelector('[data-price]')?.getAttribute('data-price');
  if (priceAttr) {
    const price = parseFloat(priceAttr);
    if (price > 0) {
      console.log('[extractPrice] Found via data-price attr: $' + price);
      return { price, guessed: false };
    }
  }
  
  // Strategy 3: Contextual regex - find all $XX.XX patterns and score them
  const pricesWithContext = extractPricesWithContext(textContent);
  console.log('[extractPrice] Contextual regex found', pricesWithContext.length, 'candidates');
  
  if (pricesWithContext.length > 0) {
    // Sort by score (positive first), then by price (lower first to avoid order totals)
    pricesWithContext.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.price - b.price;
    });
    
    // Take the best-scored price that's not in negative context
    for (const { price, score } of pricesWithContext) {
      if (score >= 0 && price > 0) {
        console.log('[extractPrice] Selected from context: $' + price, 'score:', score);
        return { price, guessed: score === 0 };
      }
    }
    
    // If all prices were in negative context, take the smallest one as last resort
    const smallestPrice = pricesWithContext.reduce((min, curr) => 
      curr.price < min.price ? curr : min
    );
    if (smallestPrice.price > 0 && smallestPrice.price < 1000) {
      console.log('[extractPrice] Fallback to smallest: $' + smallestPrice.price);
      return { price: smallestPrice.price, guessed: true };
    }
  }
  
  // Strategy 4: Look for price patterns without $ symbol
  const numericPriceRegex = /(?:Price|Cost|Your)[:\s]*(\d{1,4}(?:\.\d{2})?)/gi;
  const numMatch = textContent.match(numericPriceRegex);
  if (numMatch) {
    const price = parsePrice(numMatch[0]);
    if (price > 0 && price < 10000) {
      console.log('[extractPrice] Found via numeric pattern: $' + price);
      return { price, guessed: true };
    }
  }
  
  console.log('[extractPrice] No price found, returning $0');
  return { price: 0, guessed: true };
}

// ============================================================================
// DATE EXTRACTION & NORMALIZATION
// ============================================================================

const DATE_PATTERNS = [
  // "Ordered on January 15, 2024" or "Order placed January 15, 2024"
  /(?:Ordered|Order\s+placed)\s+(?:on\s+)?(\w+\s+\d{1,2},?\s+\d{4})/i,
  // "Ordered January 15, 2024"
  /Ordered\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
  // Standard date formats
  /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
  // "January 15, 2024" standalone
  /(\w+\s+\d{1,2},?\s+\d{4})/,
  // "15 January 2024"
  /(\d{1,2}\s+\w+\s+\d{4})/,
  // ISO-ish format
  /(\d{4}-\d{2}-\d{2})/,
];

/**
 * Extract and normalize order date to ISO format
 */
export function extractDate(element: Element): { date: string; guessed: boolean } {
  const text = element.textContent || '';
  console.log('[extractDate] Searching in text length:', text.length);
  
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      console.log('[extractDate] Pattern matched:', match[1]);
      try {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          // Validate it's a reasonable date (not in future, not too old)
          const now = new Date();
          const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
          
          if (parsed <= now && parsed >= tenYearsAgo) {
            console.log('[extractDate] Valid date found:', parsed.toISOString());
            return { date: parsed.toISOString(), guessed: false };
          }
        }
      } catch {
        // Date parsing failed, continue
      }
    }
  }
  
  console.log('[extractDate] No date found, using today');
  // Fallback: use today's date
  return { date: new Date().toISOString(), guessed: true };
}

// ============================================================================
// ASIN EXTRACTION
// ============================================================================

const ASIN_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})/i,
  /\/gp\/product\/([A-Z0-9]{10})/i,
  /\/product\/([A-Z0-9]{10})/i,
  /asin=([A-Z0-9]{10})/i,
  /data-asin="([A-Z0-9]{10})"/i,
];

/**
 * Extract Amazon ASIN (Standard Identification Number) from element
 */
export function extractASIN(element: Element): string | null {
  console.log('[extractASIN] Starting ASIN extraction');
  
  // Check data-asin attribute first
  const dataAsin = element.getAttribute('data-asin') 
    || element.querySelector('[data-asin]')?.getAttribute('data-asin');
  
  if (dataAsin && /^[A-Z0-9]{10}$/i.test(dataAsin)) {
    console.log('[extractASIN] Found via data-asin attr:', dataAsin.toUpperCase());
    return dataAsin.toUpperCase();
  }
  
  // Check links
  const links = element.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    
    for (const pattern of ASIN_PATTERNS) {
      const match = href.match(pattern);
      if (match && match[1]) {
        console.log('[extractASIN] Found via href pattern:', match[1].toUpperCase());
        return match[1].toUpperCase();
      }
    }
  }
  
  // Check element's own HTML for ASIN patterns
  const html = element.innerHTML;
  for (const pattern of ASIN_PATTERNS) {
    const match = html.match(pattern);
    if (match && match[1]) {
      console.log('[extractASIN] Found in innerHTML:', match[1].toUpperCase());
      return match[1].toUpperCase();
    }
  }
  
  console.log('[extractASIN] No ASIN found');
  return null;
}

// ============================================================================
// VINE MODE DETECTION & PARSING
// ============================================================================

/**
 * Detect if HTML is from Amazon Vine portal
 */
export function isVineHTML(doc: Document): boolean {
  const isVine = doc.querySelector('.vvp-reviews-table') !== null;
  console.log('[isVineHTML] Vine mode detected:', isVine);
  return isVine;
}

/**
 * Parse Unix timestamp (milliseconds) to ISO date string
 */
function parseVineTimestamp(timestamp: string | null): string {
  console.log('[parseVineTimestamp] Input:', timestamp);
  if (!timestamp) {
    console.log('[parseVineTimestamp] No timestamp, using today');
    return new Date().toISOString();
  }
  
  const ms = parseInt(timestamp, 10);
  if (isNaN(ms)) {
    console.log('[parseVineTimestamp] Invalid timestamp, using today');
    return new Date().toISOString();
  }
  
  const date = new Date(ms);
  console.log('[parseVineTimestamp] Parsed date:', date.toISOString());
  // Validate it's a reasonable date
  const now = new Date();
  const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
  const tenYearsFromNow = new Date(now.getFullYear() + 10, 0, 1);
  
  if (date >= tenYearsAgo && date <= tenYearsFromNow) {
    return date.toISOString();
  }
  
  console.log('[parseVineTimestamp] Date out of range, using today');
  return new Date().toISOString();
}

/**
 * Extract ASIN from Vine row using /dp/ link pattern
 */
function extractVineASINFromDpLink(row: Element): string | null {
  console.log('[extractVineASINFromDpLink] Searching for /dp/ links');
  // Look for links with /dp/ in the href
  const dpLink = row.querySelector('a[href*="/dp/"]');
  if (dpLink) {
    const href = dpLink.getAttribute('href') || '';
    console.log('[extractVineASINFromDpLink] Found link:', href.substring(0, 60));
    const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/i);
    if (asinMatch && asinMatch[1]) {
      console.log('[extractVineASINFromDpLink] Extracted ASIN:', asinMatch[1].toUpperCase());
      return asinMatch[1].toUpperCase();
    }
  }
  console.log('[extractVineASINFromDpLink] No ASIN found');
  return null;
}

/**
 * Parse Amazon Vine HTML structure - STRICT MODE
 * Uses exact selectors for the vine-reviews page DOM structure
 */
export function parseVineHTML(doc: Document): ParseResult {
  const warnings: string[] = [];
  const items: ParsedAmazonItem[] = [];
  const seenItems = new Set<string>();
  
  console.log('[Vine Parser] Starting strict Vine mode parsing...');
  
  // Find all Vine table rows using EXACT selector
  const rows = doc.querySelectorAll('tr.vvp-reviews-table--row');
  
  console.log(`[Vine Parser] Found ${rows.length} rows with selector 'tr.vvp-reviews-table--row'`);
  
  if (rows.length === 0) {
    warnings.push('No Vine items found in the HTML. Expected tr.vvp-reviews-table--row elements.');
    return { items, totalFound: 0, parseWarnings: warnings, isVineMode: true };
  }
  
  let rowIndex = 0;
  for (const row of rows) {
    rowIndex++;
    try {
      // =========================================================
      // TITLE: Target .a-truncate-full, fallback .a-link-normal
      // =========================================================
      let title = '';
      const truncateEl = row.querySelector('.a-truncate-full');
      if (truncateEl?.textContent?.trim()) {
        title = truncateEl.textContent.trim();
      } else {
        // Fallback to .a-link-normal text content
        const linkEl = row.querySelector('.a-link-normal');
        if (linkEl?.textContent?.trim()) {
          title = linkEl.textContent.trim();
        }
      }
      
      // =========================================================
      // IMAGE: Target .vvp-reviews-table--image-col img, attr src
      // =========================================================
      const imgEl = row.querySelector('.vvp-reviews-table--image-col img');
      let imageUrl = imgEl?.getAttribute('src') || null;
      
      // Fallback to any img in the row if primary selector fails
      if (!imageUrl) {
        const anyImg = row.querySelector('img');
        imageUrl = anyImg?.getAttribute('src') || null;
      }
      
      // Validate image URL (must be http/https)
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = null;
      }
      
      // =========================================================
      // ORDER DATE (CRITICAL): Target [data-order-timestamp] attr
      // The attribute contains Unix timestamp in milliseconds
      // =========================================================
      const timestampEl = row.querySelector('[data-order-timestamp]');
      const timestampAttr = timestampEl?.getAttribute('data-order-timestamp');
      const orderDate = parseVineTimestamp(timestampAttr);
      const dateGuessed = !timestampAttr;
      
      // =========================================================
      // ASIN: Target a[href*="/dp/"], extract from href regex
      // =========================================================
      const asin = extractVineASINFromDpLink(row);
      
      // =========================================================
      // PRICE: Hardcode to $0 for Vine imports (no price on page)
      // =========================================================
      const price = 0;
      
      // =========================================================
      // DEBUGGING: Log every row processed
      // =========================================================
      console.log("Vine Row:", { 
        rowIndex,
        title: title ? title.substring(0, 50) + (title.length > 50 ? '...' : '') : '(empty)', 
        asin, 
        timestamp: timestampAttr || '(not found)',
        parsedDate: orderDate,
        image: imageUrl ? 'Found' : '(not found)'
      });
      
      // Skip rows without a valid title
      if (!title || title.length < 3) {
        console.log(`[Vine Parser] Row ${rowIndex} skipped: title too short or empty`);
        continue;
      }
      
      // Create deduplication key (prefer ASIN, fallback to title)
      const dedupKey = asin || title.toLowerCase();
      if (seenItems.has(dedupKey)) {
        console.log(`[Vine Parser] Row ${rowIndex} skipped: duplicate key "${dedupKey.substring(0, 30)}"`);
        continue;
      }
      seenItems.add(dedupKey);
      
      const confidenceDetails = {
        titleFound: true,
        priceFound: false, // Vine items don't have prices - this is expected
        priceGuessed: true, // Price is always "guessed" as $0 for Vine
        dateFound: !dateGuessed,
        dateGuessed,
        asinFound: !!asin,
      };
      
      items.push({
        id: generateId(),
        title,
        cleanTitle: sanitizeTitle(title),
        orderDate,
        price, // Always $0 for Vine
        asin,
        imageUrl,
        selected: true, // Select all Vine items by default
        confidence: dateGuessed ? 'medium' : 'high',
        confidenceDetails,
      });
    } catch (error) {
      console.error(`[Vine Parser] Error parsing row ${rowIndex}:`, error);
      warnings.push(`Error parsing Vine row ${rowIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  console.log(`[Vine Parser] Successfully parsed ${items.length} items from ${rows.length} rows`);
  
  return {
    items,
    totalFound: items.length,
    parseWarnings: warnings,
    isVineMode: true,
  };
}

// ============================================================================
// TITLE EXTRACTION
// ============================================================================

const TITLE_SELECTORS = [
  '.a-link-normal[title]',
  'a[href*="/dp/"]',
  'a[href*="/gp/product/"]',
  '.product-title',
  '.item-title',
  '.a-text-normal',
  '.yohtmlc-item a',
];

/**
 * Extract product title from element
 */
export function extractTitle(element: Element): { title: string; found: boolean } {
  console.log('[extractTitle] Starting title extraction');
  // Try selectors
  for (const selector of TITLE_SELECTORS) {
    try {
      const el = element.querySelector(selector);
      if (el) {
        // Prefer title attribute if available
        const title = el.getAttribute('title') || el.textContent;
        if (title && title.trim().length > 5) {
          console.log('[extractTitle] Found via selector:', selector, '->', title.trim().substring(0, 50));
          return { title: title.trim(), found: true };
        }
      }
    } catch {
      // Selector failed
    }
  }
  
  // Fallback: look for any link text that's reasonably long
  const links = element.querySelectorAll('a');
  for (const link of links) {
    const text = link.textContent?.trim();
    if (text && text.length > 10 && text.length < 500) {
      // Avoid navigation links
      if (!/^(Buy|Add|View|Track|Return|Cancel|Help)/i.test(text)) {
        console.log('[extractTitle] Found via link fallback:', text.substring(0, 50));
        return { title: text, found: true };
      }
    }
  }
  
  console.log('[extractTitle] No title found');
  return { title: '', found: false };
}

// ============================================================================
// IMAGE EXTRACTION
// ============================================================================

const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%23888" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/%3E%3Cpolyline points="3.27 6.96 12 12.01 20.73 6.96"/%3E%3Cline x1="12" y1="22.08" x2="12" y2="12"/%3E%3C/svg%3E';

/**
 * Extract product image URL with fallback placeholder
 */
export function extractImage(element: Element): string | null {
  console.log('[extractImage] Starting image extraction');
  const img = element.querySelector('img');
  
  if (img) {
    // Try various image source attributes
    const src = img.getAttribute('src') 
      || img.getAttribute('data-src')
      || img.getAttribute('data-old-hires')
      || img.getAttribute('data-a-dynamic-image');
    
    if (src && src.startsWith('http')) {
      // Filter out tiny images (likely icons)
      const width = img.getAttribute('width');
      const height = img.getAttribute('height');
      
      if (width && height) {
        const w = parseInt(width);
        const h = parseInt(height);
        if (w < 30 || h < 30) {
          console.log('[extractImage] Skipping tiny image:', w, 'x', h);
          return null; // Too small, likely an icon
        }
      }
      
      console.log('[extractImage] Found image:', src.substring(0, 60) + '...');
      return src;
    }
  }
  
  console.log('[extractImage] No image found');
  return null;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

const ORDER_SELECTORS = [
  '.order',
  '.order-card', 
  '[data-order-id]',
  '.a-box-group',
  '.js-order-card',
  '.order-info',
];

const ITEM_SELECTORS = [
  '[data-asin]',
  '.yohtmlc-item',
  '.a-fixed-left-grid',
  '.product',
  '.item',
  '.shipment-item',
];

/**
 * Generate unique ID for items
 */
function generateId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculate confidence level based on what was found/guessed
 */
function calculateConfidence(details: ParsedAmazonItem['confidenceDetails']): 'high' | 'medium' | 'low' {
  const { titleFound, priceFound, priceGuessed, dateGuessed } = details;
  
  if (!titleFound || !priceFound) return 'low';
  if (priceGuessed || dateGuessed) return 'medium';
  return 'high';
}

/**
 * Main parsing function - extracts items from Amazon HTML
 */
export function parseAmazonHTML(html: string): ParseResult {
  console.log('[parseAmazonHTML] ====== STARTING AMAZON HTML PARSER ======');
  console.log('[parseAmazonHTML] HTML length:', html.length, 'characters');
  const warnings: string[] = [];
  const items: ParsedAmazonItem[] = [];
  const seenItems = new Set<string>(); // For deduplication
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    console.log('[parseAmazonHTML] Document parsed successfully');
    
    // Check if this is Vine HTML
    if (isVineHTML(doc)) {
      console.log('[parseAmazonHTML] Switching to VINE MODE parser');
      return parseVineHTML(doc);
    }
    
    // Strategy 1: Look for order containers
    let orderCards: Element[] = [];
    for (const selector of ORDER_SELECTORS) {
      const found = doc.querySelectorAll(selector);
      if (found.length > 0) {
        orderCards = [...orderCards, ...Array.from(found)];
      }
    }
    
    // Process order cards
    for (const orderCard of orderCards) {
      const dateResult = extractDate(orderCard);
      
      // Find items within this order
      let itemElements: Element[] = [];
      for (const selector of ITEM_SELECTORS) {
        const found = orderCard.querySelectorAll(selector);
        if (found.length > 0) {
          itemElements = [...itemElements, ...Array.from(found)];
        }
      }
      
      // If no items found, treat the order card itself as an item
      if (itemElements.length === 0) {
        itemElements = [orderCard];
      }
      
      for (const itemEl of itemElements) {
        const titleResult = extractTitle(itemEl);
        if (!titleResult.title || titleResult.title.length < 5) continue;
        
        const priceResult = extractPrice(itemEl, itemEl.textContent || '');
        const asin = extractASIN(itemEl);
        const imageUrl = extractImage(itemEl);
        
        // Create deduplication key
        const dedupKey = asin || `${titleResult.title.toLowerCase()}-${priceResult.price}`;
        if (seenItems.has(dedupKey)) continue;
        seenItems.add(dedupKey);
        
        const confidenceDetails = {
          titleFound: titleResult.found,
          priceFound: priceResult.price > 0,
          priceGuessed: priceResult.guessed,
          dateFound: !dateResult.guessed,
          dateGuessed: dateResult.guessed,
          asinFound: !!asin,
        };
        
        items.push({
          id: generateId(),
          title: titleResult.title,
          cleanTitle: sanitizeTitle(titleResult.title),
          orderDate: dateResult.date,
          price: priceResult.price,
          asin,
          imageUrl,
          selected: priceResult.price > 0, // Only auto-select if we have a price
          confidence: calculateConfidence(confidenceDetails),
          confidenceDetails,
        });
      }
    }
    
    // Strategy 2: Fallback - search entire document for product links
    if (items.length === 0) {
      warnings.push('No order containers found, using fallback parsing strategy');
      
      const allLinks = doc.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
      
      for (const link of allLinks) {
        const title = link.textContent?.trim() || link.getAttribute('title');
        if (!title || title.length < 5) continue;
        
        // Walk up to find a containing element with price
        let parent = link.parentElement;
        let priceResult = { price: 0, guessed: true };
        
        for (let i = 0; i < 8 && parent; i++) {
          priceResult = extractPrice(parent, parent.textContent || '');
          if (priceResult.price > 0) break;
          parent = parent.parentElement;
        }
        
        if (priceResult.price <= 0) continue;
        
        const asin = extractASIN(link.parentElement || link);
        const dedupKey = asin || `${title.toLowerCase()}-${priceResult.price}`;
        if (seenItems.has(dedupKey)) continue;
        seenItems.add(dedupKey);
        
        const imageUrl = extractImage(link.parentElement || link);
        
        const confidenceDetails = {
          titleFound: true,
          priceFound: priceResult.price > 0,
          priceGuessed: priceResult.guessed,
          dateFound: false,
          dateGuessed: true,
          asinFound: !!asin,
        };
        
        items.push({
          id: generateId(),
          title,
          cleanTitle: sanitizeTitle(title),
          orderDate: new Date().toISOString(),
          price: priceResult.price,
          asin,
          imageUrl,
          selected: true,
          confidence: calculateConfidence(confidenceDetails),
          confidenceDetails,
        });
      }
    }
    
    if (items.length === 0) {
      warnings.push('No items could be extracted from the HTML');
    }
    
  } catch (error) {
    warnings.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return {
    items,
    totalFound: items.length,
    parseWarnings: warnings,
    isVineMode: false,
  };
}

// ============================================================================
// PLACEHOLDER IMAGE EXPORT
// ============================================================================

export { PLACEHOLDER_IMAGE };
