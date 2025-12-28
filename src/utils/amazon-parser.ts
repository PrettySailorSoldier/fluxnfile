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
  return isNaN(price) ? 0 : Math.round(price * 100) / 100;
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
      return { price, guessed: false };
    }
  }
  
  // Strategy 3: Contextual regex - find all $XX.XX patterns and score them
  const pricesWithContext = extractPricesWithContext(textContent);
  
  if (pricesWithContext.length > 0) {
    // Sort by score (positive first), then by price (lower first to avoid order totals)
    pricesWithContext.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.price - b.price;
    });
    
    // Take the best-scored price that's not in negative context
    for (const { price, score } of pricesWithContext) {
      if (score >= 0 && price > 0) {
        return { price, guessed: score === 0 };
      }
    }
    
    // If all prices were in negative context, take the smallest one as last resort
    const smallestPrice = pricesWithContext.reduce((min, curr) => 
      curr.price < min.price ? curr : min
    );
    if (smallestPrice.price > 0 && smallestPrice.price < 1000) {
      return { price: smallestPrice.price, guessed: true };
    }
  }
  
  // Strategy 4: Look for price patterns without $ symbol
  const numericPriceRegex = /(?:Price|Cost|Your)[:\s]*(\d{1,4}(?:\.\d{2})?)/gi;
  const numMatch = textContent.match(numericPriceRegex);
  if (numMatch) {
    const price = parsePrice(numMatch[0]);
    if (price > 0 && price < 10000) {
      return { price, guessed: true };
    }
  }
  
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
  
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      try {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          // Validate it's a reasonable date (not in future, not too old)
          const now = new Date();
          const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
          
          if (parsed <= now && parsed >= tenYearsAgo) {
            return { date: parsed.toISOString(), guessed: false };
          }
        }
      } catch {
        // Date parsing failed, continue
      }
    }
  }
  
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
  // Check data-asin attribute first
  const dataAsin = element.getAttribute('data-asin') 
    || element.querySelector('[data-asin]')?.getAttribute('data-asin');
  
  if (dataAsin && /^[A-Z0-9]{10}$/i.test(dataAsin)) {
    return dataAsin.toUpperCase();
  }
  
  // Check links
  const links = element.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    
    for (const pattern of ASIN_PATTERNS) {
      const match = href.match(pattern);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }
  }
  
  // Check element's own HTML for ASIN patterns
  const html = element.innerHTML;
  for (const pattern of ASIN_PATTERNS) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }
  
  return null;
}

// ============================================================================
// VINE MODE DETECTION & PARSING
// ============================================================================

/**
 * Detect if HTML is from Amazon Vine portal
 */
export function isVineHTML(doc: Document): boolean {
  return doc.querySelector('.vvp-reviews-table') !== null;
}

/**
 * Parse Unix timestamp (milliseconds) to ISO date string
 */
function parseVineTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return new Date().toISOString();
  }
  
  const ms = parseInt(timestamp, 10);
  if (isNaN(ms)) {
    return new Date().toISOString();
  }
  
  const date = new Date(ms);
  // Validate it's a reasonable date
  const now = new Date();
  const tenYearsAgo = new Date(now.getFullYear() - 10, 0, 1);
  const tenYearsFromNow = new Date(now.getFullYear() + 10, 0, 1);
  
  if (date >= tenYearsAgo && date <= tenYearsFromNow) {
    return date.toISOString();
  }
  
  return new Date().toISOString();
}

/**
 * Extract ASIN from Vine "Review item" button href
 */
function extractVineASIN(row: Element): string | null {
  // Look for links with asin= parameter
  const links = row.querySelectorAll('a[href*="asin="]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const asinMatch = href.match(/asin=([A-Z0-9]{10})/i);
    if (asinMatch && asinMatch[1]) {
      return asinMatch[1].toUpperCase();
    }
  }
  
  // Also check data-asin attributes
  const asinEl = row.querySelector('[data-asin]');
  if (asinEl) {
    const asin = asinEl.getAttribute('data-asin');
    if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
      return asin.toUpperCase();
    }
  }
  
  return null;
}

/**
 * Parse Amazon Vine HTML structure
 */
export function parseVineHTML(doc: Document): ParseResult {
  const warnings: string[] = [];
  const items: ParsedAmazonItem[] = [];
  const seenItems = new Set<string>();
  
  // Find all Vine table rows
  const rows = doc.querySelectorAll('tr.vvp-reviews-table--row');
  
  if (rows.length === 0) {
    warnings.push('No Vine items found in the HTML');
    return { items, totalFound: 0, parseWarnings: warnings, isVineMode: true };
  }
  
  for (const row of rows) {
    try {
      // Extract title from .a-truncate-full
      const titleEl = row.querySelector('.a-truncate-full');
      const title = titleEl?.textContent?.trim() || '';
      
      if (!title || title.length < 3) continue;
      
      // Extract image from .vvp-reviews-table--image-col img
      const imgEl = row.querySelector('.vvp-reviews-table--image-col img');
      let imageUrl = imgEl?.getAttribute('src') || null;
      
      // Fallback to any img in the row
      if (!imageUrl) {
        const anyImg = row.querySelector('img');
        imageUrl = anyImg?.getAttribute('src') || null;
      }
      
      // Filter out tiny/icon images
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = null;
      }
      
      // Extract date from data-order-timestamp attribute
      const timestampCell = row.querySelector('td[data-order-timestamp]');
      const timestamp = timestampCell?.getAttribute('data-order-timestamp');
      const orderDate = parseVineTimestamp(timestamp);
      const dateGuessed = !timestamp;
      
      // Extract ASIN from Review button link
      const asin = extractVineASIN(row);
      
      // Vine items have no price - default to $0.00
      const price = 0;
      
      // Create deduplication key
      const dedupKey = asin || title.toLowerCase();
      if (seenItems.has(dedupKey)) continue;
      seenItems.add(dedupKey);
      
      const confidenceDetails = {
        titleFound: true,
        priceFound: false, // Vine items don't have prices
        priceGuessed: true,
        dateFound: !dateGuessed,
        dateGuessed,
        asinFound: !!asin,
      };
      
      items.push({
        id: generateId(),
        title,
        cleanTitle: sanitizeTitle(title),
        orderDate,
        price,
        asin,
        imageUrl,
        selected: true, // Select all Vine items by default
        confidence: dateGuessed ? 'medium' : 'high',
        confidenceDetails,
      });
    } catch (error) {
      warnings.push(`Error parsing Vine row: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
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
  // Try selectors
  for (const selector of TITLE_SELECTORS) {
    try {
      const el = element.querySelector(selector);
      if (el) {
        // Prefer title attribute if available
        const title = el.getAttribute('title') || el.textContent;
        if (title && title.trim().length > 5) {
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
        return { title: text, found: true };
      }
    }
  }
  
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
          return null; // Too small, likely an icon
        }
      }
      
      return src;
    }
  }
  
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
  const warnings: string[] = [];
  const items: ParsedAmazonItem[] = [];
  const seenItems = new Set<string>(); // For deduplication
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Check if this is Vine HTML
    if (isVineHTML(doc)) {
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
