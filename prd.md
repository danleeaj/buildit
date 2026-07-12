# PRD — Superflow
**Opinionated, problem-first, no-code app builder with sketch-and-talk editing**

- **Author:** Dan (An Jie Lee)
- **Format:** Solo hackathon, 7 hours
- **Version:** 1.0 — pre-hack
- **Status:** Locked scope. Changes after H1 require cutting something else.

---

## 1. Problem Statement

Existing AI app builders (Lovable, Bolt, v0, Replit Agent) and agentic coding tools (Claude Code, Codex) assume the user already knows **what app they want** and are comfortable in a developer-flavored interface. Non-technical people don't think in apps — they think in problems ("my badminton group keeps arguing about who paid for court bookings"). They are intimidated by prompts, code panes, and configuration, and they cannot evaluate generated output except by *using* it.

**Gap:** No tool interviews the user about their problem, proposes an opinionated solution, shows it running immediately, and lets them refine it the way non-technical people naturally communicate — by pointing, drawing, and talking.

## 2. Product Vision

> Say your problem out loud. An app that solves it appears in your hand in seconds. Draw on it to change it. Tap once to share it.

The product is **opinionated by design**: it builds *the right app*, not *any app*. Constraint is the brand, not the limitation.

## 3. Target User

- Non-technical problem-havers: club treasurers, small team leads, parents, teachers, hobby group organizers.
- They want a problem solved, not a development experience.
- Success = they never see code, never see a settings panel, never make a technical decision.

## 4. Differentiators (why this beats "Lovable but smaller")

1. **Problem-first agent.** The agent proposes the app; the user reacts. Short, confident proposals (≤3 features).
2. **Sketch-and-talk editing.** Circle a region on the live app, say/type what you want, watch it change in seconds.
3. **Personalized from conversation.** Seed data comes from what the user actually said (their names, their venue, their amounts). The app appears already alive.
4. **Live variants instead of mockups.** "Show me options" produces two *running* alternatives side by side; picking one **is** the implementation.
5. **One-tap real deployment.** QR code → app running on the judge's own phone.

## 5. Competitive Positioning — "Why not just Claude Artifacts?"

Artifacts (and Lovable/Bolt/v0) are the closest comparison and a judge **will** ask. Do not lead with weak claims: "opinionated," "auto deployment," and "faster iteration" are all things Artifacts partially has. The real answer is four points:

1. **Interaction model.** Artifacts is chat-about-a-document: describe changes in words, sidebar regenerates. Superflow is **direct manipulation of the running product** — circle the part you don't like, on the thing itself. Different grammar of interaction, not a feature gap.
2. **Problem-first, not prompt-first.** Artifacts is an execution engine that assumes you arrive with a spec. Superflow's interview → proposal → "want it?" discovery layer doesn't exist there at all.
3. **Built for the person, not the builder.** No visible code, no version dropdowns, no model pickers. Mobile-native: built on a phone, drawn on with a finger, shared to a phone. Artifacts on mobile is a viewing experience.
4. **Choosing instead of describing.** Non-technical users can't specify fixes ("make it more detailed" is as precise as they get). Artifacts makes them iterate in prose; Superflow shows two live variants and lets them point. Selection is a universal skill; specification isn't.

**Rehearsed 20-second answer:**
> "Artifacts is amazing if you can describe what you want — it's a text interface for people who think in specs. Superflow is for people who think in problems. You don't describe changes, you circle them. You don't evaluate options in your head, you tap the one you like. Same engine class underneath — completely different front door. We'd love to be what Artifacts looks like for the other 95% of people."

**Demo tactic:** include one moment of deliberately vague input — circle + "this bit, more… y'know, detail" — handled gracefully. That *shows* the gap instead of arguing it.

## 6. Core Demo Loop (the product IS this loop)

```
Judge: "My badminton group argues about who paid for courts."
  → Agent (≈2s): proposes "Court Split" — log payments, auto-split, settle-up. "Want it?"
Judge: "Yes"
  → App appears (≈5s) in phone frame, pre-seeded with judge's names/venue.
Judge: circles the summary area, says "more detail here"
  → Shimmer on circled region → 2 live variants side by side (≈5s) → judge taps one → applied instantly.
Judge: taps Share
  → QR code → judge opens the app on their own phone.
```

Total loop target: **under 90 seconds**, no failures, rehearsed 10×.

## 7. Feature Requirements

### P0 — must work on stage

| # | Feature | Requirement | Latency budget |
|---|---------|-------------|----------------|
| F1 | Problem → proposal | Fast-model call; ≤3 bullet proposal; ends in yes/no question | ≤ 3s |
| F2 | Proposal → running app | JSON-config call → splice into hand-built skeleton → render in `srcdoc` iframe | ≤ 5s |
| F3 | Conversation-seeded data | Config call receives full chat history; seed rows use user's real names/context | free (same call) |
| F4 | Draw-to-edit | Canvas overlay (Pointer Events, `touch-action:none`) → screenshot + hit-test (`data-component` via `elementFromPoint`) → vision edit call returns only changed component blocks → string-swap → `srcdoc` reload | ≤ 6s |
| F5 | Multi-round intent router | Fast model classifies each turn: PROBLEM / BUILD / FEATURE(config vs code) / EDIT | ≤ 1s |
| F6 | Design consistency | `design.md` tokens file in every prompt; skeletons comply by construction; theme = CSS variables | n/a |
| F7 | Phone testing | Vite `--host`, LAN IP on phone; phone-frame chrome on desktop, full-bleed on device | n/a |

