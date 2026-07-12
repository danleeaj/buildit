// llm.js — OpenAI client, two tiers + all prompts in one place.
// Fast tier: routing, proposals, config generation. Big tier: vision edits.
//
// Hackathon-mode: direct browser calls. Your key is in the client bundle —
// fine for a demo with your own key, never for prod.

import designMd from "../../design.md?raw";

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const FAST_MODEL = "gpt-4o-mini";
const BIG_MODEL = "gpt-4o";

async function call({ model, system, messages, maxTokens = 2000 }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

function extractJson(text) {
  // Strip fences if present, grab the first {...} block.
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---------------------------------------------------------------- ROUTER

const ROUTER_SYSTEM = `You classify the user's latest message in a conversation with an app-building agent.
Respond with ONLY one word:
PROBLEM  - user is describing a problem or need, no app exists yet or they want a new one
BUILD    - user is accepting/confirming a proposed app ("yes", "build it", "sounds good")
FEATURE  - an app exists and user wants to add/change functionality
EDIT     - an app exists and user wants a visual/layout/style change
CHAT     - anything else (questions, small talk)`;

export async function routeIntent(history, userMsg, hasApp) {
  const text = await call({
    model: FAST_MODEL,
    system: ROUTER_SYSTEM,
    maxTokens: 5,
    messages: [
      ...history,
      {
        role: "user",
        content: `(App currently exists: ${hasApp}) User says: "${userMsg}"`,
      },
    ],
  });
  const intent = text.trim().toUpperCase();
  return ["PROBLEM", "BUILD", "FEATURE", "EDIT", "CHAT"].includes(intent)
    ? intent
    : "CHAT";
}

// -------------------------------------------------------------- PROPOSAL

const PROPOSAL_SYSTEM = `You are BuildIt, an opinionated app-building agent for non-technical people.
The user has described a problem. Propose ONE app that solves it.

Rules:
- 2-3 sentences max. Confident, warm, zero jargon.
- Name the app (short, catchy).
- List at most 3 things it does, in plain words.
- End with a yes/no question like "Want me to build it?"
- Do NOT mention code, databases, technology, or features you can't deliver
  with a single-screen tracker or form app.`;

export function propose(history, userMsg) {
  return call({
    model: FAST_MODEL,
    system: PROPOSAL_SYSTEM,
    maxTokens: 300,
    messages: [...history, { role: "user", content: userMsg }],
  });
}

// ---------------------------------------------------------------- CONFIG

const CONFIG_SYSTEM = `You configure an app skeleton. Given the conversation, return ONLY a JSON object, no prose, no markdown fences:

{
  "skeleton": "tracker",
  "appName": "string, 1-3 words",
  "tagline": "string, under 8 words",
  "itemNoun": "singular noun for one entry, e.g. 'expense'",
  "brand": "#hexcolor that suits the vibe",
  "fields": [
    { "key": "snake_case", "label": "Human label", "type": "text|number|select|date", "options": ["only for select"] }
  ],
  "summary": { "type": "sum|count", "field": "key of a number field or null", "label": "Summary label" },
  "seedItems": [ { "<field key>": "value", ... } ]
}

Rules:
- 2-4 fields. Keep it minimal and obvious.
- CRITICAL: seedItems must use real details from the conversation — the user's
  actual names, places, amounts. 3 seed rows. If the user gave no details,
  invent plausible ones that fit their described situation.
- brand color: pick something tasteful for the use case, never default blue.`;

export async function generateConfig(history) {
  const text = await call({
    model: FAST_MODEL,
    system: CONFIG_SYSTEM,
    maxTokens: 1000,
    messages: [
      ...history,
      { role: "user", content: "Generate the app config now." },
    ],
  });
  return extractJson(text);
}

// ------------------------------------------------------------------ EDIT

const EDIT_SYSTEM = `You edit a single-file HTML app (Tailwind CDN + Alpine.js).
You receive: the full current HTML, a screenshot with the user's annotation
drawn in red, the name of the component the annotation targets, and the
user's instruction.

Follow this design system exactly:
${designMd}

Respond with ONLY the modified element(s), each in its own fenced block
labeled with the component name, like:

\`\`\`html:ComponentName
<section data-component="ComponentName" ...>...</section>
\`\`\`

Rules:
- Return the COMPLETE outer element for each data-component you modify,
  keeping its data-component attribute.
- Modify as few components as possible (usually one).
- Preserve all Alpine bindings (x-data, x-for, x-model...) unless the
  instruction requires changing them.
- No prose outside the fenced blocks.`;

export async function editApp({ html, screenshotDataUrl, component, instruction, styleHint }) {
  const text = await call({
    model: BIG_MODEL,
    system: EDIT_SYSTEM,
    maxTokens: 3000,
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
            text:
              `Current app HTML:\n\`\`\`html\n${html}\n\`\`\`\n\n` +
              `Annotation targets component: ${component || "unclear — infer from the red drawing"}\n` +
              `User instruction: "${instruction}"` +
              (styleHint ? `\nStyle direction for this variant: ${styleHint}` : ""),
          },
        ],
      },
    ],
  });

  // Parse ```html:Name blocks -> { Name: htmlString }
  const blocks = {};
  const re = /```html:([\w-]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) blocks[m[1]] = m[2].trim();
  return blocks;
}

// Apply returned blocks to the current HTML via DOM surgery (robust,
// no fragile string matching on nested divs).
export function applyBlocks(currentHtml, blocks) {
  const doc = new DOMParser().parseFromString(currentHtml, "text/html");
  for (const [name, blockHtml] of Object.entries(blocks)) {
    const target = doc.querySelector(`[data-component="${name}"]`);
    if (!target) continue;
    const frag = new DOMParser().parseFromString(blockHtml, "text/html");
    const replacement = frag.querySelector(`[data-component="${name}"]`) || frag.body.firstElementChild;
    if (replacement) target.replaceWith(doc.importNode(replacement, true));
  }
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}
