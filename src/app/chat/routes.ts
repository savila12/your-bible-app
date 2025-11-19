import {GoogleGenAI} from '@google/genai'

const apiKey = process.env.GEMINI_AI_KEY;
const ai = new GoogleGenAI({apiKey: apiKey})

export async function POST(request: Request) {
    const { question } = await request.json();

    const response = await ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            maxOutputTokens: 300,
        },
        history: [
            {
                role: 'user',
                parts: question,
            },
            {
                role: 'model',
                parts: 'Hello! How can I assist you today?',
            }
        ],
        
    });
    return new Response(JSON.stringify(response));
}

