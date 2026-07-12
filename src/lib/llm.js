import designMd from "../../design.md?raw";

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const FAST_MODEL = import.meta.env.VITE_FAST_MODEL || "gpt-4o-mini";
const BIG_MODEL = import.meta.env.VITE_BIG_MODEL || "gpt-4o";

export function isApiConfigured() {
  return Boolean(API_KEY && !API_KEY.includes("sk-..."));
}

async function callModel({
  model,
  system,
  messages,
  maxTokens = 2000,
  temperature = 0.3,
}) {
  if (!isApiConfigured()) {
    const error = new Error("Add VITE_OPENAI_API_KEY to .env before generating an app.");
    error.code = "missing-api-key";
    throw error;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Generation service returned ${response.status}.`);
    error.code = "api-error";
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    const error = new Error("Generation service returned an empty response.");
    error.code = "empty-response";
    throw error;
  }

  return {
    text: choice.message.content,
    finishReason: choice.finish_reason || null,
    usage: data.usage || null,
    model: data.model || model,
  };
}

const PROPOSAL_SYSTEM = `You are BuildIt, an opinionated app builder for nontechnical people.
The user explains a real-world problem aloud. Propose one focused, single-screen, client-only app.

Rules:
- Use 2-3 short sentences.
- Give the app a specific, memorable name.
- Describe no more than 3 concrete capabilities in plain language.
- Reuse the user's actual people, places, amounts, and context when helpful.
- End with a direct yes/no question such as "Want me to build it?"
- Do not mention code, models, prompts, databases, or technical architecture.
- Do not promise accounts, backends, payments, realtime collaboration, or external integrations.`;

export function propose(history, userMessage) {
  return callModel({
    model: FAST_MODEL,
    system: PROPOSAL_SYSTEM,
    maxTokens: 320,
    temperature: 0.35,
    messages: [...history, { role: "user", content: userMessage }],
  });
}

const GENERATED_DOCUMENT_RULES = `Return exactly one fenced block labeled html:app and no prose:

\`\`\`html:app
<!DOCTYPE html>
<html>...</html>
\`\`\`

The document must:
- Be a complete single-screen mobile-first app under 16KB when possible and never intentionally exceed 32KB.
- Use only inline CSS and vanilla JavaScript. No packages, CDNs, external assets, network calls, workers, popups, or navigation.
- Contain exactly one element with data-app-root. Do not assign data-app-id; BuildIt assigns it.
- Give every independently editable region a unique data-component matching ^[A-Za-z][A-Za-z0-9_-]{0,63}$.
- Include style[data-style-region="app"] and script[data-behavior-region="app"], even when one is empty.
- Use addEventListener rather than inline on* attributes.
- Use window.BuildItStore.get/set/remove for optional persistence. Do not access cookies, localStorage, sessionStorage, or IndexedDB.
- Never use fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, eval, Function, document.write, window.open, parent, top, opener, service workers, nested frames, objects, embeds, base tags, meta refresh, form action URLs, CSS imports, or external CSS URLs.
- Include a viewport meta tag, semantic controls, visible labels, keyboard focus styles, reduced-motion handling, and 44px touch targets.
- Implement real working behavior, not a static mockup.
- Seed the app with relevant details from the conversation so it appears useful immediately.`;

const GENERATION_SYSTEM = `You generate complete, dependable single-file applications for BuildIt.
Follow this design contract exactly:

${designMd}

${GENERATED_DOCUMENT_RULES}`;

export function generateApp({ history, problem, proposal }) {
  return callModel({
    model: FAST_MODEL,
    system: GENERATION_SYSTEM,
    maxTokens: 8000,
    temperature: 0.2,
    messages: [
      ...history,
      {
        role: "user",
        content: `Problem: ${problem}\n\nApproved proposal: ${proposal}\n\nBuild the app now.`,
      },
    ],
  });
}

export function repairGeneratedApp({ history, problem, proposal, candidate, errors }) {
  return callModel({
    model: FAST_MODEL,
    system: GENERATION_SYSTEM,
    maxTokens: 8000,
    temperature: 0.1,
    messages: [
      ...history,
      {
        role: "user",
        content: `The first generated document was rejected. Return a complete corrected document under 16KB.

Problem: ${problem}
Approved proposal: ${proposal}
Validation errors:
- ${errors.join("\n- ")}

Rejected document:
${candidate || "The response was missing or truncated."}`,
      },
    ],
  });
}

const EDIT_SYSTEM = `You patch a working BuildIt app after the user draws on a region and speaks a change.
Follow the design contract:

${designMd}

Return only the smallest necessary fenced replacement blocks. Allowed labels:
- html:ComponentName for a complete outer element preserving its data-component value
- css:RegionName for a complete replacement style region
- js:RegionName for a complete replacement behavior region

Rules:
- Most visual or content edits should return exactly one html block.
- Preserve the targeted outer data-component identifier.
- Do not replace an ancestor and its descendant in the same response.
- Return CSS or JavaScript only when the instruction genuinely needs it.
- Preserve the generated-document safety rules: no network, external resources, storage APIs, parent access, eval, workers, popups, or navigation.
- No prose outside fenced blocks.`;

export function editApp({
  html,
  screenshotDataUrl,
  component,
  instruction,
  styleHint,
}) {
  return callModel({
    model: BIG_MODEL,
    system: EDIT_SYSTEM,
    maxTokens: 5000,
    temperature: styleHint ? 0.55 : 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: screenshotDataUrl },
          },
          {
            type: "text",
            text: `Target component: ${component || "app root"}
Instruction: ${instruction}
${styleHint ? `Variant direction: ${styleHint}\n` : ""}
Current validated app:
\`\`\`html
${html}
\`\`\``,
          },
        ],
      },
    ],
  });
}

export const modelDefaults = Object.freeze({
  fast: FAST_MODEL,
  vision: BIG_MODEL,
});
