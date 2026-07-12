# BuildIt — 7h hackathon scaffold

## Setup (5 min)
1. npm install
2. cp .env.example .env  → paste your Anthropic API key
3. Replace design.md with your real one
4. npm run dev  → note the Network URL, open it on your phone (same wifi)

## What's wired
- Chat → intent router (Haiku) → propose / build / edit
- Config call → tracker skeleton → srcdoc iframe (instant "hot reload")
- Pencil → draw overlay (pointer events) → hit-test → Sonnet vision edit
  → block swap via DOMParser (old HTML survives any parse failure)

## What's NOT wired yet (per PRD hours)
- H5: streaming, text-only edits, config-vs-code split for FEATURE
- H6: skeleton #2 (collector), variants (call editApp twice w/ styleHint), share/QR, mic
