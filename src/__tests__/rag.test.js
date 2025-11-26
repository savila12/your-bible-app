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

    const { retrieveRagContext } = require('../lib/rag');
    const res = await retrieveRagContext('query');
    expect(res).toEqual([]);
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

    const { retrieveRagContext } = require('../lib/rag');
    const res = await retrieveRagContext('query');
    expect(res).toEqual([]);
  });
});
