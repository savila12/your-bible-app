'use client';
import { useState, useEffect } from "react";
//import { useChat } from 'ai/react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [devMock, setDevMock] = useState<boolean>(false);
  const [serverDevMock, setServerDevMock] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  //const {messages, input, handleInputChange, handleSubmit, isLoading} = useChat({maxSteps: 5});

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setError(""); // Clear error when user starts typing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError("");
    const userMessage = input;
    setInput("");

    try {
      // Add user message to chat
      const updatedMessages = [...messages, { role: 'user' as const, content: userMessage }];
      setMessages(updatedMessages);

      // Convert messages to API format (exclude last user message as it's in question param)
      const contents = updatedMessages.slice(0, -1).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const res = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: userMessage, contents, devMock }),
      });
      // Support both plain-text (success) and JSON (error) responses.
      const contentType = res.headers.get?.('content-type') || '';
      let responseText = '';
      if (res.ok && contentType.includes('text/plain')) {
        responseText = await res.text();
      } else if (contentType.includes('application/json')) {
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error || 'Failed to get response');
        }
        // In case a JSON success body is returned (backwards compatibility), read the text field
        responseText = json?.data?.text ?? '';
      } else {
        // Fallback to text for unknown content types (be permissive)
        responseText = await res.text();
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: responseText }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      // Remove the last user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

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
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {loading && (
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
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            value={input}
            onChange={onChange}
            rows={3}
            placeholder="Ask a question about the Bible..."
            disabled={loading}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none disabled:bg-gray-100"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={devMock}
              onChange={(e) => setDevMock(e.target.checked)}
              className="w-4 h-4"
              disabled={loading}
            />
            <span>Dev mock</span>
          </label>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
          >
            {loading ? 'Loading...' : 'Ask'}
          </button>
        </form>
      </div>
    </div>
  );
}