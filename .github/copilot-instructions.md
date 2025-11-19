Project overview

- This is a Next.js (app-router) TypeScript project with some JS tests and client components.
- App entry: `src/app` (server components by default). `src/app/layout.tsx` is the RootLayout (async server component).
- UI: `src/app/page.tsx` is a client component (`'use client'`) and sends a JSON POST to `/chat`.
- Server API route: `src/app/chat/routes.ts` — a POST handler that forwards questions to Google Gemini via the `@google/genai` client and returns the raw response.

Key workflows & commands

- Local dev: `npm run dev` (runs `next dev`). Open http://localhost:3000.
- Build: `npm run build` then `npm run start` to run a production server.
- Lint: `npm run lint` and `npm run lint:fix`.
- Tests: `npm run test` (Jest). `npm run test:watch` runs Jest in watch mode.

Project-specific conventions and gotchas

- App router + server components: files under `src/app` are server components by default. Use `'use client'` at the top of a file to make it a client component (see `src/app/page.tsx`).
- Server route shape: `src/app/chat/routes.ts` uses the Next `Request`/Response` API and expects a JSON body like `{ question: string }` and returns a JSON stringified response. The client calls `fetch('/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ question }) })` — tests and mocks should mirror this shape.
- External model integration: the route uses `@google/genai` (`GoogleGenAI`) and requires an env var `GEMINI_AI_KEY`. The package may not be in `package.json`; add it if running locally or CI. Provide the key in `.env.local` (NOT committed):

  GEMINI_AI_KEY=sk-xxxx

- next.config.ts: SWC compiler config enables `styledComponents`, `reactRemoveProperties`, and `removeConsole` (keeps `console.error`). Keep these when adding logging or styled-components.
- TypeScript: `tsconfig.json` sets `allowJs: true` and explicitly includes `src/__tests__/page.test.js` so JS tests are permitted. Path alias `@/*` maps to the repo root.

Testing notes

- Jest is configured with `next/jest` via `jest.config.ts` and `jest.setup.js` is referenced but currently empty. Add common mocks here (e.g., `global.fetch` polyfill) rather than in each test.
- Example minimal `jest.setup.js` snippet to add if tests call `fetch`:

  // jest.setup.js
  import '@testing-library/jest-dom';
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ answer: 'mock' }) }));

- Tests live under `src/__tests__`. Example file: `src/__tests__/page.test.js` — it renders the client component and checks for a heading.

Files to inspect when editing or extending

- `src/app/page.tsx` — client UI and the `fetch('/chat')` call to mirror when writing tests or components.
- `src/app/chat/routes.ts` — server-side model call; change here to swap model provider or to add sanitization/logging.
- `next.config.ts` — compiler settings, styled-components flag, and console removal rules.
- `jest.config.ts` and `jest.setup.js` — test runner and shared mocks.
- `tsconfig.json` — includes and alias rules (important for test discovery and module resolution).

Safety and environment

- Don't commit API keys. Use `.env.local` for `GEMINI_AI_KEY` and configure CI secrets for production.
- The server route returns the raw response from the model; if you process or display it in the UI, sanitize/shape it in the route or before rendering.

When in doubt

- Run `npm run dev` and exercise `POST /chat` from the UI to observe real request/response shapes.
- If adding tests that hit the server route, mock `@google/genai` or the `global.fetch` response to keep unit tests deterministic.

If any section above is unclear or you want examples (jest mock file, README additions, or a CI/test workflow), tell me which part and I'll expand or update the file accordingly.
