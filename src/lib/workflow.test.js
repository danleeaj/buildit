import { describe, expect, test } from "bun:test";
import {
  WORKFLOW_PHASES,
  createInitialWorkflow,
  workflowReducer,
} from "./workflow.js";

describe("workflowReducer", () => {
  test("moves a submitted problem to proposal generation", () => {
    const next = workflowReducer(createInitialWorkflow(), {
      type: "PROBLEM_SUBMITTED",
      problem: "Our badminton group forgets who paid.",
    });
    expect(next.phase).toBe(WORKFLOW_PHASES.DISCOVERING);
    expect(next.problem).toContain("badminton");
    expect(next.activity).toHaveLength(1);
  });

  test("can skip intake and continue directly to a proposal", () => {
    const submitted = workflowReducer(createInitialWorkflow(), {
      type: "PROBLEM_SUBMITTED",
      problem: "Help me track our badminton court payments.",
    });
    const next = workflowReducer(submitted, { type: "INTAKE_SKIPPED" });
    expect(next.phase).toBe(WORKFLOW_PHASES.PROPOSING);
    expect(next.intakeQuestions).toEqual([]);
  });

  test("keeps two intake answers before proposing", () => {
    const questions = [
      { id: "priority", question: "What matters most?", options: ["A", "B"] },
      { id: "rhythm", question: "How often?", options: ["Daily", "Weekly"] },
    ];
    const submitted = workflowReducer(createInitialWorkflow(), {
      type: "PROBLEM_SUBMITTED",
      problem: "I need help with my budget.",
    });
    const ready = workflowReducer(submitted, { type: "INTAKE_READY", questions });
    const first = workflowReducer(ready, {
      type: "INTAKE_ANSWERED",
      question: questions[0],
      answer: "A",
    });
    const final = workflowReducer(first, {
      type: "INTAKE_ANSWERED",
      question: questions[1],
      answer: "Weekly",
    });
    expect(first.phase).toBe(WORKFLOW_PHASES.ANSWERING_INTAKE);
    expect(first.intakeIndex).toBe(1);
    expect(final.phase).toBe(WORKFLOW_PHASES.PROPOSING);
    expect(final.intakeAnswers).toEqual([
      { id: "priority", question: "What matters most?", answer: "A" },
      { id: "rhythm", question: "How often?", answer: "Weekly" },
    ]);
  });

  test("restores a previous valid app", () => {
    const state = createInitialWorkflow({ appId: "app-1", html: "<!doctype html>" });
    expect(state.phase).toBe(WORKFLOW_PHASES.READY);
    expect(state.appId).toBe("app-1");
  });

  test("loads a persisted project into a ready workflow", () => {
    const next = workflowReducer(createInitialWorkflow(), {
      type: "PROJECT_LOADED",
      project: {
        id: "project-1",
        html: "<!doctype html><html><head></head><body></body></html>",
        problem: "Track court costs.",
        config: { appId: "app-court" },
        conversation: [{ id: "seed", role: "system", text: "Demo", kind: "status" }],
      },
    });
    expect(next.phase).toBe(WORKFLOW_PHASES.READY);
    expect(next.appId).toBe("app-court");
    expect(next.activity).toHaveLength(1);
  });

  test("an error returns to the preserved ready app", () => {
    const ready = createInitialWorkflow({ appId: "app-1", html: "valid" });
    const failed = workflowReducer(ready, { type: "ERROR", error: "No connection" });
    const recovered = workflowReducer(failed, { type: "CLEAR_ERROR" });
    expect(recovered.phase).toBe(WORKFLOW_PHASES.READY);
    expect(recovered.html).toBe("valid");
  });
});