### P1 — build if P0 is solid

| # | Feature | Notes |
|---|---------|-------|
| F8 | Two live variants | Same edit call ×2 in parallel with different style directives; render in mini iframes; tap = apply. ~45 min if F4 works |
| F9 | Share / deploy | POST HTML blob to KV/Supabase/Gist → URL + QR code. ~30–45 min |
| F10 | Mic input | Browser `webkitSpeechRecognition` into the text box. ~15 min |
| F11 | Instant rebrand | "Make it green" → one-line CSS variable edit; flashy micro-demo |

### P2 — pitch, don't build

- Realtime voice (WebRTC) — mention Capella lineage, demo only if hours remain.
- Bring-your-own `design.md` — pitch line; it's just a string swap.
- AI redesign loop — model rewrites `design.md` (not images) → re-render config through variants.
- Persistence, auth, custom domains, CI/CD — "single-file apps deploy atomically; that's a feature of being opinionated."

## 8. Architecture

```
Parent app (Vite + React, laptop + phone via LAN)
├─ Chat pane (text + mic button)
├─ Phone-frame preview: <iframe srcdoc={currentHtml}>
├─ Drawing overlay: <canvas> (pointer events) → PNG + centroid hit-test
├─ State: conversation[], currentHtml, config, designMd
└─ Router: fast model → intent → pipeline

Generated app (single HTML file inside iframe)
├─ Tailwind CDN + Alpine.js CDN
├─ data-component tags on every region (hit-test map)
├─ CSS variables for theme (--brand, --brand-soft)
└─ config object = the model's edit surface; app logic hand-written once
```

**Model tiers**
- **Fast/small model:** intent routing, proposal, config generation, "config-vs-code" triage.
- **Big/vision model:** annotated-screenshot edits only. Prompted to return *only* modified `data-component` blocks in fenced sections.

**Latency principles (non-negotiable)**
1. Never regenerate; always patch.
2. Config changes > code changes; route down whenever possible.
3. Stream everything; shimmer the target region within 500ms.
4. Parallel calls for variants (2 options = 1 wall-clock cost).
5. Small prompts: one component file + screenshot, not the whole app.

## 9. design.md (contract, written in H1)

Structured tokens file — brand colors as CSS variables, radius/spacing/type scale, component recipes (Card, PrimaryBtn, Input), and rules (mobile-first `max-w-md`, no raw hex, header/content/sticky-action layout). Pasted into every model call; skeletons comply by construction. Prevents visual drift across edits.

## 10. Skeletons (2, hand-built, polished)

1. **Tracker / ledger** (list + add form + computed summary) — covers expense split, chores, inventory, habit log.
2. **Collector / form** (form + submissions list) — covers signups, RSVPs, surveys, requests.

Each: seeded demo rows, `data-component` tags, config-driven fields/labels/summary. A third skeleton is explicitly cut in favor of design polish + rehearsal.

## 11. Hour-by-Hour Plan

| Hour | Deliverable | Exit criteria |
|------|-------------|---------------|
| H1 | Vite shell, phone frame, `srcdoc` render, skeleton #1 hardcoded, `design.md` written | App renders in frame |
| H2 | F1 + F2 + F3: problem → proposal → config call → live app | Demo moment #1 works end-to-end |
| H3–4 | F4: overlay, screenshot, hit-test, edit call, block swap. **Test on real phone by end of H4** | Circle + instruction changes the app on a phone |
| H5 | F5 router; latency polish (streaming, shimmer, model tiering) | Full multi-round loop works |
| H6 | Skeleton #2; F8 variants or F9 share (pick one first, other if time); F10 mic | Second demo path exists |
| H7 | Rehearse loop ×10; fix breaks; **record backup video**; hotspot fallback tested | Backup video exists |

## 12. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Touch drawing scrolls instead of draws | **Demo-fatal** | Pointer Events + `touch-action:none`; real-phone test at H4, not H6.5 |
| Edit call returns broken HTML | High | Block-swap (skeleton logic untouched); fall back to previous `currentHtml` on parse failure |
| Venue wifi dies | High | Phone hotspot + LAN IP; recorded backup video |
| Edit latency > 10s | High | Component-scoped prompts, streaming, shimmer; if still slow, demo config-tier edits only |
| Scope creep (voice, 3rd skeleton, image gen) | High | This PRD. P2 items are pitch-only |
| Multi-round router half-works | Medium | Build single-round loop end-to-end first; router is H5, not H2 |

## 13. Success Criteria

- **Ship:** the 90-second demo loop runs 10/10 times in rehearsal.
- **Stage:** at least one judge interaction (their problem, their drawing, or their phone via QR).
- **Pitch lands:** "opinionated, problem-first, sketch-and-talk" is repeated back by a judge.

## 14. Out of Scope (say no fast)

Multi-page apps, databases, auth, native builds, arbitrary codegen, image generation, real CI/CD, editing generated JS logic (config + presentation only).
