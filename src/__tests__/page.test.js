/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../app/page';

describe('Home page', () => {
  beforeEach(() => {
    // Simple fetch mock that returns a JSON payload
    // Tests will need a test runner (jest) and @testing-library installed to run.
    // Keep this mock minimal so the test file exists and is useful.
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ answer: 'Hello from mock' }) })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Renders a header', () => {
    render(<Home/>);
    const heading = screen.getByRole('heading', {level: 1});
    expect(heading).toBeInTheDocument();
  });

  test('renders form with textarea and submit button', () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /submit/i });
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
    const button = screen.getByRole('button', { name: /submit/i });

    fireEvent.change(textarea, { target: { value: 'Who wrote Genesis?' } });
    fireEvent.click(button);

    // Verify fetch was called with correct URL and method
    expect(global.fetch).toHaveBeenCalledWith('/chat', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Who wrote Genesis?' })
    }));
  });

  test('displays response from API after submission', async () => {
    render(<Home/>);
    const textarea = screen.getByPlaceholderText('Ask a question about the Bible...');
    const button = screen.getByRole('button', { name: /submit/i });

    fireEvent.change(textarea, { target: { value: 'Tell me about Moses' } });
    fireEvent.click(button);

    // Wait for the response to be displayed
    const responseHeading = await screen.findByRole('heading', { level: 2, name: /response/i });
    expect(responseHeading).toBeInTheDocument();

    // Verify the stringified JSON response is in the document
    expect(screen.getByText(/Hello from mock/)).toBeInTheDocument();
  });

  test('handles empty question submission', async () => {
    render(<Home/>);
    const button = screen.getByRole('button', { name: /submit/i });

    fireEvent.click(button);

    // Verify fetch was called even with empty string
    expect(global.fetch).toHaveBeenCalledWith('/chat', expect.objectContaining({
      body: JSON.stringify({ question: '' })
    }));
  });
});
