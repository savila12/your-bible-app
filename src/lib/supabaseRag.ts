/**
 * Minimal Supabase RAG helper utilities (placeholder) —
 * provides small functions so tests and future implementation have a stable surface.
 *
 * This is intentionally lightweight: it only validates environment configuration
 * and performs basic input checks. It will be expanded later to wire up
 * real Supabase clients and embedding services.
 */

import { supabase } from './supabaseClient';

export function ensureSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set to use the RAG toolset');
  }
  return { url, key };
}

/**
 * Upsert a document to Supabase with an embedding vector (if an embedding API key is available).
 * This will attempt to create an embedding with the GoogleGenAI client and upsert the document
 * into a `documents` table with columns { id, content, embedding }.
 */
export async function upsertDocument({ id, text }: { id: string; text: string }) {
  if (!id) throw new Error('document id is required');
  if (!text) throw new Error('document text is required');

  // Try to embed the text if an embedding key is present (GEMINI_AI_KEY / GEMINI_API_KEY)
  const apiKey = process.env.GEMINI_AI_KEY || process.env.GEMINI_API_KEY;
  let embedding: number[] | null = null;

  if (apiKey) {
    try {
      // require at runtime to avoid loading ESM packages at test bootstrap time
      // tests may mock '@google/genai' so use require here to allow jest mocks to take effect
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const embedResp = await ai.models.embedContent({ model: 'text-embedding-004', contents: [text] });
      // Best-effort extraction of embedding values; library may return different shapes
      const values = embedResp?.embeddings?.[0]?.values as number[] | undefined;
      if (Array.isArray(values)) embedding = values;
    } catch (err) {
      // non-fatal — continue and upsert content without a vector if embedding fails
      console.warn('embedding generation failed, continuing without embedding:', err);
      embedding = null;
    }
  }

  try {
    // Upsert into Supabase. Tests / dev may mock this client call.
    const payload: Record<string, unknown> = { id, content: text };
    if (embedding) payload.embedding = embedding;

    // Use upsert so same id updates content + embedding
    const { data, error } = await supabase.from('documents').upsert(payload);

    if (error) {
      return { success: false, id, error };
    }

    return { success: true, id, size: text.length, data };
  } catch (err) {
    // Keep this non-fatal for ingestion scripts - surface the error to callers
    return { success: false, id, error: String(err) };
  }
}

/**
 * Query similar documents using vector similarity (preferred) and fall back to
 * full-text search when vector flow is not available.
 */
export async function querySimilarDocuments(query: string, topK = 5) {
  if (!query) throw new Error('query is required');

  // Prefer vector/RPC based retrieval when embedding key exists
  const apiKey = process.env.GEMINI_AI_KEY || process.env.GEMINI_API_KEY;

  if (apiKey && typeof supabase.rpc === 'function') {
    try {
      // require client at runtime so tests won't try parsing the ESM package during module load
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const embedResp = await ai.models.embedContent({ model: 'text-embedding-004', contents: [query] });
      const qvec = embedResp?.embeddings?.[0]?.values as number[] | undefined;

      if (Array.isArray(qvec)) {
        // Try a server-side RPC named `match_documents` (typical in Supabase + pgvector setups)
        try {
          const raw = await supabase.rpc('match_documents', { query_embedding: qvec, match_count: topK });
          const { data, error } = raw as any;
          if (!error && Array.isArray(data)) {
            return { results: data, topK };
          }
        } catch (err) {
          // fall through to text search fallback
          console.warn('Supabase vector RPC failed, falling back to text search:', err);
        }
      }
    } catch (err) {
      // embedding failed; fall back to text search
      console.warn('embedding failed during querySimilarDocuments, falling back to text search', err);
    }
  }

  // Fallback plain-text search using the existing approach
  try {
    const raw = await supabase.from('documents').select('content').textSearch('content', query, { type: 'plain' });
    const { data, error } = raw as { data: Array<{ content: string | null }> | null; error?: unknown };
    if (error) return { results: [], topK };

    const results = (data || [])
      .map((r) => ({ content: r.content }))
      .filter((r) => typeof r.content === 'string' && r.content!.trim().length > 0)
      .slice(0, topK);

    return { results, topK };
  } catch (err) {
    console.warn('Fallback text search failed', err);
    return { results: [], topK };
  }
}

export default { ensureSupabaseConfigured, upsertDocument, querySimilarDocuments };
