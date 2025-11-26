/**
 * @jest-environment jsdom
 */

describe('retrieveRagContext', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns up to 3 non-empty snippets in order', async () => {
    const mockTextSearch = jest.fn(async () => ({
      data: [
        { content: 'First snippet' },
        { content: null },
        { content: '  ' },
        { content: 'Second snippet' },
        { content: 'Third snippet' },
        { content: 'Fourth snippet' },
      ],
      error: null,
    }));

    jest.mock('../lib/supabaseClient', () => ({
      supabase: {
        from: () => ({
          select: () => ({
            textSearch: mockTextSearch,
          }),
        }),
      },
    }));

    const { retrieveRagContext } = require('../lib/rag');
    const res = await retrieveRagContext('test');

    expect(mockTextSearch).toHaveBeenCalledWith('content', 'test', { type: 'plain' });
    // only non-empty strings, up to 3
    expect(res).toEqual(['First snippet', 'Second snippet', 'Third snippet']);
  });

  test('returns [] on supabase error', async () => {
    const mockTextSearch = jest.fn(async () => ({ data: null, error: { message: 'boom' } }));
    jest.mock('../lib/supabaseClient', () => ({
      supabase: {
        from: () => ({ select: () => ({ textSearch: mockTextSearch }) }),
      },
    }));

    // Simulate webSearch returning no results
    jest.mock('../lib/webSearch', () => ({ searchWeb: async () => [] }));

    const { retrieveRagContext } = require('../lib/rag');
    const res = await retrieveRagContext('query');
    expect(res).toEqual([]);
  });

  test('falls back to webSearch when supabase returns no hits', async () => {
    const mockTextSearch = jest.fn(async () => ({ data: [], error: null }));
    jest.mock('../lib/supabaseClient', () => ({
      supabase: { from: () => ({ select: () => ({ textSearch: mockTextSearch }) }) },
    }));

    // provide a webSearch mock to verify fallback
    const webResults = ['Commentary A — snippet', 'Commentary B — snippet'];
    jest.mock('../lib/webSearch', () => ({ searchWeb: async () => webResults }));

    const { retrieveRagContext } = require('../lib/rag');
    const res = await retrieveRagContext('no local docs');

    expect(mockTextSearch).toHaveBeenCalled();
    expect(res).toEqual(webResults.slice(0, 3));
  });

  test('returns [] on thrown exception from client', async () => {
    const mockTextSearch = jest.fn(async () => {
      throw new Error('network');
    });
    jest.mock('../lib/supabaseClient', () => ({
      supabase: {
        from: () => ({ select: () => ({ textSearch: mockTextSearch }) }),
      },
    }));

    // when the client throws we fallback to web search — test returns empty web results
    jest.mock('../lib/webSearch', () => ({ searchWeb: async () => [] }));

    const { retrieveRagContext } = require('../lib/rag');
    const res = await retrieveRagContext('query');
    expect(res).toEqual([]);
  });
});
