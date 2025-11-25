/**
 * Minimal Supabase RAG helper utilities (placeholder) —
 * provides small functions so tests and future implementation have a stable surface.
 *
 * This is intentionally lightweight: it only validates environment configuration
 * and performs basic input checks. It will be expanded later to wire up
 * real Supabase clients and embedding services.
 */

export function ensureSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set to use the RAG toolset');
  }
  return { url, key };
}

export async function upsertDocument({ id, text }: { id: string; text: string }) {
  if (!id) throw new Error('document id is required');
  if (!text) throw new Error('document text is required');
  // placeholder: in real implementation, upsert to Supabase vector store and return metadata
  // For now, just return a success object with an id and size metadata
  return { success: true, id, size: text.length };
}

export async function querySimilarDocuments(query: string, topK = 5) {
  if (!query) throw new Error('query is required');
  // placeholder: in real implementation, call the embeddings API + supabase RPC
  // Return an empty list for now; tests focus on config + input validation
  return { results: [], topK };
}

export default { ensureSupabaseConfigured, upsertDocument, querySimilarDocuments };
