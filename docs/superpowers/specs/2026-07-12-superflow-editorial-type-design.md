# Superflow editorial typography

## Decision

Extend the landing page's serif-led visual language across Superflow-owned high-level hierarchy. Use the same upright Iowan Old Style/Baskerville serif stack for page-level titles and major contextual headings. Keep the system sans-serif stack for controls, labels, dense metadata, form fields, body copy, and generated application documents.

## Scope

- Add shared `--font-sans` and `--font-display` tokens to Superflow's root styles.
- Apply `--font-display` to high-level Superflow headings: projects, proposal and error states, build progress, workspace activity, completion sheets, and market-research status, verdict, and section headings.
- Preserve the landing wordmark's italic serif styling and initial voice-prompt treatment.
- Keep supporting copy, action labels, status indicators, form controls, list rows, and numeric metadata in the sans stack.
- Do not change `design.md`, generated-document markup, or styles injected into generated app previews.

## Visual rules

- Display headings use an upright serif face with the existing tight tracking and responsive size scale unless a component needs a localized adjustment for legibility.
- The hierarchy is typographic rather than decorative: no new colors, cards, shadows, or motion are introduced.
- Existing focus, contrast, touch-target, and reduced-motion behavior remain unchanged.

## Verification

- Build the app successfully.
- Confirm every Superflow-owned page-level heading and market-research section heading uses the serif stack.
- Confirm buttons, labels, inputs, supporting copy, and generated preview documents remain sans-serif.
- Check compact and desktop layouts for heading wrapping and readable hierarchy.
