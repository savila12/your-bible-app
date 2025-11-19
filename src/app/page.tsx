'use client';
import { useState } from "react";

export default function Home() {
  const [response, setResponse] = useState<string>("");
  const [value, setValue] = useState<string>("");

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: value }),
    });
    const data = await res.json();
    setResponse(JSON.stringify(data, null, 2));
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Your Bible AI Chat</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={value}
          onChange={onChange}
          rows={4}
          cols={50}
          placeholder="Ask a question about the Bible..."
        />
        <br />
        <button type="submit">Submit</button>
      </form>
      {response && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Response:</h2>
          <pre>{response}</pre>
        </div>
      )}
    </div>
  );
}