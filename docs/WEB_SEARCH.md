# Web Search (Bing) — configuration & usage

This project supports a lightweight web-search fallback used by the RAG pipeline when the local vector DB (Supabase) returns no useful results.

Currently the guide and implementation are optimized for Microsoft Bing Web Search (Bing Search API) because it offers a straightforward HTTP surface and is easy to test with an API key.

Important: Do NOT commit any API keys. Use environment variables and secret stores in CI.

## Environment variables

Set these variables in your environment or `.env.local` (never commit `.env.local`):

- BING_SEARCH_ENDPOINT — the full Bing Web Search endpoint (e.g. `https://api.bing.microsoft.com/v7.0/search`)
- BING_API_KEY — your Bing / Azure Cognitive Services subscription key

Example (Windows PowerShell / `.env.local`):

```pwsh
# .env.local (do NOT commit)
BING_SEARCH_ENDPOINT=https://api.bing.microsoft.com/v7.0/search
BING_API_KEY=your_bing_api_key_here
```

## How it works

- The server route at `src/app/chat/route.ts` calls `retrieveRagContext()` which first attempts vector / Supabase retrieval.
- If no RAG results are found, the route calls `src/lib/webSearch.ts::searchWeb(query, topK)`.
- `searchWeb` is a best-effort helper that calls the configured Bing endpoint and returns short snippets (title + snippet + url when available). Those snippets are injected into the model history as `system` messages with short attribution.

## Testing

- Unit tests in `src/__tests__/` mock `searchWeb` so you don't need a real API key in CI for tests.
- To manually test locally, add the environment variables and run the dev app. Try a query that the RAG store does not contain — the server will call the web search API.

## Safety and production notes

- Consider whitelisting/blacklisting domains before injecting web content into prompts (to avoid low-quality or dangerous sources).
- Consider a summary step (e.g. call the LLM to summarize web results into a short bullet before insertion) to keep prompts concise and reduce token usage.
- Cache web search results where appropriate and add rate-limiting considerations for production.

## Alternatives

- You can plug another search provider by modifying `src/lib/webSearch.ts` to call your provider's API and return an array of short snippets.

If you'd like, I can add a small ingestion script and example SQL to create the Supabase table and `match_documents` RPC for pgvector.
