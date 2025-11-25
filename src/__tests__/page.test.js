/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home page', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url, options) => {
      // initial GET for server mock status
      if (!options || options.method === 'GET') {
        return Promise.resolve({ json: () => Promise.resolve({ devMockEnabled: false }) });
      }
        // POST -> model response now returns text/plain
        return Promise.resolve({ ok: true, headers: { get: () => 'text/plain; charset=utf-8' }, text: () => Promise.resolve('This is a biblical answer.') });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders header and initial UI', () => {
    render(<Home/>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Bible AI Chat');
  });

  test('shows server mock indicator from server', async () => {
    // mock server returning DEV_MOCK true on GET
    global.fetch = jest.fn((url, options) => {
      if (!options || options.method === 'GET') {
        return Promise.resolve({ json: () => Promise.resolve({ devMockEnabled: true }) });
      }
        return Promise.resolve({ ok: true, headers: { get: () => 'text/plain' }, text: () => Promise.resolve('Answer') });
    });

    render(<Home />);
    // server indicator should update after fetch resolves
    const serverPill = await screen.findByTestId('server-mock-pill');
    expect(serverPill).toHaveTextContent('ON');
  });

  test('client mock toggle updates indicator', async () => {
    render(<Home />);
    const clientPill = screen.getByTestId('client-mock-pill');
    expect(clientPill).toHaveTextContent('OFF');

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(clientPill).toHaveTextContent('ON');
  });

  test('renders form with textarea and ask button', () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });
    expect(textarea).toBeInTheDocument();
    expect(button).toBeInTheDocument();
  });

  test('updates textarea value on user input', () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    fireEvent.change(textarea, { target: { value: 'What is the Gospel?' } });
    expect(textarea.value).toBe('What is the Gospel?');
  });

  test('submits form with correct fetch payload', async () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });

    fireEvent.change(textarea, { target: { value: 'Who wrote Genesis?' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/chat', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'Who wrote Genesis?', contents: [], devMock: false })
      }));
    });
  });

  test('displays user message and bot response in chat', async () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });

    fireEvent.change(textarea, { target: { value: 'Tell me about Moses' } });
    fireEvent.click(button);

    // Wait for user message to appear
    await screen.findByText('Tell me about Moses');

    // Wait for bot response to appear
      await screen.findByText('This is a biblical answer.');
  });

  test('clears textarea after submission', async () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });

    fireEvent.change(textarea, { target: { value: 'Question?' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  test('shows loading state while fetching', async () => {
    global.fetch = jest.fn(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: true, headers: { get: () => 'text/plain' }, text: () => Promise.resolve('Answer') });
        }, 100);
      })
    );

    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });

    fireEvent.change(textarea, { target: { value: 'Question?' } });
    fireEvent.click(button);

    // Button should show 'Loading...' and be disabled
    expect(button).toHaveTextContent('Loading...');
    expect(button).toBeDisabled();

    // Wait for loading to complete
    await waitFor(() => {
      expect(button).toHaveTextContent('Ask');
    });
  });

  test('displays error message on API failure', async () => {
    global.fetch = jest.fn(() =>
        Promise.resolve({
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({
            success: false,
            error: 'API key missing'
          })
        })
    );

    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });

    fireEvent.change(textarea, { target: { value: 'Question?' } });
    fireEvent.click(button);

    // Wait for error message
    await screen.findByText('API key missing');
  });

  test('supports multi-turn conversation with history', async () => {
    global.fetch = jest.fn((url, options) => {
      // handle initial server GET
      if (!options || options.method === 'GET') {
        return Promise.resolve({ json: () => Promise.resolve({ devMockEnabled: false }) });
      }
      const body = JSON.parse(options.body);
      // Return different responses based on history length
      const isFollowUp = body.contents && body.contents.length > 0;
        return Promise.resolve({ ok: true, headers: { get: () => 'text/plain' }, text: () => Promise.resolve(isFollowUp ? 'Follow-up answer' : 'First answer') });
    });

    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /ask/i });

    // First question
    fireEvent.change(textarea, { target: { value: 'Who was David?' } });
    fireEvent.click(button);

    await screen.findByText('First answer');

    // Second question (follow-up)
    fireEvent.change(textarea, { target: { value: 'What about his son?' } });
    fireEvent.click(button);

    // Verify history was passed
    await waitFor(() => {
      // last fetch call should be the follow-up POST (GET, first POST, second POST)
      const calls = global.fetch.mock.calls;
      const lastCall = calls[calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.contents).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Who was David?' }),
        expect.objectContaining({ role: 'assistant', content: 'First answer' })
      ]));
    });
  });

  test('disables submit button when textarea is empty', () => {
    render(<Home/>);
    const button = screen.getByRole('button', { name: /ask/i });
    expect(button).toBeDisabled();

    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    fireEvent.change(textarea, { target: { value: 'Q' } });
    expect(button).not.toBeDisabled();

    fireEvent.change(textarea, { target: { value: '' } });
    expect(button).toBeDisabled();
  });
});
