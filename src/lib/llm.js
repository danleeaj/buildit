import designMd from "../../design.md?raw";

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const DISCOVERY_MODEL = import.meta.env.VITE_DISCOVERY_MODEL
  || import.meta.env.VITE_FAST_MODEL
  || "gpt-5.6-luna";
const BUILD_MODEL = import.meta.env.VITE_BUILD_MODEL
  || "gpt-5.6-terra";
const BIG_MODEL = import.meta.env.VITE_BIG_MODEL
  || "gpt-5.6-terra";

export function isApiConfigured() {
  return Boolean(API_KEY && !API_KEY.includes("sk-..."));
}

async function callModel({
  model,
  system,
  messages,
  maxTokens = 2000,
  temperature = 0.3,
  responseFormat,
}) {
  if (!isApiConfigured()) {
    const error = new Error("Add VITE_OPENAI_API_KEY to .env before generating an app.");
    error.code = "missing-api-key";
    throw error;
  }

  const request = {
    model,
    messages: [{ role: "system", content: system }, ...messages],
  };

  // GPT-5.6 defaults to medium reasoning. The prior 4o routes did not reason,
  // so make the latency and cost baseline explicit while we evaluate the new tiers.
  if (model.startsWith("gpt-5.6")) {
    request.max_completion_tokens = maxTokens;
    request.reasoning_effort = "none";
  } else {
    request.max_tokens = maxTokens;
    request.temperature = temperature;
  }
  if (responseFormat) request.response_format = responseFormat;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
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

const PROPOSAL_SYSTEM = `You are Superflow, an opinionated app builder for nontechnical people.
The user explains a real-world problem aloud. Propose one focused, single-screen, client-only app.

Rules:
- Use 2-3 short sentences.
- Give the app a specific, memorable name.
- Describe no more than 3 concrete capabilities in plain language.
- Reuse the user's actual people, places, amounts, and context when helpful.
- End with a direct yes/no question such as "Want me to build it?"
- Do not mention code, models, prompts, databases, or technical architecture.
- Do not promise accounts, backends, payments, realtime collaboration, or external integrations.`;

const DISCOVERY_SYSTEM = `You are the product-discovery step of Superflow, an app builder for nontechnical people.
Decide whether a short answer would materially change the app's core workflow, important decisions, or useful starting data. Return valid JSON only, with this exact shape:

{"questions":[{"id":"short_slug","question":"Plain-language question?","options":["Choice one","Choice two"]}]}

Rules:
- Return zero, one, or two questions. Return an empty questions array when the problem is already clear enough.
- Ask only questions a nontechnical person can answer from their real life. Never ask about technology, stacks, databases, storage, accounts, deployment, APIs, integrations, or implementation.
- Each question must be a high-leverage decision, not a cosmetic preference or a request for arbitrary details.
- Give two to four concise, mutually exclusive, tappable options. The person can supply a different answer separately.
- Make questions specific to the stated problem. For a budgeting app, ask what the person needs help deciding, not merely for income and expense totals.`;

function intakeFailure(message) {
  const error = new Error(message);
  error.code = "invalid-intake";
  throw error;
}

export function parseDiscoveryResponse(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return intakeFailure("Superflow could not shape the first question. Try again.");
  }

  if (!Array.isArray(value?.questions) || value.questions.length > 2) {
    return intakeFailure("Superflow received an invalid set of questions. Try again.");
  }

  const questions = value.questions.map((question) => ({
    id: typeof question?.id === "string" ? question.id.trim() : "",
    question: typeof question?.question === "string" ? question.question.trim() : "",
    options: Array.isArray(question?.options)
      ? question.options.filter((option) => typeof option === "string").map((option) => option.trim()).filter(Boolean)
      : [],
  }));

  if (questions.some((question) => !/^[a-z][a-z0-9_]{0,39}$/.test(question.id)
    || !question.question
    || question.options.length < 2
    || question.options.length > 4)) {
    return intakeFailure("Superflow received an incomplete question. Try again.");
  }

  return questions;
}

export function discover({ history, problem }) {
  return callModel({
    model: DISCOVERY_MODEL,
    system: DISCOVERY_SYSTEM,
    maxTokens: 500,
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    messages: [
      ...history,
      { role: "user", content: `Problem: ${problem}` },
    ],
  });
}

