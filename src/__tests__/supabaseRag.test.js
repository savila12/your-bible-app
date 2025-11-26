/**
 * @jest-environment jsdom
 */
const rag = require('../lib/supabaseRag');

describe('Supabase RAG helper', () => {
  afterEach(() => {
    // Reset env changes
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
    jest.resetAllMocks();
  });

  test('ensureSupabaseConfigured throws when missing env vars', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
    expect(() => rag.ensureSupabaseConfigured()).toThrow(/SUPABASE_URL and SUPABASE_KEY/);
  });

  test('ensureSupabaseConfigured returns config when set', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    const cfg = rag.ensureSupabaseConfigured();
    expect(cfg.url).toBe('https://example.supabase.co');
    expect(cfg.key).toBe('test-key');
  });

  test('upsertDocument validates inputs', async () => {
    await expect(rag.upsertDocument({ id: '', text: 'x' })).rejects.toThrow(/document id is required/);
    await expect(rag.upsertDocument({ id: '1', text: '' })).rejects.toThrow(/document text is required/);
  });

  test('upsertDocument returns expected shape', async () => {
    jest.resetModules();
    // mock supabase upsert so the function can upsert without throwing in tests
    jest.mock('../lib/supabaseClient', () => ({
      supabase: { from: () => ({ upsert: async (payload) => ({ data: [{ id: payload.id }], error: null }) }) },
    }));
    const r = require('../lib/supabaseRag');
    const res = await r.upsertDocument({ id: 'doc-1', text: 'hello world' });
    expect(res.success).toBe(true);
    expect(res.id).toBe('doc-1');
    expect(res.size).toBe(11);
    expect(res.data && res.data[0] && res.data[0].id).toBe('doc-1');
  });

  test('querySimilarDocuments validates inputs and returns result shape', async () => {
    await expect(rag.querySimilarDocuments('')).rejects.toThrow(/query is required/);
    const out = await rag.querySimilarDocuments('find me', 3);
    expect(out).toEqual({ results: [], topK: 3 });
  });

  test('upsertDocument will call embedding when GEMINI key is set and add embedding to upsert', async () => {
    process.env.GEMINI_AI_KEY = 'fake-key';
    jest.resetModules();

    const mockEmbed = jest.fn(async () => ({ embeddings: [{ values: [0.1, 0.2, 0.3] }] }));
    jest.mock('@google/genai', () => ({ GoogleGenAI: function () { return { models: { embedContent: mockEmbed } } } }));

    const mockUpsert = jest.fn(async (payload) => ({ data: [{ id: payload.id }], error: null }));
    jest.mock('../lib/supabaseClient', () => ({ supabase: { from: () => ({ upsert: mockUpsert }) } }));

    const rmodule = require('../lib/supabaseRag');
    const res = await rmodule.upsertDocument({ id: 'doc-embed', text: 'embedded text' });

    expect(mockEmbed).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-embed', content: 'embedded text', embedding: expect.any(Array) }));
    expect(res.success).toBe(true);
  });

  test('querySimilarDocuments will use RPC vector flow and fallback to textSearch on RPC failure', async () => {
    process.env.GEMINI_AI_KEY = 'fake-key';
    jest.resetModules();

    const mockEmbed = jest.fn(async () => ({ embeddings: [{ values: [0.4, 0.5, 0.6] }] }));
    const mockRpc = jest.fn(async () => ({ data: [{ id: '1', content: 'Relevant doc' }], error: null }));

    jest.doMock('@google/genai', () => ({ GoogleGenAI: function () { return { models: { embedContent: mockEmbed } } } }));
    jest.doMock('../lib/supabaseClient', () => ({ supabase: { rpc: mockRpc } }));

    const { querySimilarDocuments } = require('../lib/supabaseRag');
    const res = await querySimilarDocuments('my query', 3);
    expect(mockEmbed).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('match_documents', { query_embedding: expect.any(Array), match_count: 3 });
    expect(res.results.length).toBeGreaterThan(0);

    // RPC failure -> fallback
    jest.resetModules();
    process.env.GEMINI_AI_KEY = 'fake-key';

    const badRpc = jest.fn(async () => { throw new Error('rpc failed'); });
    const mockTextSearch = jest.fn(async () => ({ data: [{ content: 'Fallback doc' }], error: null }));

    jest.doMock('@google/genai', () => ({ GoogleGenAI: function () { return { models: { embedContent: mockEmbed } } } }));
    jest.doMock('../lib/supabaseClient', () => ({ supabase: { rpc: badRpc, from: () => ({ select: () => ({ textSearch: mockTextSearch }) }) } }));

    const { querySimilarDocuments: query2 } = require('../lib/supabaseRag');
    const res2 = await query2('my query 2', 2);
    expect(mockTextSearch).toHaveBeenCalled();
    expect(res2.results.length).toBeGreaterThan(0);
  });
});
