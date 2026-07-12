# Superflow Generated App Design Contract

## Product feel

Generated apps should feel like focused mobile utilities, not marketing pages and not AI chat interfaces. The default language is quiet, native, monochrome, and direct. The user's content and task are the visual center.

## Core principles

1. Start with the task. Put the app title and primary information near the top without a large navigation bar.
2. Prefer white space, type, and grouping over decorative cards.
3. Use one clear primary action per screen.
4. Keep controls within comfortable thumb reach on phones.
5. Make every state understandable without exposing code, models, prompts, or settings.
6. Every independently editable region must carry a stable `data-component` identifier.

## Tokens

Declare these variables once in `:root` and reference them everywhere else. Do not scatter raw colors through component CSS.

```css
:root {
  color-scheme: light;
  --canvas: #ffffff;
  --ink: #111113;
  --ink-soft: #3f3f43;
  --muted: #6f6f74;
  --surface: #f4f4f2;
  --surface-strong: #ececea;
  --border: #e3e3df;
  --focus: #111113;
  --danger: #d93d42;
  --recording: #e5484d;
  --on-dark: #ffffff;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --shadow-sheet: 0 14px 36px rgb(17 17 19 / 0.14);
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
}
```

Red is functional. Use it only for recording, ink annotations, destructive actions, and errors. Do not add a decorative accent color by default.

## Typography

- Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Body copy: 16px minimum, 1.5 line height, weight 400.
- App title: 28-32px, weight 700, tight but readable tracking.
- Section title: 20-24px, weight 650-700.
- Labels: 13-14px, weight 600. Use sentence case.
- Supporting text: 14px minimum and sufficient contrast against the surface.
- Numeric totals may use `font-variant-numeric: tabular-nums`.
- Avoid all-caps micro-labels, editorial serif type, oversized display headlines, and decorative monospace.

## Layout

- Mobile first, fluid from 320px upward.
- Use `min-height: 100dvh`; never disable zoom.
- Horizontal page padding: 16px on compact phones, 20px from 390px, 24px on larger screens.
- Respect `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Keep long text between 35 and 65 characters per line.
- Avoid horizontal page scrolling and nested vertical scroll containers.
- When a bottom action area is fixed or sticky, reserve matching content padding so nothing is covered.

## Shape and elevation

- Grouped surfaces use 14-18px radii.
- Inputs and buttons use 10-14px radii.
- Icon-only controls may be circular when that matches a native platform convention.
- Use borders or neutral surface fills before shadows.
- Shadows are reserved for temporary layers such as sheets and floating tool docks.
- Do not use gradients, glass effects, glows, pastel feature cards, or stacks of cards inside cards.

## Components

### App header

The generated app owns its title. Use a compact content header with an `h1`, optional one-line context, and no desktop-style navbar. Superflow's back/edit/share controls live outside the generated document.

### Primary action

- Minimum 48px height and full-width when it completes the screen's main task.
- Dark ink background with white text.
- Clear pressed and disabled states.
- Keep labels short and concrete.

### Secondary and icon actions

- Minimum 44px touch target.
- Neutral surface or border treatment.
- Always include an accessible name.
- Do not rely on an icon alone when the action is unfamiliar.

### Inputs

- Visible label above the field.
- Minimum 48px control height and 16px input text.
- Helper or error text below the field.
- Strong focus ring that remains visible against white and neutral surfaces.

### Lists and records

- Prefer one grouped surface with internal spacing or subtle dividers.
- Avoid placing every row in a separate floating card.
- Put the primary value first and supporting metadata second.
- Provide meaningful empty, loading, and error states.

### Summary values

- Use one calm neutral grouping surface when emphasis is needed.
- Lead with the value and a plain-language label.
- Do not invent currency, units, precision, or statistics that the conversation did not establish.

### Sheets and temporary layers

- Bottom sheets use a white surface, 18px top radii, a restrained shadow, and safe-area padding.
- Include a visible close or cancel action.
- Do not hide destructive or irreversible actions behind gestures alone.

## Interaction

- Touch targets are at least 44 by 44px with at least 8px between adjacent controls.
- Give press feedback within 100ms using color, opacity, or a subtle scale no smaller than 0.98.
- Use 150-250ms transitions for state changes.
- Animate only opacity and transform.
- Honor `prefers-reduced-motion` and keep the app fully usable without animation.
- Preserve browser back, text selection, zoom, and system gestures.

## Accessibility

- Meet WCAG AA contrast for text and interactive controls.
- Use semantic landmarks, headings, labels, buttons, and form controls.
- Maintain a logical focus order and visible `:focus-visible` styles.
- Use `aria-live` for async success and error feedback without stealing focus.
- Never communicate state through color alone.
- Do not use placeholder text as the only field label.

## Generated document rules

- The document contains exactly one `[data-app-root]`.
- Every independently editable region has a unique `data-component` name.
- Include `style[data-style-region="app"]` and `script[data-behavior-region="app"]`, even if one is empty.
- Component-specific style or behavior regions use the component name as their region name.
- Keep CSS and JavaScript inline and dependency-free.
- Use the injected asynchronous `window.SuperflowStore` API when persistence is useful.
- Do not create a second Superflow navigation shell inside the app.

## Avoid

- Chat bubbles as the default product surface.
- Large top navigation, sidebars, settings panels, or code-like controls.
- Purple/blue AI gradients, glowing orbs, and decorative waveform loops.
- Brutalist grids, hard all-caps labels, and excessive hairlines.
- Generic dashboard card grids when a simple focused layout works.
- Emoji as structural icons.
- Tiny gray text, hidden labels, gesture-only critical actions, or controls under safe areas.
