import {GoogleGenAI} from '@google/genai'
import { fetchVerse, fetchRange, extractFirstVerseReference } from '../../lib/bibleApi';
import { retrieveRagContext } from '../../lib/rag';
import { searchWeb } from '../../lib/webSearch';

const apiKey = process.env.GEMINI_AI_KEY || process.env.GEMINI_API_KEY || '';
// If the key is not set, create the client but we'll guard and return a clear error.
const ai = new GoogleGenAI({ apiKey: apiKey })

const SYSTEM_PROMPT = `You are a knowledgeable Bible expert assistant. Your purpose is to answer questions about the Bible, Christian theology, and biblical topics with accuracy and clarity.

When answering:
- Focus on biblical content and interpretation
- Reference specific Bible verses when relevant (include book, chapter:verse)
- Be respectful and scholarly in tone
- If a question is not about the Bible, politely redirect to biblical topics
- Keep responses concise but informative (under 300 tokens)
- Provide multiple perspectives when applicable (e.g., different theological viewpoints)`;

export async function POST(request: Request) {
    // Read request body once (unknown shape) and validate/normalize
    const rawBody = await request.json().catch(() => ({} as unknown));

    // Runtime types and helpers
    type ChatContentItem = { role: 'user' | 'assistant' | 'system' | 'model'; content: string };
    type ChatRequestBody = { question: string; contents?: ChatContentItem[]; devMock?: boolean };

    function isChatContentItem(obj: unknown): obj is ChatContentItem {
        if (!obj || typeof obj !== 'object') return false;
        const r = (obj as Record<string, unknown>).role;
        const c = (obj as Record<string, unknown>).content;
        return (r === 'user' || r === 'assistant' || r === 'system' || r === 'model') && typeof c === 'string';
    }

    function parseRequest(raw: unknown): { error?: string; value?: ChatRequestBody } {
        if (!raw || typeof raw !== 'object') return { error: 'Invalid request body' };
        const rb = raw as Record<string, unknown>;
        const q = rb.question;
        if (typeof q !== 'string' || !q.trim()) return { error: 'Invalid or missing `question` field' };

        const rawContents = rb.contents;
        let contents: ChatContentItem[] | undefined = undefined;
        if (rawContents !== undefined) {
            if (!Array.isArray(rawContents)) return { error: '`contents` must be an array when provided' };
            const parsed: ChatContentItem[] = [];
            for (const item of rawContents) {
                if (!isChatContentItem(item)) return { error: 'Invalid item in `contents` array' };
                parsed.push(item as ChatContentItem);
            }
            contents = parsed;
        }

        const devMock = rb.devMock === true;
        return { value: { question: q.trim(), contents, devMock }  as ChatRequestBody };
    }

    const parsed = parseRequest(rawBody);
    if (parsed.error) {
        return new Response(JSON.stringify({ success: false, error: parsed.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { question, contents = [], devMock: clientDevMock = false } = parsed.value as ChatRequestBody;

    // DEV mock mode: useful for local development when real keys or external services are unavailable.
    // Conditions that enable mock:
    //  - server env DEV_MOCK=true (always mock)
    //  - OR when running in development allow client to request dev mock via `devMock` in the request
    const DEV_MOCK = process.env.DEV_MOCK === 'true' || (process.env.NODE_ENV === 'development' && clientDevMock);

    if (DEV_MOCK) {
        try {
            // Support both single-verse and same-chapter ranges in dev mock
            const rangeRegex = /\b([1-3]?\s?[A-Za-z.]+\s+\d{1,3}:\d{1,3}\s*-\s*(?:\d{1,3}:\d{1,3}|\d{1,3}))\b/;
            const rangeMatch = String(question || '').match(rangeRegex);
            if (rangeMatch) {
                const rangeRef = rangeMatch[1].trim();
                const map = await fetchRange(rangeRef);
                const entries = Object.entries(map).filter(([, t]) => t != null);
                const combined = entries.map(([ref, t]) => `${ref}: ${t}`).join('\n');
                const mockText = combined ? `DEV MOCK: Found reference ${rangeRef} — ${combined}` : 'DEV MOCK: This is a canned response for development.';
                return new Response(String(mockText), {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                });
            }

            const verseRef = extractFirstVerseReference(question || '');
            const verseText = verseRef ? (await fetchVerse(verseRef)) ?? null : null;
            const mockText = verseText
                ? `DEV MOCK: Found reference ${verseRef} — ${verseText}`
                : 'DEV MOCK: This is a canned response for development.';
            return new Response(String(mockText), {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        } catch (err) {
            return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Build chat history: prepend system prompt as first message if starting new conversation
    const messages = contents.length === 0
        ? [
            { role: 'user', parts: SYSTEM_PROMPT },
            { role: 'model', parts: 'I understand. I\'m ready to help with biblical questions.' },
          ]
        : contents.map((msg: { role: string; content: string }) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: msg.content,
        }));

    // (message insertion and range/verse expansion already handled above)

    // Retrieve RAG context from Supabase for the question/range and add as system messages
    const ragSnippets = await retrieveRagContext(question);
    if (Array.isArray(ragSnippets) && ragSnippets.length > 0) {
        messages.push(...ragSnippets.map((snippet: string) => ({
            role: 'system',
            parts: `Related context: ${snippet}`
        })));
    } else {
        // If RAG returned nothing, try web search as a fallback and surface those snippets
        try {
            const web = await searchWeb(question, 3);
            if (Array.isArray(web) && web.length > 0) {
                // Insert a short guidance so the model knows these are external web snippets
                messages.push({ role: 'system', parts: 'Note: the following short web-sourced commentary snippets are provided as reference — you may use them to inform your answer and should cite the source where appropriate.' });

                // Format each web result as a short, attributed snippet (numbered)
                const maxLen = 200;
                for (let i = 0; i < web.length; i++) {
                    const raw = String(web[i] ?? '');
                    // attempt to extract a URL if present (common in search results)
                    const urlMatch = raw.match(/(https?:\/\/\S+)/);
                    const url = urlMatch ? urlMatch[0] : null;

                    // prefer to show a short snippet (avoid very long insertions)
                    const textOnly = url ? raw.replace(url, '').trim() : raw;
                    const short = textOnly.length > maxLen ? textOnly.substring(0, maxLen - 1).trim() + '…' : textOnly;

                    const formatted = url ? `Web context [${i + 1}]: ${short} (source: ${url})` : `Web context [${i + 1}]: ${short}`;
                    messages.push({ role: 'system', parts: formatted });
                }
            }
        } catch (err) {
            // Non-fatal — continue without web context
            console.warn('webSearch fallback failed', err);
        }
    }

    // If the user referenced a verse (e.g. "John 3:16"), try to fetch it and insert into the history
    // Try to detect a range (e.g. "John 3:16-18" or "John 3:16-4:2") first, otherwise fallback
    // to single-verse detection via extractFirstVerseReference
    const rangeRegex = /\b([1-3]?\s?[A-Za-z.]+\s+\d{1,3}:\d{1,3}\s*-\s*(?:\d{1,3}:\d{1,3}|\d{1,3}))\b/;
    const rangeMatch = String(question || '').match(rangeRegex);
    if (rangeMatch) {
        const rangeRef = rangeMatch[1].trim();
        try {
            const map = await fetchRange(rangeRef);
            const entries = Object.entries(map).filter(([, t]) => t != null);
            if (entries.length) {
                // Insert expanded verse entries at the start of the messages so the model can reference them
                const verseMessages = entries.map(([ref, text]) => ({ role: 'user', parts: `Reference ${ref}: ${text}` }));
                messages.unshift(...verseMessages);
            }
        } catch (err) {
            console.warn('Failed to fetch range from bible-api', err);
        }
    } else {
        const verseRef = extractFirstVerseReference(question || '');
        if (verseRef) {
            try {
                const verseText = await fetchVerse(verseRef);
                if (verseText) {
                    // Insert the retrieved verse content into the start of the messages so the model can reference it
                    messages.unshift({ role: 'user', parts: `Reference ${verseRef}: ${verseText}` });
                }
            } catch (err) {
                // Non-fatal — continue without blocking the user
                console.warn('Failed to fetch verse from bible-api', err);
            }
        }
    }

    // Add current question
    messages.push({
        role: 'user',
        parts: question,
    });

    if (!apiKey) {
        console.error('GEMINI_AI_KEY (or GEMINI_API_KEY) is not set in the environment');
        return new Response(JSON.stringify({ success: false, error: 'GEMINI_AI_KEY missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        // Use the chats API (history) to keep behavior predictable and compatible
        // Convert our simple `parts` strings into the SDK's expected array-of-parts format
        const sdkHistory = messages.map((m) => ({ role: m.role, parts: [{ text: String(m.parts) }] }));
        const response = await ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                maxOutputTokens: 300,
            },
            // `messages` uses a compact shape for our internal flow. The SDK expects a more complex
            // `parts` structure. Cast to a compatible shape for the SDK without using `any`.
            // The internal `parts` we provide are strings — the SDK accepts arrays of parts and
            // may be more structured, but a simple array-of-strings is accepted at runtime.
            history: sdkHistory,
        });

        // Normalize the model response so the client only receives a single `text` string.
        // Different model clients may return results in different shapes — prefer a few
        // known fields and fall back to a safe stringified representation.
        const extractText = (resp: unknown): string => {
            if (resp === null || resp === undefined) return '';
            if (typeof resp === 'string') return resp;

            const r = resp as Record<string, unknown>;
            if (typeof r.text === 'string') return r.text;
            if (typeof r.outputText === 'string') return r.outputText;
            if (typeof r.output === 'string') return r.output;

            // handle array outputs or nested formats
            if (Array.isArray(r.output)) {
                return (r.output as unknown[])
                    .map((p) => {
                        if (typeof p === 'string') return p;
                        const pRec = p as Record<string, unknown>;
                        if (Array.isArray(pRec.content)) {
                            const contentArr = pRec.content as unknown[];
                            if (contentArr.length > 0 && typeof contentArr[0] === 'object' && contentArr[0] !== null) {
                                const first = contentArr[0] as Record<string, unknown>;
                                if (typeof first.text === 'string') return String(first.text);
                            }
                        }
                        if (typeof pRec.text === 'string') return pRec.text as string;
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n');
            }

            // Common alternative shapes
            if (Array.isArray(r.result) && r.result.length > 0) {
                const res0 = r.result[0] as Record<string, unknown>;
                const content = res0.content as Record<string, unknown> | undefined;
                if (content && typeof content.text === 'string') return content.text;
            }

            const choices = r.choices as unknown[] | undefined;
            if (Array.isArray(choices) && choices.length > 0) {
                const first = choices[0] as Record<string, unknown>;
                const message = first.message as Record<string, unknown> | undefined;
                if (message && typeof message.content === 'string') return message.content;
                if (typeof first.text === 'string') return first.text;
            }

            // Last resort — return a safe compact string so the client never receives a huge object
            // If we couldn't find any textual content in the model response, return
            // an empty string rather than stringifying the entire response object.
            // This prevents accidental leakage of sensitive fields (e.g. nested
            // client config or API keys) into the HTTP response body.
            return '';
        };

        const answerText = extractText(response);
        return new Response(String(answerText), {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Failed to process your question. Please try again.',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

export async function GET() {
    // Return whether server-side DEV_MOCK is enabled so the client can show an indicator
    const serverDevMock = process.env.DEV_MOCK === 'true';
    return new Response(JSON.stringify({ devMockEnabled: serverDevMock }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
