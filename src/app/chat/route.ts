import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { fetchVerse, fetchRange, extractFirstVerseReference } from '../../lib/bibleApi';
import { retrieveRagContext } from '../../lib/rag';
import { searchWeb } from '../../lib/webSearch';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a knowledgeable Bible expert assistant. Your purpose is to answer questions about the Bible, Christian theology, and biblical topics with accuracy and clarity.

When answering:
- Focus on biblical content and interpretation
- Reference specific Bible verses when relevant (include book, chapter:verse)
- Be respectful and scholarly in tone
- If a question is not about the Bible, politely redirect to biblical topics
- Keep responses concise but informative (under 300 tokens)
- Provide multiple perspectives when applicable (e.g., different theological viewpoints)`;

export async function POST(req: Request) {
    const { messages, devMock } = await req.json();

    // DEV mock mode: useful for local development when real keys or external services are unavailable.
    const DEV_MOCK = process.env.DEV_MOCK === 'true' || (process.env.NODE_ENV === 'development' && devMock);

    if (DEV_MOCK) {
        const lastMessage = messages[messages.length - 1];
        const question = lastMessage.content;

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

    const lastMessage = messages[messages.length - 1];
    const question = lastMessage.content;

    // Retrieve RAG context from Supabase for the question/range and add as system messages
    const ragSnippets = await retrieveRagContext(question);
    let systemContext = '';

    if (Array.isArray(ragSnippets) && ragSnippets.length > 0) {
        systemContext += ragSnippets.map((snippet: string) => `Related context: ${snippet}`).join('\n');
    } else {
        // If RAG returned nothing, try web search as a fallback and surface those snippets
        try {
            const web = await searchWeb(question, 3);
            if (Array.isArray(web) && web.length > 0) {
                systemContext += '\nNote: the following short web-sourced commentary snippets are provided as reference — you may use them to inform your answer and should cite the source where appropriate.\n';

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
                    systemContext += formatted + '\n';
                }
            }
        } catch (err) {
            // Non-fatal — continue without web context
            console.warn('webSearch fallback failed', err);
        }
    }

    // If the user referenced a verse (e.g. "John 3:16"), try to fetch it and insert into the history
    const rangeRegex = /\b([1-3]?\s?[A-Za-z.]+\s+\d{1,3}:\d{1,3}\s*-\s*(?:\d{1,3}:\d{1,3}|\d{1,3}))\b/;
    const rangeMatch = String(question || '').match(rangeRegex);
    let verseContext = '';

    if (rangeMatch) {
        const rangeRef = rangeMatch[1].trim();
        try {
            const map = await fetchRange(rangeRef);
            const entries = Object.entries(map).filter(([, t]) => t != null);
            if (entries.length) {
                verseContext += entries.map(([ref, text]) => `Reference ${ref}: ${text}`).join('\n');
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
                    verseContext += `Reference ${verseRef}: ${verseText}`;
                }
            } catch (err) {
                console.warn('Failed to fetch verse from bible-api', err);
            }
        }
    }

    const result = streamText({
        model: google('gemini-2.0-flash-001'),
        system: `${SYSTEM_PROMPT}\n\n${systemContext}\n\n${verseContext}`,
        messages,
    });

    return result.toTextStreamResponse();
}

export async function GET() {
    // Return whether server-side DEV_MOCK is enabled so the client can show an indicator
    const serverDevMock = process.env.DEV_MOCK === 'true';
    return new Response(JSON.stringify({ devMockEnabled: serverDevMock }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
