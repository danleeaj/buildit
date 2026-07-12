# BuildIt Market Agent MVP Design

- Date: 2026-07-12
- Status: Design approved in conversation; written-spec review pending
- Scope: One-click, evidence-backed market research for a completed BuildIt app
- Related design: `2026-07-12-buildit-demo-first-pwa-design.md`

## 1. Product Definition

BuildIt begins as a problem-to-software product, not a startup tool. A user may build an app for themselves or their family, continue adding sophisticated capabilities, and never encounter business language.

Once the user is satisfied with the app, BuildIt presents two actions with these exact labels:

- **Deploy**
- **Explore opportunities**

`Deploy` leads toward personal use and is outside this Market Agent MVP. `Explore opportunities` opens a separate Market pane in the same project and immediately starts a one-click research mission. There is no market-research setup form and no requirement that the user arrive with founder knowledge.

The Market Agent evaluates whether the working app may also be a viable one-person business. It uses live web research, identifies comparable products and gaps, recommends how the app could differentiate, gives an honest market verdict, and estimates the size of the opportunity when credible inputs exist.

## 2. Product Principles

1. **Personal utility comes first.** Business functionality remains invisible until the user chooses `Explore opportunities`.
2. **One click starts useful work.** The agent reuses the app and conversation context instead of opening a questionnaire.
3. **Evidence before encouragement.** The agent may conclude that a market is weak, crowded, unclear, or unsupported.
4. **No false precision.** Opportunity size is a sourced range with visible assumptions, not an authoritative-looking invented number.
5. **Sources are part of the answer.** Factual findings show compact clickable citations, with a complete source list available from the result.
6. **The agent performs safe private work automatically.** Public, paid, or people-facing actions require approval in the long-term product, but those external actions are not implemented in this MVP.
7. **Recommend only what BuildIt can eventually perform.** The long-term Market Agent is an operator, but the demo is deliberately limited to research and private recommendations.

## 3. Entry and User Experience

### 3.1 Completion Actions

The two completion actions appear only after a working app exists. They are not permanent top-level navigation items.

- `Deploy` is the path for using the app personally.
- `Explore opportunities` is the optional business path.

Selecting `Explore opportunities` immediately:

1. Captures a compact snapshot of the current app idea.
2. Opens the Market pane.
3. Starts live web research without another confirmation.
4. Shows a clear in-progress state until a usable result arrives.

The working app remains attached to the project. Desktop may retain the app beside the Market pane; mobile replaces the app view and provides a compact way back.

### 3.2 Mission Progress

The Market pane communicates a short sequence of understandable stages:

```text
Starting research
  -> Finding comparable products
  -> Looking for gaps
  -> Estimating the opportunity
  -> Preparing a recommendation
  -> Ready
```

The UI must not expose model names, token terminology, agent orchestration, or raw JSON to normal users. Development-only telemetry may record those details.

### 3.3 Discussion

The completed result supports two zero-cost explanatory actions:

- `Why this recommendation?` reveals the evidence for, evidence against, assumptions, and confidence already returned by the initial mission.
- `Show sources` opens the stored source list and does not make another API request.

A free-form follow-up may make another model request. It sends a compact project and result summary rather than replaying the generated app, full conversation, or raw research response. Web search is enabled for a follow-up only when fresh evidence is needed.

## 4. Research Result Contract

The initial mission returns one structured result with the following user-facing sections.

### 4.1 Verdict

The verdict is one of:

- `promising`
- `uncertain`
- `weak_market`
- `insufficient_evidence`

The summary is direct and concise. The agent must not force a positive conclusion.

### 4.2 Comparators

Return zero to three meaningful comparable products.

For each comparator, show:

- Product name and canonical URL.
- What it appears to do.
- Its relevant positioning or pricing when supported.
- What appears to be missing or underserved.
- How the current BuildIt app could respond to that gap.
- The source references supporting factual claims.

The target is two or three comparators when credible matches exist. If none are found, state that explicitly. The result must explain that an absence of discovered competitors may indicate an opening, weak demand, or simply insufficient evidence; it is not automatically a positive signal.

### 4.3 Opportunity and Product Iteration

The result identifies:

- The most plausible first customer or user segment.
- A concise differentiation hypothesis.
- Up to three concrete iterations to the current app.
- The largest commercial uncertainty.
- One recommended next validation move.

The MVP describes these iterations and next steps. It does not publish experiments, contact people, spend money, or make public app changes.

### 4.4 Market Opportunity Estimate

The UI calls this **market opportunity**, not market capitalization. Market capitalization is a valuation concept for a company; it is not the intended metric here.

When credible inputs exist, the agent returns:

- A low and high annual revenue-opportunity estimate.
- The arithmetic used to produce the range.
- The assumed reachable customer count.
- The assumed annual price or value per customer.
- Source references for factual inputs.
- A confidence label and a short caveat.

Example presentation:

```text
200,000-500,000 plausible customers
x $40-$80 per year
= roughly $8M-$40M annual opportunity
```

