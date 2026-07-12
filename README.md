# BuildIt

BuildIt turns a spoken or typed problem into a focused, single-screen app. The current milestone is a demo-first PWA with arbitrary client-only app generation, a sandboxed live preview, and voice- or drawing-led edits.

## Run locally

```bash
bun install
cp .env.example .env
bun run dev
```

Add a working OpenAI API key to `.env`, then open the local URL printed by Vite.

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
