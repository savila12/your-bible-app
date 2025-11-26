// Small helper to fetch verses from bible-api.com
// Keeps a tiny in-memory cache to avoid repeated requests during a dev session.

const CACHE: Record<string, string> = {};

export async function fetchVerse(reference: string): Promise<string | null> {
  const normalized = reference.trim();
  if (!normalized) return null;
  if (CACHE[normalized]) return CACHE[normalized];

  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(normalized)}`);
    if (!res.ok) return null;
    const body = await res.json();
    // bible-api returns `text` with the full passage
    const text = body?.text || null;
    if (text) CACHE[normalized] = text;
    return text;
  } catch (err) {
    console.error('bible-api fetch failed', err);
    return null;
  }
}

/**
 * Fetch multiple verses in parallel.
 * Accepts either an array of reference strings or a single comma-separated string.
 * Returns a map-like object where each key is the original normalized reference and
 * the value is the verse text or `null` if the fetch failed.
 */
export async function fetchVerses(references: string[] | string): Promise<Record<string, string | null>> {
  let list: string[] = [];
  if (typeof references === 'string') {
    // Allow comma-separated input like "John 3:16, Genesis 1:1"
    list = references
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(references)) {
    list = references.map((s) => String(s).trim()).filter(Boolean);
  } else {
    throw new TypeError('references must be a string or an array of strings');
  }

  const results: Record<string, string | null> = {};

  // Resolve all verse fetches in parallel while preserving input-normalized keys.
  const calls = list.map(async (ref) => {
    const normalized = ref.trim();
    results[normalized] = await fetchVerse(normalized);
  });

  await Promise.all(calls);
  return results;
}

/**
 * Expand simple ranges and fetch multiple verses for a range string.
 * Supported patterns:
 *  - "Book Chapter:Start-End" e.g. "John 3:16-18" -> expands to each verse in that chapter
 *  - "Book Chapter:Start-Chapter2:End" e.g. "John 3:16-4:2" -> not expanded, fetched as single passage
 *  - chapter or book strings (e.g. "John 3" or "John") -> fetched as a single passage
 *
 * Returns a map keyed by the expanded references (or the original range for non-expanded cases)
 */
export async function fetchRange(range: string): Promise<Record<string, string | null>> {
  if (!range || typeof range !== 'string') throw new TypeError('range must be a non-empty string');

  const input = range.trim();

  // Regex for same-chapter ranges: Book Chapter:start-end
  const sameChapterMatch = input.match(/^([1-3]?\s?[A-Za-z.]+)\s+(\d+):(\d+)-(\d+)$/);
  if (sameChapterMatch) {
    const book = sameChapterMatch[1].trim();
    const chapter = Number(sameChapterMatch[2]);
    const start = Number(sameChapterMatch[3]);
    const end = Number(sameChapterMatch[4]);
    if (Number.isNaN(chapter) || Number.isNaN(start) || Number.isNaN(end) || start > end) {
      const single = await fetchVerse(input);
      return { [input]: single };
    }
    const list: string[] = [];
    for (let v = start; v <= end; v++) list.push(`${book} ${chapter}:${v}`);
    return fetchVerses(list);
  }

  // Regex for cross-chapter ranges: Book Chapter:Start-Chapter2:End
  // e.g. "John 3:16-4:2"
  const crossChapterMatch = input.match(/^([1-3]?\s?[A-Za-z.]+)\s+(\d+):(\d+)-(\d+):(\d+)$/);
  if (crossChapterMatch) {
    const book = crossChapterMatch[1].trim();
    const chapter1 = Number(crossChapterMatch[2]);
    const verse1 = Number(crossChapterMatch[3]);
    const chapter2 = Number(crossChapterMatch[4]);
    const verse2 = Number(crossChapterMatch[5]);
    if (
      Number.isNaN(chapter1) || Number.isNaN(verse1) ||
      Number.isNaN(chapter2) || Number.isNaN(verse2) ||
      chapter1 > chapter2 || (chapter1 === chapter2 && verse1 > verse2)
    ) {
      const single = await fetchVerse(input);
      return { [input]: single };
    }

    // Helper to get the number of verses in a chapter
    async function getChapterLength(book: string, chapter: number): Promise<number> {
      const ref = `${book} ${chapter}`;
      if (CACHE[`__chapterlen__${ref}`]) {
        return Number(CACHE[`__chapterlen__${ref}`]);
      }
      try {
        const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}`);
        if (!res.ok) return 0;
        const body = await res.json();
        const verses = Array.isArray(body?.verses) ? body.verses : [];
        const len = verses.length;
        if (len > 0) CACHE[`__chapterlen__${ref}`] = String(len);
        return len;
      } catch (err) {
        console.error('bible-api chapter length fetch failed', err);
        return 0;
      }
    }

    const list: string[] = [];
    // First chapter: from verse1 to end of chapter1
    const chapter1Len = await getChapterLength(book, chapter1);
    for (let v = verse1; v <= chapter1Len; v++) {
      list.push(`${book} ${chapter1}:${v}`);
    }
    // Middle chapters (if any)
    for (let c = chapter1 + 1; c < chapter2; c++) {
      const clen = await getChapterLength(book, c);
      for (let v = 1; v <= clen; v++) {
        list.push(`${book} ${c}:${v}`);
      }
    }
    // Last chapter: from 1 to verse2
    for (let v = 1; v <= verse2; v++) {
      list.push(`${book} ${chapter2}:${v}`);
    }
    return fetchVerses(list);
  }

  // Fallback: chapter or book string (e.g. "John 3" or "John")
  const single = await fetchVerse(input);
  return { [input]: single };
}

// Test helper: clear the in-memory cache (useful for unit tests)
export function clearCache() {
  for (const k of Object.keys(CACHE)) delete CACHE[k];
}

// quick normalizer: matches patterns like 'John 3:16' or '1 John 4:8'
export function extractFirstVerseReference(text: string): string | null {
  if (!text) return null;
  // regex accepts optional digit prefix (1,2,3) and book name words, then chapter:verse
  const match = text.match(/\b([1-3]?\s?[A-Za-z.]+\s+\d{1,3}:\d{1,3})\b/);
  return match ? match[1].trim() : null;
}
