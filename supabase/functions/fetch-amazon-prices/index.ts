import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OpenWeb Ninja API configuration
const OPENWEBNINJA_API_URL = 'https://api.openwebninja.com/amazon/product';

interface PriceResult {
  asin: string;
  price: number | null;
  currency: string;
  title?: string;
  imageUrl?: string;
  success: boolean;
  error?: string;
}

interface OpenWebNinjaResponse {
  data?: {
    asin?: string;
    product_title?: string;
    product_price?: string;
    product_original_price?: string;
    product_photo?: string;
    currency?: string;
  };
  error?: string;
  message?: string;
}

/**
 * Parse price string like "$29.99" or "29.99" to number
 */
function parsePriceString(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  
  // Remove currency symbols and commas
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const price = parseFloat(cleaned);
  
  return isNaN(price) ? null : Math.round(price * 100) / 100;
}

/**
 * Fetch product data from OpenWeb Ninja API
 */
async function fetchFromOpenWebNinja(asin: string, apiKey: string): Promise<PriceResult> {
  console.log(`[OpenWebNinja] Fetching ${asin}`);
  
  try {
    const url = `${OPENWEBNINJA_API_URL}?asin=${asin}&country=US`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });
    
    console.log(`[OpenWebNinja] Response status: ${response.status}`);
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { asin, price: null, currency: 'USD', success: false, error: 'Invalid API key' };
      }
      if (response.status === 429) {
        return { asin, price: null, currency: 'USD', success: false, error: 'Rate limit exceeded' };
      }
      if (response.status === 404) {
        return { asin, price: null, currency: 'USD', success: false, error: 'Product not found' };
      }
      return { asin, price: null, currency: 'USD', success: false, error: `API error: ${response.status}` };
    }
    
    const data: OpenWebNinjaResponse = await response.json();
    console.log(`[OpenWebNinja] Response data:`, JSON.stringify(data).substring(0, 200));
    
    if (data.error || !data.data) {
      return { 
        asin, 
        price: null, 
        currency: 'USD', 
        success: false, 
        error: data.error || data.message || 'No data returned' 
      };
    }
    
    const productData = data.data;
    const price = parsePriceString(productData.product_price) 
      || parsePriceString(productData.product_original_price);
    
    if (price === null) {
      return { 
        asin, 
        price: null, 
        currency: 'USD', 
        success: false, 
        error: 'Price not available' 
      };
    }
    
    return {
      asin,
      price,
      currency: productData.currency || 'USD',
      title: productData.product_title,
      imageUrl: productData.product_photo,
      success: true,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[OpenWebNinja] Error for ${asin}:`, errorMessage);
    return { asin, price: null, currency: 'USD', success: false, error: errorMessage };
  }
}

/**
 * Delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[fetch-amazon-prices] Starting price fetch via OpenWeb Ninja API...');
    
    // Get API key from environment (set via: supabase secrets set OPENWEBNINJA_API_KEY=xxx)
    const apiKey = Deno.env.get('OPENWEBNINJA_API_KEY');
    
    if (!apiKey) {
      console.error('[fetch-amazon-prices] Missing OPENWEBNINJA_API_KEY');
      return new Response(
        JSON.stringify({ error: 'API key not configured. Run: supabase secrets set OPENWEBNINJA_API_KEY=your_key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { asins } = await req.json() as { asins: string[] };
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or empty asins array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Limit to 20 ASINs per request to avoid timeout
    const limitedAsins = asins.slice(0, 20);
    console.log(`[fetch-amazon-prices] Processing ${limitedAsins.length} ASINs`);
    
    const results: PriceResult[] = [];
    
    for (let i = 0; i < limitedAsins.length; i++) {
      const asin = limitedAsins[i];
      console.log(`[fetch-amazon-prices] Fetching ${i + 1}/${limitedAsins.length}: ${asin}`);
      
      const result = await fetchFromOpenWebNinja(asin, apiKey);
      results.push(result);
      
      // Add small delay between requests to be respectful to the API
      if (i < limitedAsins.length - 1) {
        await delay(300);
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[fetch-amazon-prices] Complete. Success: ${successCount}/${results.length}`);
    
    return new Response(
      JSON.stringify({ 
        results,
        summary: {
          total: results.length,
          success: successCount,
          failed: results.length - successCount,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[fetch-amazon-prices] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
