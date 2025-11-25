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
    const res = await rag.upsertDocument({ id: 'doc-1', text: 'hello world' });
    expect(res).toEqual({ success: true, id: 'doc-1', size: 11 });
  });

  test('querySimilarDocuments validates inputs and returns result shape', async () => {
    await expect(rag.querySimilarDocuments('')).rejects.toThrow(/query is required/);
    const out = await rag.querySimilarDocuments('find me', 3);
    expect(out).toEqual({ results: [], topK: 3 });
  });
});
