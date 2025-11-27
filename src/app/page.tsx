'use client';
import { useState, useEffect, useMemo } from "react";
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';

export default function Home() {
  const [devMock, setDevMock] = useState<boolean>(false);
  const [serverDevMock, setServerDevMock] = useState<boolean | null>(null);
  const [input, setInput] = useState<string>('');
  // UI mode: 'question' or 'range'
  const [mode, setMode] = useState<'question' | 'range'>('question');

  // Create transport with API endpoint and body
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/chat',
    body: {
      devMock,
      mode,
    }
  }), [devMock, mode]);

  const { messages, error, sendMessage, status } = useChat({
    messages: [
      {
        id: 'welcome-message',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Shalom! I am your Bible AI Scholar. I can look up verses directly from Scripture or search for theological commentary. How can I help you today?'
          }
        ]
      }
    ],
    transport
  });

  const isLoading = status === 'submitted';

  useEffect(() => {
    // Check server-side DEV_MOCK flag
    let mounted = true;
    fetch('/chat')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        setServerDevMock(Boolean(j?.devMockEnabled));
      })
      .catch(() => {
        if (!mounted) return;
        setServerDevMock(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userInput = input;
    setInput(''); // Clear input immediately
    
    // Send the message using the useChat API with simple text format
    await sendMessage({ text: userInput });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 py-8 px-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center mb-2 text-blue-600">Bible AI Chat</h1>
        <p className="text-center text-gray-600 text-sm mb-6">Ask questions about the Bible and get expert insights</p>

        {/* Mock indicators */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-xs text-gray-500">Server mock:</div>
          <div
            data-testid="server-mock-pill"
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              serverDevMock ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {serverDevMock === null ? '---' : serverDevMock ? 'ON' : 'OFF'}
          </div>

          <div className="text-xs text-gray-500">Client mock:</div>
          <div
            data-testid="client-mock-pill"
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              devMock ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-200 text-gray-600'
            }`}
          >
            {devMock ? 'ON' : 'OFF'}
          </div>
        </div>

        {/* Chat messages */}
        <div className="bg-gray-100 rounded-lg p-4 mb-6 h-96 overflow-y-auto flex flex-col space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>Start a conversation by asking a biblical question</p>
            </div>
          ) : (
            messages.map((msg: UIMessage) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.parts.map((part) => part.type === 'text' ? part.text : 'Could not get answer. Please try again.')}</p>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-300 text-gray-900 px-4 py-2 rounded-lg">
                <p className="text-sm">Thinking...</p>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="text-sm">{error.message}</p>
          </div>
        )}

        {/* Input form with mode toggle */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-4 mb-1">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="mode"
                value="question"
                checked={mode === 'question'}
                onChange={() => setMode('question')}
                disabled={isLoading}
              />
              Question
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="mode"
                value="range"
                checked={mode === 'range'}
                onChange={() => setMode('range')}
                disabled={isLoading}
              />
              Verse Range
            </label>
          </div>
          <textarea
            value={input}
            onChange={handleInputChange}
            rows={3}
            placeholder={mode === 'range' ? 'Enter a Bible verse range, e.g. John 3:16-4:2' : 'Ask a question about the Bible...'}
            disabled={isLoading}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none disabled:bg-gray-100"
          />
          {mode === 'range' && (
            <div className="text-xs text-gray-500 mb-1 ml-1">Example: <span className="font-mono">John 3:16-4:2</span> or <span className="font-mono">Genesis 1:1-5</span></div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={devMock}
              onChange={(e) => setDevMock(e.target.checked)}
              className="w-4 h-4"
              disabled={isLoading}
            />
            <span>Dev mock</span>
          </label>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
          >
            {isLoading ? (mode === 'range' ? 'Expanding...' : 'Loading...') : (mode === 'range' ? 'Expand Range' : 'Ask')}
          </button>
        </form>
      </div>
    </div>
  );
}