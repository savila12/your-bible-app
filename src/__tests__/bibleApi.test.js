/**
 * @jest-environment jsdom
 */
const api = require('../lib/bibleApi');
const { fetchVerse, fetchVerses, clearCache } = api;

describe('bibleApi helpers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // clear the in-memory cache to avoid test bleed-through
    if (typeof clearCache === 'function') clearCache();
  });

  test('fetchVerses accepts array and returns mapping', async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).includes(encodeURIComponent('John 3:16'))) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'For God so loved...' }) });
      }
      if (String(url).includes(encodeURIComponent('Genesis 1:1'))) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'In the beginning...' }) });
      }
      return Promise.resolve({ ok: false });
    });

    const out = await fetchVerses(['John 3:16', 'Genesis 1:1']);
    expect(out['John 3:16']).toBe('For God so loved...');
    expect(out['Genesis 1:1']).toBe('In the beginning...');
  });

  test('fetchVerses accepts comma-separated string input', async () => {
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'abc' }) }));
    const out = await fetchVerses('John 3:16, Genesis 1:1');
    expect(Object.keys(out)).toEqual(['John 3:16', 'Genesis 1:1']);
    expect(out['John 3:16']).toBe('abc');
    expect(out['Genesis 1:1']).toBe('abc');
  });

  test('fetchVerses returns null for failed fetch', async () => {
    global.fetch = jest.fn((url) => Promise.resolve({ ok: false }));
    const out = await fetchVerses(['John 3:16']);
    expect(out['John 3:16']).toBeNull();
  });

  test('fetchVerses uses cache (does not call fetch twice for same ref)', async () => {
    // Prime cache using fetchVerse first
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'cached text' }) }));
    const first = await fetchVerse('John 3:16');
    expect(first).toBe('cached text');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Subsequent fetchVerses should re-use cache and not call fetch again for the same key
    global.fetch.mockClear();
    const out = await fetchVerses(['John 3:16', 'John 3:16']);
    expect(out['John 3:16']).toBe('cached text');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fetchRange expands same-chapter ranges', async () => {
    // return different values for each verse
    global.fetch = jest.fn((url) => {
      if (String(url).includes(encodeURIComponent('John 3:16'))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'v16' }) });
      if (String(url).includes(encodeURIComponent('John 3:17'))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'v17' }) });
      if (String(url).includes(encodeURIComponent('John 3:18'))) return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'v18' }) });
      return Promise.resolve({ ok: false });
    });

    const out = await api.fetchRange('John 3:16-18');
    expect(out['John 3:16']).toBe('v16');
    expect(out['John 3:17']).toBe('v17');
    expect(out['John 3:18']).toBe('v18');
  });

  test('fetchRange expands cross-chapter ranges', async () => {
    // Mock chapter length fetches and verse fetches
    global.fetch = jest.fn((url) => {
      // Normalize URL for easier matching
      const decoded = decodeURIComponent(url);
      // Chapter length fetch for John 3
      if (/John\s+3$/.test(decoded)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ verses: Array(36).fill(0).map((_, i) => ({ verse: i + 1 })) }) });
      }
      // Chapter length fetch for John 4
      if (/John\s+4$/.test(decoded)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ verses: Array(54).fill(0).map((_, i) => ({ verse: i + 1 })) }) });
      }
      // Verse fetches
      const verseMatch = decoded.match(/John\s+(\d+):(\d+)/);
      if (verseMatch) {
        const ch = verseMatch[1], v = verseMatch[2];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: `v${ch}:${v}` }) });
      }
      return Promise.resolve({ ok: false });
    });

    // John 3:16-4:2 should expand to John 3:16-3:36 and John 4:1-4:2
    const out = await api.fetchRange('John 3:16-4:2');
    // Check a few key verses
    expect(out['John 3:16']).toBe('v3:16');
    expect(out['John 3:36']).toBe('v3:36');
    expect(out['John 4:1']).toBe('v4:1');
    expect(out['John 4:2']).toBe('v4:2');
    // Check all expected keys are present
    const keys = Object.keys(out);
    // John 3:16-3:36
    for (let v = 16; v <= 36; v++) {
      expect(keys).toContain(`John 3:${v}`);
      expect(out[`John 3:${v}`]).toBe(`v3:${v}`);
    }
    // John 4:1-4:2
    for (let v = 1; v <= 2; v++) {
      expect(keys).toContain(`John 4:${v}`);
      expect(out[`John 4:${v}`]).toBe(`v4:${v}`);
    }
    expect(keys[0]).toBe('John 3:16');
    expect(keys[keys.length - 1]).toBe('John 4:2');
  });

  test('fetchRange returns chapter/book single passage', async () => {
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve({ text: 'chapter text' }) }));
    const out = await api.fetchRange('John 3');
    expect(Object.keys(out)).toEqual(['John 3']);
    expect(out['John 3']).toBe('chapter text');
  });
});
