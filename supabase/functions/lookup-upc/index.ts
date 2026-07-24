// @ts-nocheck - Deno Edge Function (not Node.js)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// UPCitemdb free trial endpoint — no API key, ~100 lookups/day.
// Set UPCITEMDB_API_KEY (supabase secrets set UPCITEMDB_API_KEY=xxx) to use
// the paid tier automatically.
const TRIAL_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const PAID_URL = 'https://api.upcitemdb.com/prod/v1/lookup';

interface LookupResponse {
  found: boolean;
  title: string | null;
  brand: string | null;
  upc: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { upc } = await req.json() as { upc?: string };
    const digits = (upc ?? '').replace(/\D/g, '');

    if (!digits || digits.length < 8 || digits.length > 14) {
      return new Response(
        JSON.stringify({ error: 'Invalid UPC' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('UPCITEMDB_API_KEY');
    const url = `${apiKey ? PAID_URL : TRIAL_URL}?upc=${digits}`;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['user_key'] = apiKey;
      headers['key_type'] = '3scale';
    }

    console.log(`[lookup-upc] Looking up ${digits} (${apiKey ? 'paid' : 'trial'})`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error =
        response.status === 429
          ? 'Daily lookup limit reached — linking still works manually'
          : `Lookup service error: ${response.status}`;
      console.warn(`[lookup-upc] ${error}`);
      const body: LookupResponse = { found: false, title: null, brand: null, upc: digits, error };
      return new Response(
        JSON.stringify(body),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const item = data?.items?.[0];

    const body: LookupResponse = {
      found: !!item?.title,
      title: item?.title ?? null,
      brand: item?.brand ?? null,
      upc: digits,
    };
    console.log(`[lookup-upc] ${digits} → ${body.found ? body.title : 'not found'}`);

    return new Response(
      JSON.stringify(body),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[lookup-upc] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