This is a directional estimate, not a forecast. If the necessary inputs cannot be supported, the estimate is omitted and the result states that it cannot be calculated reliably.

### 4.5 Justification

The initial result includes a compact decision record:

- Evidence supporting the verdict.
- Evidence against the verdict.
- Assumptions that still need validation.
- Confidence in the conclusion.
- Source references for factual evidence.

The UI renders this record when the user asks why. It does not expose hidden chain-of-thought.

### 4.6 Structured Result Shape

The application-level result uses this shape. Optional factual fields may be `null`; required arrays may be empty.

```text
MarketResearchResult
- verdict: promising | uncertain | weak_market | insufficient_evidence
- verdictSummary: string
- comparators[0..3]
  - name: string
  - canonicalUrl: string
  - whatItDoes: string
  - pricingOrPositioning: string | null
  - apparentGap: string
  - productResponse: string
  - sourceUrls[]
- opportunity
  - firstCustomer: string
  - differentiation: string
  - productIterations[0..3]
  - largestUncertainty: string
  - nextValidationMove: string
- marketOpportunity: null | object
  - currency: string
  - lowAnnualRevenue: number
  - highAnnualRevenue: number
  - calculation: string
  - assumptions[]
  - confidence: low | medium | high
  - caveat: string
  - sourceUrls[]
- justification
  - supportingEvidence[]
  - contradictingEvidence[]
  - assumptions[]
  - confidence: low | medium | high
  - sourceUrls[]
```

The complete source catalog comes from the web-search response metadata and is stored beside this parsed result rather than duplicated inside every object.

## 5. Input Boundary

The Market Agent consumes a compact `ProjectSnapshot`, not the complete generated HTML or full conversation.

```text
ProjectSnapshot
- appId
- appName
- originalProblem
- approvedSolution
- intendedUserContext
- capabilities[]
- appSummary
- knownNamesPlacesAndConstraints[]
```

BuildIt creates and retains this snapshot when the app is built or materially changed. `appId` is a stable parent-owned identifier created with the project. The MVP retains the relevant structured fields so research does not have to reconstruct the idea from HTML.

No separate model call is used to build the snapshot. It is assembled deterministically from state BuildIt already owns.

## 6. OpenAI Model and Web-Search Design

### 6.1 Model Choice

Use the exact model ID:

```text
gpt-5.6-luna
```

Do not use the `gpt-5.6` alias because it routes to the more expensive Sol model. Luna is the current GPT-5.6 option for efficient, high-volume workloads and supports reasoning, structured outputs, and web search.

The existing `gpt-4o` research path must not be reused. The Market Agent uses the Responses API rather than the current Chat Completions helper.

### 6.2 Initial Request Profile

The initial demo baseline is:

- Responses API.
- `model: "gpt-5.6-luna"`.
- `reasoning.effort: "low"`.
- Current `web_search` tool, not `web_search_preview`.
- Live external web access.
- Web search required for the initial mission.
- `search_context_size: "low"`.
- Default returned-token budget rather than `unlimited`.
- `max_output_tokens: 3000`, covering visible output and reasoning tokens.
- One mission request rather than a multi-agent research swarm.
- Complete source metadata requested with `include: ["web_search_call.action.sources"]`.

The prompt asks for no more than three comparators and concise evidence. It permits zero comparators, a negative verdict, and an omitted market estimate.

### 6.3 Token and Cost Controls

Token usage is reduced by:

- Sending `ProjectSnapshot` instead of HTML and full conversation history.
- Requesting one compact structured result.
- Starting with low reasoning and low search context.
- Avoiding multiple specialist-agent calls.
- Rendering `Why this recommendation?` and `Show sources` from stored data.
- Avoiding an automatic follow-up or repair loop.
- Capping visible output to the fields needed by the Market pane.

The app logs input, cached-input, output, and reasoning-token usage when present, plus search-call count, latency, and estimated cost. This telemetry is development-only.

Current official pricing at the time of this design is $1.00 per million Luna input tokens, $0.10 per million cached input tokens, $6.00 per million output tokens, and $10.00 per thousand web-search calls, with retrieved search content billed at the model's input rate. Pricing is not hard-coded into user-facing product copy.

Using `previous_response_id` preserves conversational state but does not eliminate billing for earlier input tokens. Follow-ups therefore use a compact stored result rather than assuming response chaining is a cost optimization.

### 6.4 Current Documentation References

- Model guidance: <https://developers.openai.com/api/docs/guides/latest-model>
- GPT-5.6 Luna: <https://developers.openai.com/api/docs/models/gpt-5.6-luna>
- Web search: <https://developers.openai.com/api/docs/guides/tools-web-search>
- API pricing: <https://developers.openai.com/api/docs/pricing>
- Conversation state: <https://developers.openai.com/api/docs/guides/conversation-state>

## 7. Sources and Evidence Presentation

The initial response retains:

- Inline URL-citation annotations returned by web search.
- The complete web-search source list.
- Source references associated with comparators, opportunity inputs, and verdict evidence.

The UI displays compact, visible, clickable citations next to factual web-derived claims. A `Show sources` control expands the complete stored source list.

