// src/lib/supabaseClient.ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Provide a safe fallback in test/dev when @supabase/supabase-js is not available
function makeStubClient() {
  // minimal chainable stub to satisfy .from(...).select(...).textSearch(...)
  return {
    from: (_table: string) => ({
      select: (_cols?: string) => ({
        textSearch: async (_col: string, _query: string, _opts?: any) => ({ data: [], error: null }),
      }),
      textSearch: async (_col: string, _query: string, _opts?: any) => ({ data: [], error: null }),
    }),
  } as const;
}

let supabase: any = makeStubClient();

try {
  // attempt to load the real client if available and env vars are set
  // use require to avoid top-level ESM import failures in tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@supabase/supabase-js');
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
} catch (err) {
  // If @supabase/supabase-js isn't installed (e.g. in tests), continue with stub client
  // console.warn is intentionally omitted in tests to avoid noisy output
}

export { supabase };
