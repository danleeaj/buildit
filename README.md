# Superflow

Superflow turns a spoken or typed problem into a focused, single-screen app. The current milestone is a demo-first PWA with arbitrary client-only app generation, a sandboxed live preview, and voice- or drawing-led edits.

## Run locally

```bash
bun install
cp .env.example .env
bun run dev:full
```

`bun run dev:full` starts the Vercel local runtime, which serves both Vite and
the functions under `/api`. Use `bun run dev` only for UI-only work; Vite by
itself cannot exercise authenticated project persistence. The separate names
are required because Vercel invokes the underlying `dev` command itself.

Add a working OpenAI API key to `.env`, then open the local URL printed by the
development server.

## Neon persistence

For authenticated projects, connect Neon to Vercel, enable Neon Auth, and set
`DATABASE_URL` and `VITE_NEON_AUTH_URL` in both Vercel and your local `.env`.
Neon normally adds `NEON_AUTH_BASE_URL`; `NEON_AUTH_JWKS_URL` is available as
an explicit override. Without that override, the API verifies tokens against
the Neon Auth base URL's `/jwt` endpoint. Run `bun run db:migrate`, create the
demo user in Neon Auth, set its ID as `DEMO_OWNER_ID`, then run
`bun run db:seed-demo`.

Add both the local Vercel development URL and the deployed application URL to
Neon Auth's allowed origins before testing sign-in. A browser session can look
valid while project requests fail if neither auth URL is present in the server
environment; the Projects screen reports this as a storage configuration
error.

## Voice input

Voice capture uses `MediaRecorder` first and sends the finished recording to OpenAI's transcription endpoint. Tap **Tap to speak**, allow microphone access, speak, then tap again to finish. The transcript appears after processing. Browser speech recognition is used only when recorded audio is unavailable.

Microphone access requires either:

- `localhost` on the development computer, or
- an HTTPS deployment on a phone or another device.

If permission was previously denied, re-enable microphone access in the browser's site settings. Typed input always remains available.

## Current capabilities

- Voice-first problem capture with typed fallback
- One-shot generation of arbitrary, client-only single-screen apps
- Validation and one automatic repair attempt before preview
- Opaque sandboxed preview with bridged app storage
- Draw-to-target and voice-to-edit interactions
- Installable PWA shell with offline access to the current app

## Demo security boundary

The current local demo reads `VITE_OPENAI_API_KEY` in the browser. Do not publish this build with a valuable or unrestricted key. Before deployment, move generation, editing, and transcription requests behind a server-side API and use a server-only environment variable.

## Checks

```bash
bun test
bun run build
```