The MVP performs only a minimal consistency check:

- The response is present and parseable.
- The verdict uses an allowed value.
- Comparators is an array containing no more than three items.
- Source URLs displayed by the result are present in the returned web-search sources or citation annotations.
- A market-opportunity estimate includes its calculation and assumptions; otherwise it is omitted.

This is not a comprehensive research-quality validator. Unsupported or unparseable sections are hidden rather than repaired through repeated model calls.

## 8. Components and State

The implementation should keep the Market Agent isolated from the generated app renderer.

### Components

- **Completion actions:** renders `Deploy` and `Explore opportunities` after an app exists.
- **Market pane:** owns the mission progress and result presentation.
- **Comparator list:** shows zero to three products with gaps and citations.
- **Opportunity section:** shows customer, differentiation, app iterations, and next move.
- **Market opportunity section:** shows the range, calculation, assumptions, confidence, or unavailable state.
- **Recommendation section:** shows the verdict and expands the stored justification.
- **Sources drawer:** renders all stored source links without another API call.
- **Follow-up input:** asks a question about the completed result.

### State

```text
idle
  -> researching
  -> parsing
  -> ready
  -> follow_up

researching | parsing | follow_up
  -> recoverable_error
  -> retry
```

The last successful research result is retained in browser storage for the demo so closing the pane or refreshing does not automatically spend tokens again.

## 9. Minimal Failure Handling

The MVP implements only the failure handling needed for a dependable demo:

- Network or API error: show a concise error and `Retry`.
- Empty or unparseable response: show a concise error and `Retry`.
- Partial optional section: hide that section and keep the usable remainder.
- No comparators: show the explicit no-comparators explanation.
- No credible market estimate: show an unavailable explanation instead of a fabricated number.
- Failed retry: preserve the app and any last successful market result.

There is no unbounded retry loop, automatic model escalation, silent model substitution, or silent switch to a more expensive model.

## 10. Demo Verification

The user explicitly does not require an automated reliability or test suite for this MVP. Verification is limited to a manual smoke run before delivery:

1. Build or load an app.
2. Confirm the exact `Deploy` and `Explore opportunities` labels.
3. Click `Explore opportunities` once.
4. Confirm that a live web-backed result returns.
5. Confirm zero to three comparators render correctly.
6. Confirm negative and insufficient-evidence verdicts are supported by the result contract.
7. Confirm market-opportunity arithmetic and assumptions appear only when supplied.
8. Confirm citations are clickable and `Show sources` does not call the API.
9. Confirm a failed request exposes `Retry` and leaves the app intact.
10. Confirm the production build completes.

No new production dependency is required for this design. If implementation discovers that one is necessary, user confirmation is required before adding it.

## 11. Security Boundary

The current BuildIt demo calls OpenAI directly from the browser and exposes a temporary API key in the client bundle. This remains a hackathon-only compromise:

- Use a temporary restricted key for the demo.
- Rotate it immediately afterward.
- Keep the Market API code behind a dedicated client boundary.
- Replace that client with a server-side mission endpoint before public distribution.

The MVP does not implement public deployment, outreach, payment, advertising, data collection, or third-party account integrations.

## 12. Non-Goals

- Publicly publishing the validation asset or app.
- Sending emails, messages, surveys, or interview invitations.
- Buying ads or spending money.
- Collecting market responses or personal information.
- Automated customer discovery or experiment monitoring.
- A multi-agent research swarm.
- An exhaustive market report.
- Formal legal, regulatory, medical, or compliance certification.
- Precise financial forecasting or company valuation.
- A full automated test or evaluation suite.
- Production authentication, persistence, billing, or secret management.

## 13. Acceptance Criteria

The Market Agent MVP is complete when:

- A completed app exposes `Deploy` and `Explore opportunities`.
- Clicking `Explore opportunities` opens another pane and starts research automatically.
- The request uses `gpt-5.6-luna`, the Responses API, and current `web_search`.
- The result gives an honest allowed verdict.
- It shows two or three comparators when meaningful matches are found, and handles zero matches honestly.
- Each comparator explains what it does, what appears missing, and how the user's app could respond.
- The result proposes concrete product iterations.
- The opportunity estimate is a sourced range with visible arithmetic and assumptions, or is explicitly unavailable.
- Factual web-derived findings display clickable citations.
- `Why this recommendation?` and `Show sources` use the stored result without another API request.
- Empty, failed, or malformed requests produce a recoverable retry state.
- No public, paid, or people-facing action is performed.
- The production build succeeds and the manual smoke flow completes.

## 14. Later Product Direction

After the MVP, the Market Agent can grow from research into an operator. Candidate future capabilities include preparing and publishing landing pages, waitlists, surveys, and product revisions; finding and contacting potential customers; running pricing experiments; monitoring results; checking compliance risks; deploying changes; and helping operate a one-person company.

Those capabilities retain the approved autonomy policy:

- Low-risk private work may run automatically.
- Public, paid, or people-facing actions always require explicit approval that shows what will happen, who will see it, expected cost, and reversibility.