export function propose(history, userMessage, intakeAnswers = []) {
  const answerContext = intakeAnswers.length
    ? `\n\nUseful context from the person:\n${intakeAnswers.map((answer) => `- ${answer.question}: ${answer.answer}`).join("\n")}`
    : "";
  return callModel({
    model: DISCOVERY_MODEL,
    system: PROPOSAL_SYSTEM,
    maxTokens: 320,
    temperature: 0.35,
    messages: [...history, { role: "user", content: `${userMessage}${answerContext}` }],
  });
}

const GENERATED_DOCUMENT_RULES = `Return exactly one fenced block labeled html:app and no prose before or after:

\`\`\`html:app
<!DOCTYPE html>
<html>...</html>
\`\`\`

Critical formatting: the opening fence must be the first non-blank line. No explanation, no "Here is the app:", nothing outside the fence.

The document must:
- Be a complete single-screen mobile-first app. Aim for 8-12KB; never exceed 16KB.
- Use only inline CSS and vanilla JavaScript. No packages, CDNs, external assets, network calls, workers, popups, or navigation.
- Contain exactly one element with data-app-root. Do not assign data-app-id; Superflow assigns it.
- Give every independently editable region a unique data-component matching ^[A-Za-z][A-Za-z0-9_-]{0,63}$.
- Include style[data-style-region="app"] and script[data-behavior-region="app"], even when one is empty.
- Use addEventListener rather than inline on* attributes. NEVER use onclick, onchange, onsubmit, or any inline handler attribute.
- Use window.SuperflowStore.get/set/remove for optional persistence. Do not access cookies, localStorage, sessionStorage, or IndexedDB.
- Never use fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, eval, Function, document.write, window.open, parent, top, opener, service workers, nested frames, objects, embeds, base tags, meta refresh, form action URLs, CSS imports, or external CSS URLs.
- Include a viewport meta tag, semantic controls, visible labels, keyboard focus styles, reduced-motion handling, and 44px touch targets.
- Implement real working behavior, not a static mockup.
- Seed the app with relevant details from the conversation so it appears useful immediately.`;

const GENERATION_SYSTEM = `You generate complete, dependable single-file applications for Superflow.
Follow this design contract exactly:

${designMd}

${GENERATED_DOCUMENT_RULES}

Product quality rules:
- Solve the underlying real-world workflow, not merely the nouns in the request. A budgeting app should help the person make day-to-day choices, anticipate upcoming commitments, and act on a goal when the conversation calls for it; it must not collapse into a bare income-and-expense calculator.
- Use the conversation and intake answers to choose the most important decisions, calculations, states, and next actions. Prefer a small number of meaningful, working capabilities over a long generic feature list.
- Include useful starting context and an obvious first action. Do not add technical setup or ask the person to configure implementation details.`;

export function generateApp({ history, problem, proposal }) {
  return callModel({
    model: BUILD_MODEL,
    system: GENERATION_SYSTEM,
    maxTokens: 16000,
    temperature: 0.2,
    messages: [
      ...history,
      {
        role: "user",
        content: `Problem: ${problem}\n\nApproved proposal: ${proposal}\n\nBuild the app now. Keep it under 12KB of HTML.`,
      },
    ],
  });
}

export function repairGeneratedApp({ history, problem, proposal, candidate, errors }) {
  // ponytail: truncate candidate to avoid blowing up the repair prompt context
  const trimmedCandidate = candidate ? candidate.slice(0, 12000) : "";
  return callModel({
    model: BUILD_MODEL,
    system: GENERATION_SYSTEM,
    maxTokens: 16000,
    temperature: 0.1,
    messages: [
      ...history,
      {
        role: "user",
        content: `The first generated document was rejected. Return a complete corrected document under 12KB.

Problem: ${problem}
Approved proposal: ${proposal}
Validation errors:
- ${errors.join("\n- ")}

${trimmedCandidate ? `Rejected document (may be truncated):\n${trimmedCandidate}` : "The response was missing or truncated. Generate from scratch."}`,
      },
    ],
  });
}

const EDIT_SYSTEM = `You patch a working Superflow app after the user draws on a region and speaks a change.
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
  discovery: DISCOVERY_MODEL,
  build: BUILD_MODEL,
  vision: BIG_MODEL,
});
