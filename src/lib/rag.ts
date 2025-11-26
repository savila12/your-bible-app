// src/lib/rag.ts
import { supabase } from './supabaseClient';
import { querySimilarDocuments } from './supabaseRag';
import { searchWeb } from './webSearch';

/**
 * Retrieve relevant context from Supabase for a given query (question or verse range).
 * This is a placeholder: adjust table/column names as needed for your schema.
 */
export async function retrieveRagContext(query: string): Promise<string[]> {
  // Example: search a 'documents' table with a 'content' column using full-text search
  type DocRow = { content: string | null };

  // Try vector retrieval first (if available) and fall back to text search.
  try {
    const vect = await querySimilarDocuments(query, 3);
    if (vect && Array.isArray(vect.results) && vect.results.length > 0) {
      // Normalize different row shapes to a list of strings
      const texts = vect.results
          .map((r: unknown) => {
            if (!r || typeof r !== 'object') return null;
            const obj = r as Record<string, unknown>;
            if (typeof obj.content === 'string') return obj.content;
            if (typeof obj.text === 'string') return obj.text;
            return null;
          })
        .filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
        .slice(0, 3);

      if (texts.length > 0) return texts;
    }
  } catch {
    // ignore vector failures and continue with textSearch fallback
  }
  try {
    const raw = await supabase
      .from('documents')
      .select('content')
      .textSearch('content', query, { type: 'plain' });
    // normalize shape: data may be DocRow[] | null, error may be any
    const { data, error } = raw as { data: DocRow[] | null; error?: unknown };

    if (error) {
      console.error('Supabase RAG error:', error);
      // Try web search as a fallback when Supabase returns an error
      try {
        const web = await searchWeb(query, 3);
        return web;
      } catch {
        return [];
      }
    }

    // Return up to 3 relevant non-empty snippets
    const snippets = (data || [])
      .map((row) => row.content)
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .slice(0, 3);

    if (snippets.length > 0) return snippets;

    // No local snippets found — fall back to webSearch for external commentary
    try {
      const web = await searchWeb(query, 3);
      return web;
    } catch {
      return [];
    }
  } catch (err) {
    // If any exception occurs (e.g. network, client not installed), log and return empty results
    console.error('Supabase RAG fetch failed:', err);
    // If Supabase fails, try the web search fallback for external commentary
    try {
      const web = await searchWeb(query, 3);
      return web;
    } catch {
      return [];
    }
  }
}
