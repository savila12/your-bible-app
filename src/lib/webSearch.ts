/**
 * Lightweight web-search helper.
 * - Attempts to call a configured web search provider (Bing Web Search API)
 * - Runs in a best-effort mode and returns a list of short text snippets.
 *
 * Configuration via environment variables (choose one):
 *  - BING_SEARCH_ENDPOINT (e.g. https://api.bing.microsoft.com/v7.0/search)
 *  - BING_API_KEY
 */

/**
 * Strongly-typed web search helper (Bing Web Search schema-ish)
 */
type BingWebValue = {
  name?: unknown;
  snippet?: unknown;
  text?: unknown;
  url?: unknown;
  displayUrl?: unknown;
};

type BingWebResponse = {
  webPages?: {
    value?: unknown;
  } | null;
};

function isBingWebValue(obj: unknown): obj is BingWebValue {
  return typeof obj === 'object' && obj !== null;
}

export async function searchWeb(query: string, topK = 3): Promise<string[]> {
  if (!query) throw new Error('query is required');

  const endpoint = process.env.BING_SEARCH_ENDPOINT;
  const key = process.env.BING_API_KEY;

  if (!endpoint || !key) {
    // No web provider configured — return empty to indicate no results
    return [];
  }

  try {
    const params = new URLSearchParams({ q: query, count: String(topK), textDecorations: 'false', textFormat: 'Raw' });
    const url = `${endpoint}?${params.toString()}`;

    const resp = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (!resp.ok) return [];

    const json = (await resp.json()) as unknown;

    // Parse Bing Web Search response shape: json.webPages.value[]
    const maybePages = (json as BingWebResponse).webPages?.value;
    if (!Array.isArray(maybePages)) return [];

    const results: string[] = [];
    for (const item of maybePages.slice(0, topK)) {
      if (!isBingWebValue(item)) continue;

      // safely coerce fields to strings if present
      const title = typeof item.name === 'string' ? item.name.trim() : '';
      const snippet = typeof item.snippet === 'string' ? item.snippet.trim() : typeof item.text === 'string' ? item.text.trim() : '';
      const url = typeof item.url === 'string' ? item.url.trim() : typeof item.displayUrl === 'string' ? item.displayUrl.trim() : '';

      const parts = [title, snippet, url].filter((p) => p && p.length > 0);
      const joined = parts.join(' — ');
      if (joined && joined.trim().length > 0) results.push(joined);
    }

    return results;
  } catch (err) {
    // Best-effort: do not throw for errors — return empty results
    console.warn('webSearch failed', err);
    return [];
  }
}

const webSearchModule = { searchWeb };

export default webSearchModule;
