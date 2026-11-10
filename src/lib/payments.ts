/**
 * Online and digital payment helpers for taking payments across channels:
 * Facebook Marketplace, flea markets, remote buyers, and local meetups.
 */

export interface DigitalPaymentConfig {
  venmoHandle?: string;
  cashAppTag?: string;
  paypalUsername?: string;
  zelleContact?: string;
  stripePaymentLink?: string;
}

export function buildVenmoUrl(handle: string, amount: number, note: string): string {
  const clean = handle.trim().replace(/^@/, '');
  if (!clean) return '';
  const amt = amount.toFixed(2);
  const n = encodeURIComponent(note || 'Purchase');
  return `https://venmo.com/${clean}?txn=pay&amount=${amt}&note=${n}`;
}

export function buildVenmoDeepLink(handle: string, amount: number, note: string): string {
  const clean = handle.trim().replace(/^@/, '');
  if (!clean) return '';
  const amt = amount.toFixed(2);
  const n = encodeURIComponent(note || 'Purchase');
  return `venmo://paycharge?txn=pay&recipients=${clean}&amount=${amt}&note=${n}`;
}

export function buildCashAppUrl(tag: string, amount: number): string {
  const clean = tag.trim().replace(/^\$/, '');
  if (!clean) return '';
  return `https://cash.app/$${clean}/${amount.toFixed(2)}`;
}

export function buildPayPalUrl(username: string, amount: number): string {
  const clean = username.trim().replace(/^@/, '');
  if (!clean) return '';
  return `https://paypal.me/${clean}/${amount.toFixed(2)}`;
}

/** Format credit card number with spaces every 4 digits */
export function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  const parts = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  return parts.join(' ');
}

/** Detect card issuer from leading digits */
export function detectCardBrand(digits: string): 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown' {
  const clean = digits.replace(/\D/g, '');
  if (/^4/.test(clean)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(clean)) return 'mastercard';
  if (/^3[47]/.test(clean)) return 'amex';
  if (/^6(011|5)/.test(clean)) return 'discover';
  return 'unknown';
}

/** Simple Luhn algorithm validation */
export function isValidCardNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/** Format MM/YY expiry */
export function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Generate a customer-facing payment message for FB Messenger, SMS, or email */
export function generateBuyerPaymentMessage({
  buyerName,
  itemTitle,
  total,
  paymentLinks,
}: {
  buyerName?: string;
  itemTitle: string;
  total: number;
  paymentLinks: {
    venmo?: string;
    cashApp?: string;
    paypal?: string;
    zelle?: string;
  };
}): string {
  const greeting = buyerName ? `Hi ${buyerName.trim()}!` : 'Hi!';
  const lines = [
    `${greeting} Here is the purchase summary for “${itemTitle}”:`,
    `Total: $${total.toFixed(2)}`,
    '',
    'You can complete your payment using any of the following options:',
  ];

  if (paymentLinks.venmo) lines.push(`• Venmo: ${paymentLinks.venmo}`);
  if (paymentLinks.cashApp) lines.push(`• Cash App: ${paymentLinks.cashApp}`);
  if (paymentLinks.paypal) lines.push(`• PayPal: ${paymentLinks.paypal}`);
  if (paymentLinks.zelle) lines.push(`• Zelle: ${paymentLinks.zelle}`);

  lines.push('', 'Let me know once you’ve sent it so I can mark it as paid and prepare your order. Thank you!');
  return lines.join('\n');
}

