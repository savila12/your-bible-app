/**
 * @jest-environment jsdom
 */
// Use the jsdom/global Request available in the test environment

// Put the createMock in module scope and let jest.mock factory refer to it.
let createMock = jest.fn(async (args) => ({ text: 'mock ai reply' }));
process.env.GEMINI_AI_KEY = process.env.GEMINI_AI_KEY || 'test-key';

// Basic Response polyfill used in tests (route returns Response objects)
if (typeof global.Response === 'undefined') {
  // minimal implementation to allow text() and json()
  // Not intended to be fully spec-compliant — only for unit tests
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  global.Response = class {
    constructor(body, options = {}) {
      this._body = body;
      this.status = options.status || 200;
      this.headers = options.headers || { 'Content-Type': 'application/json' };
    }
    async text() {
      return String(this._body);
    }
    async json() {
      return JSON.parse(String(this._body));
    }
  };
}
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ chats: { create: (...args) => createMock(...args) } })),
}));

// require the route module after mocking
const routeModule = require('../app/chat/route');
const { POST } = routeModule;

describe('chat route verse retrieval', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // clear bible-api in-memory cache to ensure tests don't reuse previously cached verse text
    try {
      const bibleApi = require('../lib/bibleApi');
      if (typeof bibleApi.clearCache === 'function') bibleApi.clearCache();
    } catch (e) {
      // ignore
    }
    createMock = jest.fn(async (args) => ({ text: 'mock ai reply' }));
  });

  test('dev mock mode returns canned response and fetches verse when available', async () => {
    process.env.DEV_MOCK = 'true';

    // Mock bible-api return - even though DEV_MOCK mode uses fetchVerse it should be allowed
    global.fetch = jest.fn((url) => {
      if (String(url).includes('bible-api.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'For God so loved the world (John 3:16).' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const req = { json: async () => ({ question: 'Explain John 3:16', contents: [] }) };
    const res = await POST(req);
    const text = await res.text();

    expect(text).toMatch(/DEV MOCK/);
    expect(text).toMatch(/John 3:16/);

    // Should not invoke the AI when running in DEV_MOCK
    expect(createMock).not.toHaveBeenCalled();

    // Reset flag
    process.env.DEV_MOCK = undefined;
  });

  test('dev mock mode without verse returns simple canned response', async () => {
    process.env.DEV_MOCK = 'true';
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    const req = { json: async () => ({ question: 'Who wrote Genesis?', contents: [] }) };
    const res = await POST(req);
    const text = await res.text();

    expect(text).toMatch(/DEV MOCK/);
    expect(createMock).not.toHaveBeenCalled();

    process.env.DEV_MOCK = undefined;
  });

  test('client-provided devMock flag enables dev mock in development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // mock bible-api to return a verse
    global.fetch = jest.fn((url) => {
      if (String(url).includes('bible-api.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'For God so loved the world (John 3:16).' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const req = { json: async () => ({ question: 'Explain John 3:16', contents: [], devMock: true }) };
    const res = await POST(req);
    const text = await res.text();

    expect(text).toMatch(/DEV MOCK/);
    // Should not call the AI in client/DEV mock mode
    expect(createMock).not.toHaveBeenCalled();
    expect(text).toMatch(/John 3:16/);

    process.env.NODE_ENV = originalNodeEnv;
  });

  test('fetches verse and includes it in history when question contains a verse reference', async () => {
    // mock bible-api return
    global.fetch = jest.fn((url) => {
      if (String(url).includes('bible-api.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'For God so loved the world (John 3:16).' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const req = { json: async () => ({ question: 'Explain John 3:16', contents: [] }) };

    const res = await POST(req);
    const text = await res.text();

    // the route returns the normalized text payload
    expect(text).toBe('mock ai reply');
    // verify the mocked create function was called and history included the fetched verse text
    expect(createMock).toHaveBeenCalled();
    // The route should normalize the response and return only the text (we checked above)
    const callArgs = createMock.mock.calls[0][0];
    // history should be present and a content with the verse text should be among parts
    const history = callArgs.history || callArgs.contents || [];
    const joinedParts = history.map((h) => h.parts).join('\n');
    expect(joinedParts).toMatch(/John 3:16/);
    expect(joinedParts).toMatch(/For God so loved the world/);
  });

  test('fetchRange expands and inserts each verse into history for a range', async () => {
    // mock bible-api return for each verse
    global.fetch = jest.fn((url) => {
      if (String(url).includes(encodeURIComponent('John 3:16'))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'v16' }) });
      if (String(url).includes(encodeURIComponent('John 3:17'))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'v17' }) });
      if (String(url).includes(encodeURIComponent('John 3:18'))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'v18' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const req = { json: async () => ({ question: 'Explain John 3:16-18', contents: [] }) };
    const res = await POST(req);

    // the route returns plain text
    const text = await res.text();
    expect(text).toBe('mock ai reply');

    // ensure the AI client saw each verse inserted
    expect(createMock).toHaveBeenCalled();
    const callArgs = createMock.mock.calls[0][0];
    const history = callArgs.history || callArgs.contents || [];
    const joined = history.map((h) => h.parts).join('\n');
    expect(joined).toMatch(/Reference John 3:16: v16/);
    expect(joined).toMatch(/Reference John 3:17: v17/);
    expect(joined).toMatch(/Reference John 3:18: v18/);
  });

  test('does not leak nested secrets when model returns full client object', async () => {
    // Create a mock response that contains internal client config with an API key
    createMock = jest.fn(async () => ({
      apiClient: { clientOptions: { auth: { apiKey: 'super-secret-key' } }, apiKey: 'super-secret-key' },
      someOther: { nested: { data: 1 } },
    }));

    const req = { json: async () => ({ question: 'John 3:16', contents: [] }) };
    const res = await POST(req);
    const text = await res.text();

    // The route returns an empty text payload for responses that contain no safe text
    expect(text).toBe('');
    expect(String(text)).not.toMatch(/super-secret-key/);
    // Ensure AI create was called
    expect(createMock).toHaveBeenCalled();
  });

  test('does not fetch verse when question does not contain verse reference', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    const req = { json: async () => ({ question: 'Who wrote Genesis?', contents: [] }) };

    const res = await POST(req);
    const text = await res.text();

    expect(text).toBe('mock ai reply');
    // When there is no verse reference, we should not call bible-api in route
    expect(global.fetch).not.toHaveBeenCalled();
    // Ensure the mocked Gemni chat create was called
    expect(createMock).toHaveBeenCalled();
  });

  test('GET returns server devMockEnabled based on DEV_MOCK env var', async () => {
    // Ensure the GET handler reports server-level dev mock status
    process.env.DEV_MOCK = 'true';
    const { GET } = routeModule;
    const res = await GET();
    const json = await res.json();
    expect(json.devMockEnabled).toBe(true);

    process.env.DEV_MOCK = undefined;
  });

  test('client devMock is ignored when not in development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // createMock will return a distinct value so we can detect it
    createMock = jest.fn(async () => ({ text: 'prod ai reply' }));

    const req = { json: async () => ({ question: 'Explain John 3:16', contents: [], devMock: true }) };

    // mock bible-api to ensure it would return a verse if called
    global.fetch = jest.fn((url) => {
      if (String(url).includes('bible-api.com')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'For God so loved the world (John 3:16).' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const res = await POST(req);
    const text = await res.text();

    // Not in development -> client devMock should be ignored and AI should be called
    expect(text).not.toMatch(/DEV MOCK/);
    expect(text).toBe('prod ai reply');
    expect(createMock).toHaveBeenCalled();

    process.env.NODE_ENV = originalNodeEnv;
  });
});
